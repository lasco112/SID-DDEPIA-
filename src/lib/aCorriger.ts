/**
 * « À corriger » — TOUS les points à corriger de la personne connectée, en
 * une seule liste, dans l'ordre du travail, chacun avec l'endroit exact où
 * aller (demande du Délégué, 1er octobre 2026 : « aller directement là où il
 * y a le problème, et s'il y en a plusieurs, naviguer de façon fluide et
 * ordonnée »).
 *
 * Lu SUR L'APPAREIL d'abord, pour que la liste existe sans réseau :
 *  - les saisies du mensuel refusées (statut ERREUR_SYNCHRO, avec le motif) ;
 *  - les valeurs reprises du mois précédent non confirmées ;
 *  - les avertissements des grilles du trimestre (copies gardées) ;
 *  - les analyses « chiffres modifiés : à revoir » ;
 *  - les écritures du trimestre refusées par le serveur.
 * Puis, quand le réseau répond, ce que seul le serveur sait (/api/a-corriger).
 *
 * LECTURE SEULE : rien ici n'écrit une donnée. Un point disparaît de la liste
 * quand sa cause disparaît — jamais parce qu'on l'a « coché ».
 */
import { offlineDB, type SaisieOffline } from "@/lib/dexie";
import { trimestreARapporter } from "@/lib/trimestreEchu";
import { etapesTrimestrielles } from "@/lib/navItems";
import { avecCible, cibleMensuelle, cibleTrimestrielle, jeton } from "@/lib/surlignage";
import type { ReponseACorriger } from "@/app/api/a-corriger/route";

export type Gravite = "bloquant" | "a_verifier";

export interface PointACorriger {
  /** Stable d'un calcul à l'autre : le parcours s'y retrouve. */
  id: string;
  gravite: Gravite;
  rapport: "mensuel" | "trimestriel";
  /** « Mensuel · Septembre 2026 · 1.1 Effectif du cheptel ». */
  ou: string;
  /** Ce qui ne va pas, en une phrase. */
  quoi: string;
  /** Ce qu'il faut faire. */
  faire: string;
  /** L'écran, avec la cible à encadrer. */
  lien: string;
  /** Le mois du mensuel à ouvrir d'abord, s'il n'est pas le mois de travail de l'appareil. */
  periodeId?: string;
  /** Une demande au DD est possible (rapport transmis, mois verrouillé ou clôturé). */
  demande?: { periodeId: string; tableaux: string[]; libelle?: string };
  /** Clé de tri : l'ordre du travail. */
  ordre: (number | string)[];
}

const NOMS_MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const libelleMois = (annee: number, mois: number) => `${majuscule(NOMS_MOIS[mois - 1] ?? "?")} ${annee}`;

/** La nature d'un refus du mensuel, lue dans le message gardé sur l'appareil. */
function natureDuRefus(message: string): "soumis" | "verrou" | "cloture" | "ligne" | "reseau" {
  if (/déjà soumis/i.test(message)) return "soumis";
  if (/clôturée/i.test(message)) return "cloture";
  if (/verrouill/i.test(message)) return "verrou";
  if (/^Refusée par le serveur/i.test(message)) return "ligne";
  return "reseau";
}

const CONSEIL: Record<ReturnType<typeof natureDuRefus>, { quoi: (n: number, mois: string) => string; faire: string; gravite: Gravite }> = {
  soumis: {
    quoi: (n, mois) => `${n} correction${n > 1 ? "s" : ""} n'${n > 1 ? "ont" : "a"} pas pu partir : le rapport de ${mois} était déjà transmis au DD.`,
    faire: "Demandez au DD de vous renvoyer ce rapport : vos corrections partiront alors toutes seules.",
    gravite: "bloquant",
  },
  verrou: {
    quoi: (n, mois) => `${n} saisie${n > 1 ? "s" : ""} bloquée${n > 1 ? "s" : ""} : le mois de ${mois} est verrouillé (date limite passée).`,
    faire: "Demandez au DD un déverrouillage exceptionnel : vos saisies partiront alors toutes seules.",
    gravite: "bloquant",
  },
  cloture: {
    quoi: (n, mois) => `${n} saisie${n > 1 ? "s" : ""} bloquée${n > 1 ? "s" : ""} : le mois de ${mois} est clôturé.`,
    faire: "Seul le DD peut rouvrir ce mois. Prévenez-le.",
    gravite: "bloquant",
  },
  ligne: {
    quoi: () => "",
    faire: "Corrigez la case encadrée en rouge : elle repartira toute seule.",
    gravite: "bloquant",
  },
  reseau: {
    quoi: (n) => `${n} saisie${n > 1 ? "s" : ""} pas encore envoyée${n > 1 ? "s" : ""} : le serveur n'a pas répondu.`,
    faire: "Rien à faire : elles repartiront toutes seules dès que le réseau sera bon.",
    gravite: "a_verifier",
  },
};

/** Le bouton de la demande au DD, selon ce qui bloque. */
const LIBELLE_DEMANDE = {
  soumis: "Demander au DD de me renvoyer ce rapport",
  verrou: "Demander au DD un déverrouillage",
  cloture: "Demander au DD de rouvrir ce mois",
} as const;

/** Ce que l'appareil sait du compte : nom, rôle, mois de travail. */
async function identite() {
  const meta = await offlineDB.meta.get("bootstrap").catch(() => undefined);
  return meta ? { username: meta.username, role: meta.role, periodeActiveId: meta.periodeActiveId } : null;
}

// --------------------------------------------------------------------------
// Ce que seul le serveur sait — gardé une minute, pour ne pas l'interroger à
// chaque rafraîchissement du compteur.
// --------------------------------------------------------------------------
let duServeur: { le: number; donnees: ReponseACorriger | null } | null = null;

async function lireServeur(forcer = false): Promise<ReponseACorriger | null> {
  if (!forcer && duServeur && Date.now() - duServeur.le < 60_000) return duServeur.donnees;
  if (typeof navigator !== "undefined" && !navigator.onLine) return duServeur?.donnees ?? null;
  try {
    const r = await fetch("/api/a-corriger", { cache: "no-store" });
    const d = r.ok ? ((await r.json()) as ReponseACorriger) : null;
    duServeur = { le: Date.now(), donnees: d };
    return d;
  } catch {
    return duServeur?.donnees ?? null;
  }
}

/** Oublie la réponse du serveur : le prochain calcul la redemande (après une correction). */
export function oublierServeur() {
  duServeur = null;
  dernierCalcul = null;
}

// --------------------------------------------------------------------------
// Mensuel
// --------------------------------------------------------------------------

async function pointsMensuels(username: string, periodeActiveId: string | null, serveur: ReponseACorriger | null): Promise<PointACorriger[]> {
  const points: PointACorriger[] = [];
  const [tableaux, periodes, etablissements] = await Promise.all([
    offlineDB.tableaux.toArray(),
    offlineDB.periodes.toArray(),
    offlineDB.etablissements.toArray(),
  ]);
  const tableau = new Map(tableaux.map((t) => [t.code, t]));
  const nomEtab = new Map(etablissements.map((e) => [e.id, e.nom]));

  const moisDe = (periodeId: string) => {
    const s = serveur?.mensuel.find((m) => m.periodeId === periodeId);
    if (s) return { annee: s.annee, mois: s.mois };
    const p = periodes.find((x) => x.id === periodeId);
    return p?.mois ? { annee: p.annee, mois: p.mois } : null;
  };
  const libelle = (periodeId: string) => {
    const m = moisDe(periodeId);
    return m ? libelleMois(m.annee, m.mois) : "un autre mois";
  };
  const triMois = (periodeId: string) => {
    const m = moisDe(periodeId);
    return m ? m.annee * 100 + m.mois : 0;
  };
  const enAutreMois = (periodeId: string) => (periodeId && periodeId !== periodeActiveId ? periodeId : undefined);

  // 1. Les saisies refusées, regroupées par mois, tableau et nature du refus.
  //    Pendant un nouvel essai, elles passent « en attente » mais gardent leur
  //    motif : elles restent à corriger tant que le serveur ne les a pas prises
  //    (sans quoi la barre du bas annonçait « tout est corrigé » une seconde).
  const refusees = await offlineDB.saisies
    .where("[username+statutLocal]")
    .anyOf([username, "ERREUR_SYNCHRO"], [username, "SYNCHRO_EN_ATTENTE"])
    .filter((s) => s.statutLocal === "ERREUR_SYNCHRO" || Boolean(s.erreurSynchro))
    .toArray()
    .catch(() => [] as SaisieOffline[]);
  const groupes = new Map<string, SaisieOffline[]>();
  for (const s of refusees) {
    const nature = natureDuRefus(s.erreurSynchro ?? "");
    // Un refus « ligne » a son motif propre : un point par motif.
    const cle = [s.periodeId, s.templateCode, nature, nature === "ligne" ? s.erreurSynchro ?? "" : ""].join("¦");
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle)!.push(s);
  }
  for (const [cle, liste] of Array.from(groupes.entries())) {
    const [periodeId, templateCode, nature] = cle.split("¦") as [string, string, ReturnType<typeof natureDuRefus>];
    const t = tableau.get(templateCode);
    const nomTableau = t ? `${t.numero} ${t.titre}` : templateCode;
    const mois = libelle(periodeId);
    const conseil = CONSEIL[nature];
    const cibles = liste.map((s) =>
      s.famille === "MATRICE" && s.fieldCode
        ? cibleMensuelle.champ(s.fieldCode)
        : s.famille === "NOMINATIF" && s.etablissementId && s.fieldCode
          ? cibleMensuelle.caseNominative(s.etablissementId, s.fieldCode)
          : cibleMensuelle.evenement(s.clientId)
    );
    // Où, précisément : la ligne (ou l'établissement) quand il n'y en a qu'une.
    const premiere = liste[0];
    const ligne =
      liste.length === 1
        ? premiere.famille === "MATRICE"
          ? t?.fields.find((f) => f.code === premiere.fieldCode)?.libelle
          : premiere.famille === "NOMINATIF"
            ? [nomEtab.get(premiere.etablissementId ?? ""), t?.fields.find((f) => f.code === premiere.fieldCode)?.libelle].filter(Boolean).join(", ")
            : undefined
        : `${liste.length} cases`;
    const motif = (premiere.erreurSynchro ?? "").replace(/^Refusée par le serveur : /i, "");
    points.push({
      id: `m-refus|${cle}`,
      gravite: conseil.gravite,
      rapport: "mensuel",
      ou: ["Mensuel", mois, nomTableau, ligne].filter(Boolean).join(" · "),
      quoi: nature === "ligne" ? `Refusé par le serveur : ${motif}` : conseil.quoi(liste.length, mois.toLowerCase()),
      faire: conseil.faire,
      lien: avecCible(`/da/saisie/${templateCode}`, cibles),
      periodeId: enAutreMois(periodeId),
      demande:
        nature === "soumis" || nature === "verrou" || nature === "cloture"
          ? { periodeId, tableaux: [nomTableau], libelle: LIBELLE_DEMANDE[nature] }
          : undefined,
      ordre: [0, triMois(periodeId), t?.ordre ?? 999, nature === "ligne" ? 0 : 1],
    });
  }

  // Les demandes au DD portent sur TOUS les tableaux bloqués du même mois.
  const parMois = new Map<string, Set<string>>();
  for (const p of points) if (p.demande) {
    if (!parMois.has(p.demande.periodeId)) parMois.set(p.demande.periodeId, new Set());
    p.demande.tableaux.forEach((x) => parMois.get(p.demande!.periodeId)!.add(x));
  }
  for (const p of points) if (p.demande) p.demande.tableaux = Array.from(parMois.get(p.demande.periodeId) ?? []);

  // 2. Un rapport mensuel renvoyé pour correction.
  for (const m of serveur?.mensuel ?? []) {
    if (m.statut !== "REJETE") continue;
    points.push({
      id: `m-renvoi|${m.periodeId}`,
      gravite: "bloquant",
      rapport: "mensuel",
      ou: `Mensuel · ${libelleMois(m.annee, m.mois)}`,
      quoi: `Votre rapport vous a été renvoyé pour correction${m.motifRejet ? ` : ${m.motifRejet}` : "."}`,
      faire: "Corrigez, puis cliquez « Envoyer au Délégué Départemental » pour le transmettre à nouveau.",
      lien: "/da/saisie",
      periodeId: enAutreMois(m.periodeId),
      ordre: [0, m.annee * 100 + m.mois, -1, 0],
    });
  }

  // 3. Les valeurs reprises du mois précédent non confirmées : le serveur fait
  //    foi ; sans réseau, ce que l'appareil en sait.
  const reprises: { periodeId: string; codes: string[] }[] = serveur
    ? serveur.mensuel.filter((m) => m.aConfirmer.length).map((m) => ({ periodeId: m.periodeId, codes: m.aConfirmer.map((t) => t.code) }))
    : await (async () => {
        if (!periodeActiveId) return [];
        const locales = await offlineDB.saisies
          .where("[username+periodeId+templateCode]")
          .between([username, periodeActiveId, ""], [username, periodeActiveId, "￿"])
          .filter((s) => Boolean(s.reporte))
          .toArray()
          .catch(() => [] as SaisieOffline[]);
        const codes = Array.from(new Set(locales.map((s) => s.templateCode)));
        return codes.length ? [{ periodeId: periodeActiveId, codes }] : [];
      })();
  for (const r of reprises) {
    const mois = libelle(r.periodeId);
    for (const code of r.codes) {
      const t = tableau.get(code);
      points.push({
        id: `m-reprise|${r.periodeId}|${code}`,
        gravite: "bloquant",
        rapport: "mensuel",
        ou: `Mensuel · ${mois} · ${t ? `${t.numero} ${t.titre}` : code}`,
        quoi: "Des chiffres sont repris du mois précédent et attendent votre confirmation : le rapport ne peut pas partir avant.",
        faire: "Vérifiez les cases en gris, corrigez ce qui a changé, puis cliquez « Confirmer ce tableau ».",
        lien: avecCible(`/da/saisie/${code}`, [jeton("confirmer")]),
        periodeId: enAutreMois(r.periodeId),
        ordre: [0, triMois(r.periodeId), t?.ordre ?? 999, 2],
      });
    }
  }
  return points;
}

// --------------------------------------------------------------------------
// Trimestriel
// --------------------------------------------------------------------------

interface CopieGrille {
  grille?: {
    numero: number;
    titre: string;
    lignes: { cle: string; libelle: string }[];
    avertissements: string[];
    alertes?: { texte: string; ligne?: string; colonne?: string }[];
  };
}
interface CopieAnalyses {
  analyses?: { numero: number; titre: string; statut: string }[];
}

async function pointsTrimestriels(username: string, role: string, serveur: ReponseACorriger | null): Promise<PointACorriger[]> {
  const points: PointACorriger[] = [];
  const { annee, trimestre } = trimestreARapporter();
  const q = `annee=${annee}&trimestre=${trimestre}`;
  const T = `T${trimestre} ${annee}`;
  const etapes = etapesTrimestrielles(role);
  const lienTextes = etapes.find((e) => /rubriques|textes/.test(e.href))?.href ?? "/trimestre/textes";

  // 1. Les écritures refusées par le serveur (rapport transmis entre-temps…).
  const file = await offlineDB.fileTrimestre.where("username").equals(username).toArray().catch(() => []);
  for (const op of file) {
    if (!op.refusee) continue;
    const [nature, , , numero, ligne, colonne] = op.cle.split("|");
    const lien =
      nature === "saisie"
        ? avecCible(`/trimestre/saisie?tableau=${numero}`, ligne != null && colonne != null ? [cibleTrimestrielle.case(ligne, colonne), cibleTrimestrielle.ligne(ligne)] : [])
        : nature === "analyse"
          ? `/trimestre/analyses?tableau=${numero}`
          : lienTextes;
    points.push({
      id: `t-file|${op.id}`,
      gravite: "bloquant",
      rapport: "trimestriel",
      ou: `Trimestriel · ${T} · ${op.libelle}`,
      quoi: `Enregistrement refusé par le serveur : ${op.erreur ?? "motif inconnu"}`,
      faire: "Ouvrez l'écran, refaites la modification si elle est encore permise, ou abandonnez-la dans la liste « en attente ».",
      lien,
      ordre: [1, nature === "saisie" ? 1 : nature === "analyse" ? 2 : 3, Number(numero) || 0, 0],
    });
  }

  // 2. Les avertissements des grilles (copies gardées par le téléphone).
  const prefixe = `${username}|/api/trimestre/saisie?${q}&tableau=`;
  const copies = await offlineDB.copiesTrimestre.where("cle").startsWith(prefixe).toArray().catch(() => []);
  for (const c of copies) {
    const g = (c.donnees as CopieGrille).grille;
    if (!g) continue;
    const alertes = g.alertes ?? g.avertissements.map((texte) => ({ texte }) as { texte: string; ligne?: string; colonne?: string });
    alertes.forEach((a, i) => {
      const ligne = a.ligne != null ? g.lignes.find((l) => l.cle === a.ligne) : undefined;
      const cibles = a.ligne != null ? [...(a.colonne ? [cibleTrimestrielle.case(a.ligne, a.colonne)] : []), cibleTrimestrielle.ligne(a.ligne)] : [];
      points.push({
        id: `t-alerte|${g.numero}|${a.texte}`,
        gravite: "a_verifier",
        rapport: "trimestriel",
        ou: [`Trimestriel · ${T} · Tableau ${g.numero} ${g.titre}`, ligne ? ligne.libelle || ligne.cle : undefined].filter(Boolean).join(" · "),
        quoi: a.texte,
        faire: "Vérifiez la ligne encadrée en rouge et corrigez le chiffre faux.",
        lien: avecCible(`/trimestre/saisie?tableau=${g.numero}`, cibles),
        ordre: [1, 1, g.numero, i],
      });
    });
  }

  // 3. Les analyses validées dont les chiffres ont changé depuis.
  const analyses = await offlineDB.copiesTrimestre.get(`${username}|/api/trimestre/analyses?${q}`).catch(() => undefined);
  for (const a of (analyses?.donnees as CopieAnalyses | undefined)?.analyses ?? []) {
    if (a.statut !== "a_revoir") continue;
    points.push({
      id: `t-analyse|${a.numero}`,
      gravite: "a_verifier",
      rapport: "trimestriel",
      ou: `Trimestriel · ${T} · Analyse du tableau ${a.numero} ${a.titre}`,
      quoi: "Les chiffres ont changé depuis que l'analyse a été validée.",
      faire: "Relisez la nouvelle analyse et validez-la à nouveau.",
      lien: `/trimestre/analyses?tableau=${a.numero}`,
      ordre: [1, 2, a.numero, 0],
    });
  }

  // 4. Le rapport trimestriel renvoyé au DA.
  if (serveur?.trimestreRenvoye) {
    const r = serveur.trimestreRenvoye;
    points.push({
      id: `t-renvoi|${r.annee}|${r.trimestre}`,
      gravite: "bloquant",
      rapport: "trimestriel",
      ou: `Trimestriel · T${r.trimestre} ${r.annee}`,
      quoi: `Votre rapport trimestriel vous a été renvoyé pour correction${r.motif ? ` : ${r.motif}` : "."}`,
      faire: "Corrigez, puis transmettez-le à nouveau au DD.",
      lien: "/trimestre/circuit",
      ordre: [1, 0, 0, 0],
    });
  }
  return points;
}

/** Pour le DD : les demandes de renvoi des DA. */
function pointsDuDD(serveur: ReponseACorriger | null, periodeActiveId: string | null): PointACorriger[] {
  return (serveur?.demandes ?? []).map((d) => ({
    periodeId: d.periodeId !== periodeActiveId ? d.periodeId : undefined,
    id: `dd-demande|${d.arrondissement}|${d.annee}|${d.mois}`,
    gravite: "bloquant" as const,
    rapport: "mensuel" as const,
    ou: `Mensuel · ${libelleMois(d.annee, d.mois)} · ${d.arrondissement}`,
    quoi: `${d.arrondissement} demande à pouvoir corriger son rapport : une correction n'a pas pu partir${d.tableaux.length ? ` (${d.tableaux.join(", ")})` : ""}.`,
    faire: "Dans la Supervision (sur ce mois), cliquez « Renvoyer au DA pour correction » — ou « Déverrouiller » — sur la ligne encadrée.",
    lien: avecCible("/dd/supervision", [jeton("arr", d.arrondissement)]),
    ordre: [0, d.annee * 100 + d.mois, d.arrondissement, 0],
  }));
}

/**
 * Phase 2 — ce qui empêche de produire le rapport départemental d'un mois dont
 * la date limite est passée (refus de « Générer le rapport définitif »).
 */
function pointsDeProduction(serveur: ReponseACorriger | null, role: string, periodeActiveId: string | null, deja: PointACorriger[]): PointACorriger[] {
  const points: PointACorriger[] = [];
  const autreMois = (id: string) => (id !== periodeActiveId ? id : undefined);
  const liste = (noms: string[]) => (noms.length <= 1 ? noms.join("") : `${noms.slice(0, -1).join(", ")} et ${noms[noms.length - 1]}`);
  for (const m of serveur?.production ?? []) {
    const mois = libelleMois(m.annee, m.mois);
    const ordre = [0, m.annee * 100 + m.mois, 900, 0];
    if (role === "DD") {
      const morceaux = [
        m.daManquants.length
          ? `${m.daManquants.length === 1 ? "1 arrondissement n'a" : `${m.daManquants.length} arrondissements n'ont`} pas transmis (${liste(m.daManquants)})`
          : null,
        m.sectionsNonValidees.length
          ? `${m.sectionsNonValidees.length === 1 ? "1 section n'a" : `${m.sectionsNonValidees.length} sections n'ont`} pas validé (${liste(m.sectionsNonValidees)})`
          : null,
      ].filter(Boolean);
      points.push({
        id: `dd-production|${m.periodeId}`,
        gravite: "bloquant",
        rapport: "mensuel",
        ou: `Mensuel · ${mois} · Rapport du département`,
        quoi: `Date limite passée, le rapport du département ne peut pas être produit : ${morceaux.join(" ; ")}.`,
        faire: m.daManquants.length
          ? `Relancez ${m.daManquants.length > 1 ? "les DA" : "le DA"}${m.verrouille ? " ; s'il a un motif valable, « Déverrouiller » sa ligne" : ""}. Pour une section, relancez le chef ou « Valider en tant que DD ».`
          : "Relancez le chef de section, ou cliquez « Valider en tant que DD » sur la ligne encadrée.",
        lien: avecCible("/dd/supervision", [...m.daManquants.map((a) => jeton("arr", a)), ...m.sectionsNonValidees.map((s) => jeton("section", s))]),
        periodeId: autreMois(m.periodeId),
        ordre,
      });
    } else if (role === "DA") {
      // Un rapport renvoyé a déjà son point : pas deux fois.
      if (deja.some((p) => p.id === `m-renvoi|${m.periodeId}`)) continue;
      points.push({
        id: `da-retard|${m.periodeId}`,
        gravite: "bloquant",
        rapport: "mensuel",
        ou: `Mensuel · ${mois}`,
        quoi: m.verrouille
          ? "Votre rapport n'est pas transmis et la date limite est passée : le mois est verrouillé."
          : "Votre rapport n'est pas transmis et la date limite est passée : le rapport du département attend le vôtre.",
        faire: m.verrouille
          ? "Demandez au DD un déverrouillage, puis cliquez « Envoyer au Délégué Départemental »."
          : "Terminez la saisie, puis cliquez « Envoyer au Délégué Départemental ».",
        lien: "/da/saisie",
        periodeId: autreMois(m.periodeId),
        demande: m.verrouille ? { periodeId: m.periodeId, tableaux: [], libelle: LIBELLE_DEMANDE.verrou } : undefined,
        ordre,
      });
    } else if (role.startsWith("CHEF_")) {
      points.push({
        id: `chef-validation|${m.periodeId}`,
        gravite: "bloquant",
        rapport: "mensuel",
        ou: `Mensuel · ${mois} · Contrôle de ma section`,
        quoi: "Les six arrondissements ont transmis et la date limite est passée : le rapport du département attend la validation de votre section.",
        faire: "Contrôlez les tableaux de votre section, puis cliquez « Valider ma section pour cette période ».",
        lien: avecCible("/section/controle", [jeton("valider-section")]),
        periodeId: autreMois(m.periodeId),
        ordre,
      });
    }
  }
  return points;
}

function comparer(a: PointACorriger, b: PointACorriger): number {
  for (let i = 0; i < Math.max(a.ordre.length, b.ordre.length); i++) {
    const x = a.ordre[i] ?? 0;
    const y = b.ordre[i] ?? 0;
    if (x === y) continue;
    return typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "fr");
  }
  return a.id.localeCompare(b.id);
}

// Le compteur, la barre du bas et la liste calculent en même temps : un seul
// calcul sert les trois.
let calculEnCours: Promise<PointACorriger[] | null> | null = null;
let dernierCalcul: { le: number; points: PointACorriger[] | null } | null = null;

/**
 * Tous les points à corriger de la personne connectée, dans l'ordre du travail.
 * `null` : l'appareil n'est pas encore prêt (première connexion en cours) —
 * surtout pas « rien à corriger ».
 */
export async function pointsACorriger(options: { forcerServeur?: boolean } = {}): Promise<PointACorriger[] | null> {
  if (!options.forcerServeur && dernierCalcul && Date.now() - dernierCalcul.le < 3_000) return dernierCalcul.points;
  if (calculEnCours) return calculEnCours;
  calculEnCours = calculer(options)
    .then((points) => {
      dernierCalcul = { le: Date.now(), points };
      return points;
    })
    .finally(() => {
      calculEnCours = null;
    });
  return calculEnCours;
}

async function calculer(options: { forcerServeur?: boolean }): Promise<PointACorriger[] | null> {
  const moi = await identite();
  if (!moi) return null;
  const serveur = await lireServeur(options.forcerServeur);
  const points: PointACorriger[] = [];
  if (moi.role === "DA" || moi.role === "AGENT_SAISIE") points.push(...(await pointsMensuels(moi.username, moi.periodeActiveId, serveur)));
  if (moi.role === "DD") points.push(...pointsDuDD(serveur, moi.periodeActiveId));
  points.push(...pointsDeProduction(serveur, moi.role, moi.periodeActiveId, points));
  points.push(...(await pointsTrimestriels(moi.username, moi.role, serveur)));
  return points.sort(comparer);
}

// --------------------------------------------------------------------------
// Le parcours : « Point 2 sur 4 · ← précédent · suivant → »
// --------------------------------------------------------------------------
const CLE_PARCOURS = "sid-a-corriger-parcours";

export interface Parcours {
  ids: string[];
  courant: string;
}

export function lireParcours(): Parcours | null {
  try {
    const brut = sessionStorage.getItem(CLE_PARCOURS);
    return brut ? (JSON.parse(brut) as Parcours) : null;
  } catch {
    return null;
  }
}

export function ecrireParcours(p: Parcours | null): void {
  try {
    if (p) sessionStorage.setItem(CLE_PARCOURS, JSON.stringify(p));
    else sessionStorage.removeItem(CLE_PARCOURS);
  } catch {
    // stockage indisponible : le parcours s'arrête, la liste reste
  }
  window.dispatchEvent(new Event(EVENEMENT_PARCOURS));
}

export const EVENEMENT_PARCOURS = "sid-a-corriger-parcours";

/** Ouvre l'écran d'un point — en changeant d'abord de mois si besoin. */
export async function allerAuPoint(point: PointACorriger, tous: PointACorriger[]): Promise<void> {
  ecrireParcours({ ids: tous.map((p) => p.id), courant: point.id });
  if (point.periodeId) {
    const { allerAuMois } = await import("@/lib/allerAuMois");
    await allerAuMois(point.periodeId, point.lien);
    return;
  }
  window.location.href = point.lien;
}

/** Demande au DD de renvoyer (ou déverrouiller) un rapport. */
export async function demanderAuDD(demande: { periodeId: string; tableaux: string[] }): Promise<string> {
  try {
    const r = await fetch("/api/rapports/demander-renvoi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(demande),
    });
    const d = (await r.json().catch(() => ({}))) as { message?: string; deja?: boolean };
    if (!r.ok) return d.message ?? "La demande n'a pas pu partir.";
    return d.deja ? "Demande déjà envoyée il y a peu : le DD est prévenu." : "Demande envoyée : le DD est prévenu.";
  } catch {
    return "Pas de réseau : la demande n'est pas partie. Réessayez une fois connecté.";
  }
}
