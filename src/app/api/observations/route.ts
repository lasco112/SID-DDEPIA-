/**
 * Les observations sur une donnée précise du rapport mensuel (voir
 * server/observations.ts).
 *
 *   POST /api/observations   { action: "signaler", famille, saisieId, texte }   — chef de section (sa section) ou DD
 *   POST /api/observations   { action: "repondre", observationId, texte }       — DA ou agent de l'arrondissement
 *   POST /api/observations   { action: "clore", observationId }                 — l'auteur, ou le DD
 *
 * Signaler une donnée d'un rapport déjà transmis le RENVOIE au DA (sinon il ne
 * pourrait rien corriger), avec déverrouillage après la date limite — comme
 * le renvoi par le DD. Aucune valeur saisie n'est modifiée.
 */
import { NextResponse } from "next/server";
import type { PrismaClient } from "@prisma/client";
import { requireUser, assertProprietaireSection, permissionErrorResponse, ROLES_CHEF, assertRole } from "@/lib/permissions";
import { assertPeriodeModifiable } from "@/server/periodes/gel";
import { notifierEvenement } from "@/server/notifications/evenements";
import type { DetailsObservation } from "@/server/observations";
import type { DetailsObservationT, CibleTrimestre } from "@/server/observationsTrimestre";
import { trimestrielle } from "@/server/periodes/calendrier";
import { periodeTrimestrielle } from "@/server/trimestre/rubriques";
import { tableauDe, grille } from "@/server/trimestre/saisieTrimestrielle";
import { axeTerritorial } from "@/server/trimestre/canevas/structure";
import { SECTIONS_CANEVAS, TABLEAUX_BAC, chefDeSection } from "@/server/trimestre/canevas/sections";
import { zonesTexte } from "@/server/trimestre/rapportCanevas";
import { arrondissementFige, renvoyer, sectionFigee, annulerValidationSection, codeSection } from "@/server/trimestre/circuit";
import { listerArrondissements } from "@/lib/arrondissements";
import type { SessionUser } from "@/lib/permissions";

interface CorpsTrimestre {
  type?: "case" | "analyse" | "texte";
  annee?: number;
  trimestre?: number;
  numero?: number;
  ligne?: string;
  colonne?: string;
  zone?: string;
}

/** Un chef de section, en toutes lettres. */
const CHEF_LISIBLE: Record<string, string> = { CHEF_BAC: "chef BAC", CHEF_PSA: "chef PSA", CHEF_SPAIH: "chef SPAIH", CHEF_SSV: "chef SSV" };

/**
 * Signaler, au trimestre : une case à son arrondissement (DD, ou chef BAC sur
 * ses tableaux), une analyse ou un texte du département à son chef de
 * section (DD). Un rapport transmis est renvoyé ; une section validée
 * retrouve la main — sinon le destinataire ne pourrait rien corriger.
 */
async function signalerTrimestre(user: SessionUser, c: CorpsTrimestre, texte: string) {
  const db = user.db as PrismaClient;
  if (!texte) return erreur("Écrivez ce qui ne va pas : le destinataire doit savoir quoi vérifier.", 400);
  if (!c.annee || !c.trimestre) return erreur("Période non précisée.", 400);
  const periode = trimestrielle(c.annee, c.trimestre);
  const T = `T${c.trimestre} ${c.annee}`;
  let cible: CibleTrimestre;
  let destinataire: DetailsObservationT["destinataire"];

  if (c.type === "case") {
    assertRole(user, ["DD", "CHEF_BAC"]);
    const t = c.numero ? tableauDe(c.numero) : undefined;
    if (!t || c.ligne == null || !c.colonne) return erreur("Case inconnue.", 400);
    if (user.role === "CHEF_BAC" && !TABLEAUX_BAC.has(c.numero!)) return erreur("Ce tableau n'est pas du ressort du BAC.", 403);
    const axe = axeTerritorial(t.bloc);
    const territoire = axe === "lignes" ? c.ligne : axe === "colonnes" ? c.colonne : null;
    const arr = territoire ? (await listerArrondissements(db)).find((a) => a.nom === territoire) : undefined;
    if (!arr) return erreur("Cette case relève du département, pas d'un arrondissement : corrigez-la vous-même.", 400);
    const g = await grille(db, periode, { role: "DD" }, c.numero!);
    const l = g?.lignes.find((x) => x.cle === c.ligne);
    const k = l?.cases.find((x) => x.colonne === c.colonne);
    if (!l || !k) return erreur("Case inconnue.", 400);
    cible = {
      type: "case", numero: c.numero!, titreTableau: t.bloc.titre, ligne: c.ligne, colonne: c.colonne,
      libelle: `${l.libelle || l.cle} · ${c.colonne}`, valeur: k.saisi ?? k.affiche ?? "vide",
    };
    destinataire = { arrondissementId: arr.id, arrondissement: arr.nom };
  } else if (c.type === "analyse" || c.type === "texte") {
    assertRole(user, ["DD"]);
    let chef: string;
    if (c.type === "analyse") {
      const t = c.numero ? tableauDe(c.numero) : undefined;
      const section = t ? SECTIONS_CANEVAS.find((s) => s.blocs.includes(t.bloc)) : undefined;
      if (!t || !section) return erreur("Tableau inconnu.", 400);
      chef = chefDeSection(section.cle);
      cible = { type: "analyse", numero: c.numero!, titreTableau: t.bloc.titre, libelle: `Analyse du tableau ${c.numero} — ${t.bloc.titre}` };
    } else {
      const z = zonesTexte({ arrondissement: false }).find((x) => x.cle === c.zone);
      if (!z) return erreur("Rubrique inconnue.", 400);
      chef = chefDeSection(z.sectionCle, z.cle);
      cible = { type: "texte", zone: z.cle, libelle: `Rubrique « ${z.contexte} »` };
    }
    destinataire = { chef };
  } else {
    return erreur("Que signalez-vous ?", 400);
  }

  const details: DetailsObservationT = {
    annee: c.annee, trimestre: c.trimestre, cible, destinataire, texte, auteurNom: user.username, auteurRole: user.role,
  };
  await db.auditLog.create({
    data: { userId: user.id, action: "OBSERVATION_T", entite: "Trimestre", entiteId: `${c.annee}-${c.trimestre}`, details: details as object },
  });

  const periodeId = await periodeTrimestrielle(db, periode);
  let rouvert = false;
  if ("arrondissementId" in destinataire) {
    if (await arrondissementFige(db, periode, destinataire.arrondissementId)) {
      await renvoyer(db, user.transaction, periodeId, periode, destinataire.arrondissementId, `Observation — ${cible.libelle} : ${texte}`, user.id);
      rouvert = true;
    }
    await notifierEvenement(db, { arrondissementId: destinataire.arrondissementId, saufUserId: user.id }, {
      declencheur: "OBSERVATION",
      message:
        `Observation ${DU_ROLE[user.role] ?? `de ${user.username}`} sur votre rapport trimestriel ${T} — tableau ${cible.type === "case" ? cible.numero : ""}, « ${cible.libelle} » : ${texte}` +
        (rouvert ? " Le rapport vous est renvoyé pour correction." : ""),
      lien: "/a-corriger",
    });
  } else {
    if (await sectionFigee(db, periode, destinataire.chef)) {
      const code = codeSection(destinataire.chef);
      if (code) await annulerValidationSection(user.transaction, periodeId, code);
      rouvert = true;
    }
    await notifierEvenement(db, { roles: [destinataire.chef as never] }, {
      declencheur: "OBSERVATION",
      message:
        `Observation du Délégué Départemental sur le rapport trimestriel ${T} — ${cible.libelle} : ${texte}` +
        (rouvert ? " La validation de votre section est levée pour que vous puissiez corriger." : ""),
      lien: "/a-corriger",
    });
  }
  return NextResponse.json({ ok: true, rouvert });
}

/** Répondre (le destinataire) ou clore (l'auteur, ou le DD) une observation du trimestre. */
async function suiteTrimestre(
  user: SessionUser,
  o: { id: string; userId: string | null; details: unknown },
  action: "repondre" | "clore",
  texte: string
) {
  const db = user.db as PrismaClient;
  const d = o.details as DetailsObservationT;
  if (action === "repondre") {
    const pourMoi =
      "arrondissementId" in d.destinataire
        ? (user.role === "DA" || user.role === "AGENT_SAISIE") && user.arrondissementId === d.destinataire.arrondissementId
        : user.role === d.destinataire.chef;
    if (!pourMoi) return erreur("Cette observation ne vous est pas adressée.", 403);
    if (!texte) return erreur("Expliquez votre réponse : l'auteur la lira.", 400);
    await db.auditLog.create({ data: { userId: user.id, action: "OBSERVATION_REPONSE", entite: "Observation", entiteId: o.id, details: { texte } } });
    if (o.userId) {
      const qui = "arrondissement" in d.destinataire ? d.destinataire.arrondissement : `Le ${CHEF_LISIBLE[d.destinataire.chef] ?? d.destinataire.chef}`;
      await notifierEvenement(db, { userIds: [o.userId] }, {
        declencheur: "OBSERVATION_REPONSE",
        message: `${qui} répond à votre observation (rapport trimestriel T${d.trimestre} ${d.annee}, « ${d.cible.libelle} ») : ${texte}`,
        lien: "/a-corriger",
      });
    }
    return NextResponse.json({ ok: true });
  }
  if (user.id !== o.userId && user.role !== "DD") return erreur("Seul l'auteur de l'observation (ou le DD) la clôt.", 403);
  await db.auditLog.create({ data: { userId: user.id, action: "OBSERVATION_CLOSE", entite: "Observation", entiteId: o.id } });
  return NextResponse.json({ ok: true });
}

const NOMS_MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const moisDe = (p: { mois: number | null; annee: number }) => (p.mois ? `${NOMS_MOIS[p.mois - 1]} ${p.annee}` : String(p.annee));
/** « Observation du chef PSA », « … du Délégué Départemental ». */
const DU_ROLE: Record<string, string> = {
  DD: "du Délégué Départemental",
  CHEF_BAC: "du chef BAC",
  CHEF_SSV: "du chef SSV",
  CHEF_PSA: "du chef PSA",
  CHEF_SPAIH: "du chef SPAIH",
};
const erreur = (message: string, status: number) => NextResponse.json({ message }, { status });

/** La case visée, telle que le chef la voit : tableau, libellé, valeur, rapport. */
async function caseVisee(db: PrismaClient, famille: string, saisieId: string) {
  const rapportSel = {
    select: {
      id: true, statut: true, periodeId: true, arrondissementId: true, deverrouillePar: true,
      periode: { select: { mois: true, annee: true, statut: true } },
    },
  } as const;
  if (famille === "MATRICE") {
    const s = await db.saisieMatrice.findUnique({ where: { id: saisieId }, include: { field: { include: { template: true } }, rapport: rapportSel } });
    if (!s) return null;
    return {
      rapport: s.rapport, sectionId: s.field.template.sectionId, templateCode: s.field.template.code, numero: s.field.template.numero, titre: s.field.template.titre,
      fieldCode: s.fieldCode, etablissementId: null, clientId: null, libelle: s.field.libelle,
      valeur: s.nonRenseigne ? "N/D" : s.valeur == null ? (s.valeurTexte ?? "vide") : String(s.valeur),
    };
  }
  if (famille === "NOMINATIF") {
    const s = await db.saisieNominative.findUnique({
      where: { id: saisieId },
      include: { template: { include: { fields: { select: { code: true, libelle: true } } } }, etablissement: { select: { nom: true } }, rapport: rapportSel },
    });
    if (!s) return null;
    const champ = s.template.fields.find((f) => f.code === s.fieldCode)?.libelle ?? s.fieldCode;
    return {
      rapport: s.rapport, sectionId: s.template.sectionId, templateCode: s.template.code, numero: s.template.numero, titre: s.template.titre,
      fieldCode: s.fieldCode, etablissementId: s.etablissementId, clientId: null, libelle: `${s.etablissement?.nom ?? "Établissement"} — ${champ}`,
      valeur: s.nonRenseigne ? "N/D" : s.valeur == null ? (s.valeurTexte ?? "vide") : String(s.valeur),
    };
  }
  if (famille === "EVENEMENT") {
    const s = await db.saisieEvenement.findUnique({ where: { id: saisieId }, include: { template: true, rapport: rapportSel } });
    if (!s) return null;
    return {
      rapport: s.rapport, sectionId: s.template.sectionId, templateCode: s.template.code, numero: s.template.numero, titre: s.template.titre,
      fieldCode: null, etablissementId: null, clientId: s.clientId, libelle: "Une ligne du tableau",
      valeur: Object.values((s.payload as Record<string, unknown>) ?? {}).filter((v) => v != null && v !== "").join(" · ").slice(0, 120),
    };
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const db = user.db;
    const corps = (await req.json().catch(() => ({}))) as {
      action?: string; famille?: string; saisieId?: string; texte?: string; observationId?: string;
    };
    const texte = (corps.texte ?? "").trim().slice(0, 600);

    // ------------------------------------------------------------ signaler
    if (corps.action === "signaler") {
      assertRole(user, [...ROLES_CHEF, "DD"]);
      if (!texte) return erreur("Écrivez ce qui ne va pas : le DA doit savoir quoi vérifier.", 400);
      const c = await caseVisee(db as PrismaClient, corps.famille ?? "", corps.saisieId ?? "");
      if (!c) return erreur("Donnée introuvable.", 404);
      if (user.role !== "DD") assertProprietaireSection(user, c.sectionId);
      await assertPeriodeModifiable(db, c.rapport.periodeId);

      const details: DetailsObservation = {
        famille: corps.famille as DetailsObservation["famille"],
        saisieId: corps.saisieId!,
        templateCode: c.templateCode, numero: c.numero, titre: c.titre,
        fieldCode: c.fieldCode, etablissementId: c.etablissementId, clientId: c.clientId,
        libelle: c.libelle, valeur: c.valeur, texte,
        auteurNom: user.username, auteurRole: user.role,
      };
      const obs = await db.auditLog.create({
        data: { userId: user.id, action: "OBSERVATION", entite: "RapportArrondissement", entiteId: c.rapport.id, details: details as object },
      });

      // Un rapport transmis est fermé : il est renvoyé, sinon le DA ne pourrait rien corriger.
      let renvoye = false;
      if (c.rapport.statut === "SOUMIS") {
        const deverrouiller = c.rapport.periode.statut === "VERROUILLEE_DA" && !c.rapport.deverrouillePar;
        await db.rapportArrondissement.update({
          where: { id: c.rapport.id },
          data: {
            statut: "REJETE",
            motifRejet: `Observation ${DU_ROLE[user.role] ?? `de ${user.username}`} — tableau ${c.numero}, ${c.libelle} : ${texte}`,
            ...(deverrouiller ? { deverrouillePar: user.id, motifDeverrouillage: "Renvoi pour observation", dateDeverrouillage: new Date() } : {}),
          },
        });
        await db.auditLog.create({
          data: { userId: user.id, action: "REJET", entite: "RapportArrondissement", entiteId: c.rapport.id, details: { motif: texte, observation: obs.id } },
        });
        renvoye = true;
      }

      await notifierEvenement(
        db as PrismaClient,
        { arrondissementId: c.rapport.arrondissementId, saufUserId: user.id },
        {
          declencheur: "OBSERVATION",
          message:
            `Observation ${DU_ROLE[user.role] ?? `de ${user.username}`} sur votre rapport de ${moisDe(c.rapport.periode)} — tableau ${c.numero}, « ${c.libelle} » (${c.valeur}) : ${texte}` +
            (renvoye ? " Le rapport vous est renvoyé pour correction." : ""),
          lien: "/a-corriger",
        }
      );
      return NextResponse.json({ ok: true, renvoye });
    }

    // ------------------------------------------------------------ signaler (trimestre)
    if (corps.action === "signaler_t") {
      return await signalerTrimestre(user, corps as CorpsTrimestre, texte);
    }

    // ------------------------------------------------------------ répondre / clore
    if (corps.action === "repondre" || corps.action === "clore") {
      const o = await db.auditLog.findUnique({ where: { id: corps.observationId ?? "" }, select: { id: true, action: true, entiteId: true, userId: true, details: true } });
      if (o?.action === "OBSERVATION_T") return await suiteTrimestre(user, o, corps.action, texte);
      if (!o || o.action !== "OBSERVATION" || !o.entiteId) return erreur("Observation introuvable.", 404);
      const rapport = await db.rapportArrondissement.findUnique({
        where: { id: o.entiteId },
        select: { arrondissementId: true, arrondissement: { select: { nom: true } }, periode: { select: { mois: true, annee: true } } },
      });
      if (!rapport) return erreur("Rapport introuvable.", 404);
      const d = o.details as unknown as DetailsObservation;

      if (corps.action === "repondre") {
        assertRole(user, ["DA", "AGENT_SAISIE"]);
        if (user.arrondissementId !== rapport.arrondissementId) return erreur("Cette observation ne concerne pas votre arrondissement.", 403);
        if (!texte) return erreur("Expliquez pourquoi le chiffre est juste : le chef lira votre réponse.", 400);
        await db.auditLog.create({ data: { userId: user.id, action: "OBSERVATION_REPONSE", entite: "Observation", entiteId: o.id, details: { texte } } });
        if (o.userId) {
          await notifierEvenement(
            db as PrismaClient,
            { userIds: [o.userId] },
            {
              declencheur: "OBSERVATION_REPONSE",
              message: `${rapport.arrondissement.nom} répond à votre observation (${moisDe(rapport.periode)}, tableau ${d.numero}, « ${d.libelle} ») : ${texte}`,
              lien: "/a-corriger",
            }
          );
        }
        return NextResponse.json({ ok: true });
      }

      // clore : l'auteur, ou le DD
      if (user.id !== o.userId && user.role !== "DD") return erreur("Seul l'auteur de l'observation (ou le DD) la clôt.", 403);
      await db.auditLog.create({ data: { userId: user.id, action: "OBSERVATION_CLOSE", entite: "Observation", entiteId: o.id } });
      return NextResponse.json({ ok: true });
    }

    return erreur("Action inconnue.", 400);
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}
