/**
 * Le circuit de validation du rapport trimestriel.
 *
 *   GET  /api/trimestre/circuit?annee=&trimestre=   l'état du circuit, et ce que CE profil peut faire
 *   POST /api/trimestre/circuit                      une étape :
 *        { action: "transmettre" }                              le DA, pour son arrondissement
 *        { action: "renvoyer", arrondissementId, motif }        un chef de section ou le DD
 *        { action: "valider" }                                  un chef de section, pour son domaine
 *        { action: "annuler", section? }                        le chef pour son domaine, ou le DD
 *
 * LE DD PREND LE RELAIS, motif obligatoire (comme au mensuel) :
 *        { action: "transmettre", arrondissementId, motif }     à la place d'un DA
 *        { action: "valider", section, motif }                  à la place d'un chef
 *        { action: "finaliser", motif }                         tout ce qui reste, d'un coup
 *
 * Le périmètre est lu sur la session, jamais reçu du client : un DA ne
 * transmet que SON arrondissement, un chef ne valide que SON domaine.
 */
import { NextResponse } from "next/server";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";
import { trimestrielle, libelleOfficiel, libelleCourt, memePeriodeAnneePrecedente } from "@/server/periodes/calendrier";
import {
  anPasseManquant, messageAnPasseManquant, nomArrondissement, erreursDeCoherence, messageErreursCoherence, type ErreurCoherence,
} from "@/server/trimestre/saisieTrimestrielle";
import type { Periode } from "@/server/periodes/calendrier";
import {
  ordresEnCours, donnerOrdreCorrection, revoquerOrdreCorrection, demandesEnCours, demanderOrdreCorrection,
  ouvrirRevisionPourTous, fermerRevisionPourTous, refuserDemande, bilanRevision, CHEFS_SOUS_ORDRE, estModeRevision,
} from "@/server/trimestre/ordresCorrection";
import { analysesARevoir, messageAnalysesARevoir } from "@/server/trimestre/analyse/ecranAnalyses";
import { periodeTrimestrielle } from "@/server/trimestre/rubriques";
import {
  etatCircuit, transmettre, renvoyer, validerSection, annulerValidationSection, codeSection, RefusCircuit, SECTIONS_CIRCUIT,
  transmettreParLeDD, validerSectionParLeDD, finaliserParLeDD, validerCorrectionsParLeDD, correctionsDepuisRenvoi,
} from "@/server/trimestre/circuit";

const ROLES = ["DD", "DA", "AGENT_SAISIE", "CHEF_BAC", "CHEF_PSA", "CHEF_SPAIH", "CHEF_SSV"] as const;

function periodeDe(annee: unknown, trimestre: unknown) {
  const a = Number(annee);
  const t = Number(trimestre);
  if (!Number.isInteger(a) || a < 2000 || a > 2100) return null;
  if (![1, 2, 3, 4].includes(t)) return null;
  return trimestrielle(a, t);
}

const erreur = (message: string, status: number) => NextResponse.json({ message }, { status });

/**
 * Aucune étape du circuit ne laisse passer des chiffres qui se contredisent
 * (décision du Délégué, 20 octobre 2026) — notamment après un mois corrigé,
 * qui peut défaire l'égalité entre les catégories du trimestre et le total
 * mensuel. Chacun ne bute que sur ce qui le concerne.
 */
const SUITE_ARRONDISSEMENT =
  "Corrigez-les dans « Saisir les tableaux du trimestre » (touchez la case grise pour voir, mois par mois, d'où vient le total), puis recommencez.";
const SUITE_CHEF =
  "Corrigez-les avant de valider — pendant la révision ouverte par le DD — ou signalez la case à l'arrondissement ; un total mensuel faux se corrige dans le mois. Pour un écart avec le BAC, le chef BAC confirme son chiffre ou le corrige.";
const SUITE_DD =
  "Renvoyez le rapport de l'arrondissement concerné ou ouvrez la révision des tableaux au chef de la section ; un total mensuel faux se corrige dans le mois (rouvrez-le s'il est clôturé). Un écart BAC / arrondissement se règle au BAC.";

type Filtre = { arrondissement: string | undefined } | { chef: string } | "tout";
function retenir(liste: ErreurCoherence[], filtre: Filtre): ErreurCoherence[] {
  if (filtre === "tout") return liste;
  // Un arrondissement répond de ses erreurs ; l'écart avec le BAC se tranche au BAC.
  if ("arrondissement" in filtre) return liste.filter((e) => e.genre === "erreur" && e.arrondissement === filtre.arrondissement);
  return liste.filter((e) => e.chef === filtre.chef);
}
async function refusIncoherent(db: Parameters<typeof erreursDeCoherence>[0], periode: Periode, filtre: Filtre, suite: string) {
  const restantes = retenir(await erreursDeCoherence(db, periode), filtre);
  return restantes.length ? erreur(messageErreursCoherence(restantes, suite), 409) : null;
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, [...ROLES]);
    const params = new URL(req.url).searchParams;
    const periode = periodeDe(params.get("annee"), params.get("trimestre"));
    if (!periode) return erreur("Période demandée invalide.", 400);
    const etat = await etatCircuit(user.db, periode);
    const sienne = etat.arrondissements.find((a) => a.id === user.arrondissementId) ?? null;
    const maSection = etat.sections.find((s) => s.chef === user.role) ?? null;
    // Ce que le DA doit encore inscrire pour l'an passé : affiché AVANT qu'il
    // ne touche « Transmettre », pour qu'il ne découvre pas le refus au dernier moment.
    const aCompleterAnPasse =
      user.role === "DA" && sienne && sienne.statut !== "TRANSMIS"
        ? await anPasseManquant(user.db, periode, { role: "DA", arrondissement: await nomArrondissement(user.db, user.arrondissementId) })
        : [];
    return NextResponse.json({
      periode: libelleOfficiel(periode),
      role: user.role,
      // Un DA et un agent ne voient que leur arrondissement. Le DD voit, pour
      // chaque rapport renvoyé, ce que l'arrondissement a corrigé depuis.
      arrondissements:
        user.role === "DA" || user.role === "AGENT_SAISIE"
          ? sienne ? [sienne] : []
          : user.role === "DD"
            ? await Promise.all(
                etat.arrondissements.map(async (a) =>
                  a.statut === "RENVOYE" && a.date
                    ? { ...a, corrections: await correctionsDepuisRenvoi(user.db, periode, a.id, new Date(a.date)) }
                    : a
                )
              )
            : etat.arrondissements,
      // Chaque domaine, avec sa révision : ouverte (et ce qui a déjà changé), ou demandée.
      sections: await (async () => {
        const [ordres, demandes] = await Promise.all([ordresEnCours(user.db, periode), demandesEnCours(user.db, periode)]);
        return Promise.all(
          etat.sections.map(async (s) => {
            const o = ordres.get(s.chef) ?? null;
            const voitBilan = o && (user.role === "DD" || user.role === s.chef);
            return {
              ...s,
              sousRevision: CHEFS_SOUS_ORDRE.includes(s.chef),
              ordre: o,
              demande: demandes.get(s.chef) ?? null,
              ...(voitBilan ? { bilan: await bilanRevision(user.db, periode, s.chef, new Date(o.ouverteLe)) } : {}),
            };
          })
        );
      })(),
      tousTransmis: etat.tousTransmis,
      complet: etat.complet,
      aCompleterAnPasse,
      // Les chiffres qui se contredisent, vus AVANT le bouton — chacun les siens.
      incoherences: retenir(
        await erreursDeCoherence(user.db, periode),
        user.role === "DD"
          ? "tout"
          : user.role === "DA" || user.role === "AGENT_SAISIE"
            ? { arrondissement: await nomArrondissement(user.db, user.arrondissementId) }
            : { chef: user.role }
      ).map((e) => ({ numero: e.numero, titre: e.titre, texte: e.texte, arrondissement: e.arrondissement })),
      periodeN1: libelleCourt(memePeriodeAnneePrecedente(periode)),
      peut: {
        transmettre: user.role === "DA" && sienne != null && sienne.statut !== "TRANSMIS",
        renvoyer: user.role === "DD" || user.role.startsWith("CHEF_"),
        valider: maSection != null && maSection.statut === "A_VALIDER",
        annulerSection: user.role === "DD" ? "toutes" : maSection?.statut === "VALIDE" ? maSection.code : null,
        // Le DD prend le relais d'un DA ou d'un chef défaillant.
        relaisDD: user.role === "DD",
      },
    });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return erreur(message, status);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, [...ROLES]);
    const body = (await req.json()) as {
      annee?: number; trimestre?: number; action?: string; arrondissementId?: string; motif?: string; section?: string;
      /** La révision : « relecture » ou « correction » (directe). */
      mode?: string;
    };
    const periode = periodeDe(body.annee, body.trimestre);
    if (!periode) return erreur("Période demandée invalide.", 400);
    const periodeId = await periodeTrimestrielle(user.db, periode);

    let details: Record<string, unknown> = {};
    switch (body.action) {
      case "transmettre": {
        if (user.role === "DD") {
          if (!body.arrondissementId) return erreur("Arrondissement non précisé.", 400);
          const refusDD = await refusIncoherent(user.db, periode, { arrondissement: await nomArrondissement(user.db, body.arrondissementId) }, SUITE_DD);
          if (refusDD) return refusDD;
          await transmettreParLeDD(user.db, user.transaction, periodeId, periode, body.arrondissementId, body.motif ?? "", user.id);
          details = { arrondissementId: body.arrondissementId, parLeDD: true, motif: body.motif };
          break;
        }
        // L'agent prépare, il ne transmet jamais — comme au mensuel.
        if (user.role !== "DA") return erreur("Seul le Délégué d'arrondissement transmet le rapport de son arrondissement.", 403);
        if (!user.arrondissementId) return erreur("Votre compte n'est rattaché à aucun arrondissement.", 400);
        // IMPÉRATIF (décision du Délégué, 15 octobre 2026) : le chiffre de l'an
        // passé que le SID n'a pas encore doit être inscrit avant de transmettre.
        const manquants = await anPasseManquant(user.db, periode, {
          role: "DA",
          arrondissement: await nomArrondissement(user.db, user.arrondissementId),
        });
        if (manquants.length) {
          return erreur(messageAnPasseManquant(manquants, libelleCourt(memePeriodeAnneePrecedente(periode))), 409);
        }
        // Une analyse « à revoir » (chiffres changés après validation) se reprend avant de transmettre.
        const aRevoirDA = await analysesARevoir(user.db, periode, { role: "DA", arrondissement: await nomArrondissement(user.db, user.arrondissementId) });
        if (aRevoirDA.length) return erreur(messageAnalysesARevoir(aRevoirDA), 409);
        const refusDA = await refusIncoherent(user.db, periode, { arrondissement: await nomArrondissement(user.db, user.arrondissementId) }, SUITE_ARRONDISSEMENT);
        if (refusDA) return refusDA;
        await transmettre(user.db, user.transaction, periodeId, periode, user.arrondissementId, user.id);
        details = { arrondissementId: user.arrondissementId };
        break;
      }
      // Après un renvoi : le DD juge les corrections du DA bonnes et valide le
      // rapport lui-même (20 octobre 2026).
      case "validerCorrections": {
        if (user.role !== "DD") return erreur("Seul le Délégué départemental valide les corrections d'un arrondissement.", 403);
        if (!body.arrondissementId) return erreur("Arrondissement non précisé.", 400);
        const refusCorr = await refusIncoherent(user.db, periode, { arrondissement: await nomArrondissement(user.db, body.arrondissementId) }, SUITE_DD);
        if (refusCorr) return refusCorr;
        await validerCorrectionsParLeDD(user.db, user.transaction, periodeId, periode, body.arrondissementId, body.motif ?? "", user.id);
        details = { arrondissementId: body.arrondissementId, parLeDD: true, correctionsValidees: true, commentaire: body.motif };
        break;
      }
      // LA RÉVISION DES TABLEAUX, ouverte et fermée par le DD (ordresCorrection.ts).
      case "ordonnerCorrection": {
        if (user.role !== "DD") return erreur("Seul le Délégué départemental ouvre la révision des tableaux.", 403);
        if (!body.section) return erreur("Section non précisée.", 400);
        const mode = estModeRevision(body.mode) ? body.mode : "correction";
        const r = await donnerOrdreCorrection(user.db, user.transaction, periodeId, periode, body.section, body.motif ?? "", user.id, mode);
        details = { section: body.section, motif: body.motif, mode, validationAnnulee: r.validationAnnulee };
        break;
      }
      case "ouvrirRevisionTous": {
        if (user.role !== "DD") return erreur("Seul le Délégué départemental ouvre la révision des tableaux.", 403);
        const mode = estModeRevision(body.mode) ? body.mode : "correction";
        details = { sections: await ouvrirRevisionPourTous(user.db, user.transaction, periodeId, periode, body.motif ?? "", user.id, mode), motif: body.motif, mode };
        break;
      }
      // Le chef demande lui-même l'ouverture au DD (21 octobre 2026).
      case "demanderOrdre": {
        await demanderOrdreCorrection(user.db, periode, user.role, body.motif ?? "", user.id);
        details = { chef: user.role, motif: body.motif };
        break;
      }
      case "refuserDemande": {
        if (user.role !== "DD") return erreur("Seul le Délégué départemental répond à une demande de révision.", 403);
        if (!body.section) return erreur("Section non précisée.", 400);
        await refuserDemande(user.db, periode, body.section, body.motif ?? "", user.id);
        details = { section: body.section, motif: body.motif };
        break;
      }
      case "revoquerOrdre": {
        if (user.role !== "DD") return erreur("Seul le Délégué départemental ferme la révision des tableaux.", 403);
        if (!body.section) return erreur("Section non précisée.", 400);
        const bilan = await revoquerOrdreCorrection(user.db, periode, body.section, user.id);
        details = { section: body.section, cases: bilan?.cases ?? 0 };
        break;
      }
      case "fermerRevisionTous": {
        if (user.role !== "DD") return erreur("Seul le Délégué départemental ferme la révision des tableaux.", 403);
        details = { sections: await fermerRevisionPourTous(user.db, periode, user.id) };
        break;
      }
      case "renvoyer": {
        if (user.role !== "DD" && !user.role.startsWith("CHEF_")) {
          return erreur("Seuls un chef de section ou le Délégué départemental renvoient un rapport.", 403);
        }
        if (!body.arrondissementId) return erreur("Arrondissement non précisé.", 400);
        await renvoyer(user.db, user.transaction, periodeId, periode, body.arrondissementId, body.motif ?? "", user.id);
        details = { arrondissementId: body.arrondissementId, motif: body.motif };
        break;
      }
      case "valider": {
        if (user.role === "DD") {
          if (!body.section) return erreur("Domaine non précisé.", 400);
          const chefDuDomaine = SECTIONS_CIRCUIT.find((s) => s.code === body.section)?.chef;
          const aRevoirDomaine = chefDuDomaine ? await analysesARevoir(user.db, periode, { role: chefDuDomaine }) : [];
          if (aRevoirDomaine.length) return erreur(messageAnalysesARevoir(aRevoirDomaine), 409);
          if (chefDuDomaine) {
            const refusDomaine = await refusIncoherent(user.db, periode, { chef: chefDuDomaine }, SUITE_DD);
            if (refusDomaine) return refusDomaine;
          }
          await validerSectionParLeDD(user.db, user.transaction, periodeId, body.section, body.motif ?? "", user.id);
          // La section validée : sa révision se ferme, les DA reçoivent le bilan.
          await revoquerOrdreCorrection(user.db, periode, body.section, user.id, "validation");
          details = { section: body.section, parLeDD: true, motif: body.motif };
          break;
        }
        if (!user.role.startsWith("CHEF_")) return erreur("Seul un chef de section valide un domaine du rapport.", 403);
        const aRevoirChef = await analysesARevoir(user.db, periode, { role: user.role });
        if (aRevoirChef.length) return erreur(messageAnalysesARevoir(aRevoirChef), 409);
        const refusChef = await refusIncoherent(user.db, periode, { chef: user.role }, SUITE_CHEF);
        if (refusChef) return refusChef;
        await validerSection(user.db, user.transaction, periodeId, periode, user.role, user.id);
        // Le chef a fini : sa révision se ferme d'elle-même, le DD et les DA en reçoivent le bilan.
        const code = codeSection(user.role);
        if (code) await revoquerOrdreCorrection(user.db, periode, code, user.id, "validation");
        details = { section: code };
        break;
      }
      case "annuler": {
        // Le chef annule SA validation ; le DD peut annuler celle de n'importe quel domaine.
        const code = user.role === "DD" ? body.section : codeSection(user.role);
        if (!code || !SECTIONS_CIRCUIT.some((s) => s.code === code)) return erreur("Domaine non précisé.", 400);
        if (user.role !== "DD" && !user.role.startsWith("CHEF_")) return erreur("Action non permise.", 403);
        await annulerValidationSection(user.transaction, periodeId, code);
        details = { section: code };
        break;
      }
      case "finaliser": {
        if (user.role !== "DD") return erreur("Seul le Délégué départemental finalise le rapport à la place des autres.", 403);
        const aRevoirDep = await analysesARevoir(user.db, periode, { role: "DD" });
        if (aRevoirDep.length) return erreur(messageAnalysesARevoir(aRevoirDep), 409);
        const refusFinal = await refusIncoherent(user.db, periode, "tout", SUITE_DD);
        if (refusFinal) return refusFinal;
        details ={ ...(await finaliserParLeDD(user.db, user.transaction, periodeId, periode, body.motif ?? "", user.id)), motif: body.motif, parLeDD: true };
        // Tout est validé : les révisions encore ouvertes se ferment.
        for (const o of Array.from((await ordresEnCours(user.db, periode)).values())) {
          await revoquerOrdreCorrection(user.db, periode, o.section, user.id, "validation");
        }
        break;
      }
      default:
        return erreur("Action inconnue.", 400);
    }

    await user.db.auditLog.create({
      data: {
        userId: user.id,
        action: `CIRCUIT_TRIMESTRE_${String(body.action).toUpperCase()}`,
        entite: "CircuitTrimestre",
        entiteId: `${periode.annee}-T${periode.rang}`,
        details: { ...details, periode: libelleOfficiel(periode) } as object,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof RefusCircuit) return erreur(e.message, 409);
    const { status, message } = permissionErrorResponse(e);
    return erreur(message, status);
  }
}
