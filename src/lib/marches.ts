/**
 * LA FICHE D'UN MARCHÉ (demande du Délégué, 21 octobre 2026) — ses listes de
 * choix, le calendrier traditionnel, et les contrôles. Partagé par l'écran
 * (questionnaire), le serveur (contrôle) et les exports (Excel, PDF).
 *
 * Décisions du Délégué :
 *  - les marchés suivent le calendrier traditionnel de 8 jours (grand marché,
 *    petit marché) ; certains se tiennent un jour fixe de la semaine, d'autres
 *    tous les jours ;
 *  - un marché n'a ni propriétaire ni téléphone : c'est la COMMUNE qui le gère ;
 *  - les animaux viennent de plusieurs endroits et partent vers plusieurs
 *    villes, mais il y a toujours un lieu PRINCIPAL ;
 *  - les équipements se choisissent dans une liste, avec leur état ;
 *  - la position GPS se prend par le téléphone, à 5 m près au plus.
 */

// ---------------------------------------------------------------------------
// LE CALENDRIER TRADITIONNEL (semaine de 8 jours)
// ---------------------------------------------------------------------------

export interface CalendrierTraditionnel {
  langue: string;
  /** Les huit jours, dans l'ordre du cycle. */
  jours: { code: string; libelle: string }[];
  /** Une date connue (AAAA-MM-JJ, heure du Cameroun) et le jour qu'elle porte : jours[0]. */
  ancre: string;
  source: string;
}

/**
 * Par département (code). La Menoua : le yemba. Ordre et date de référence
 * d'après le calendrier yemba d'ASENGO Technologies (le vendredi 8 septembre
 * 2017 était Ngang ; le samedi 30, Efa'a), ordre confirmé par Menoua Germany
 * e.V., et vérifié par le Délégué le 21 octobre 2026 (Mbouolo).
 *
 * Un autre département : ses huit jours et une date de référence seront
 * ajoutés ici — d'ici là, l'agent écrit le nom du jour.
 */
export const CALENDRIERS: Record<string, CalendrierTraditionnel> = {
  MEN: {
    langue: "yemba",
    jours: [
      { code: "NGANG", libelle: "Ngang" },
      { code: "MBOUWA", libelle: "Mbouwa" },
      { code: "MBOUOLO", libelle: "Mbouolo" },
      { code: "META", libelle: "Meta" },
      { code: "MBOUOKEU", libelle: "Mbouokeu" },
      { code: "MBOUOTCHOU", libelle: "Mbouotchou" },
      { code: "EFAA", libelle: "Efa'a" },
      { code: "NJIELAH", libelle: "Njielah" },
    ],
    ancre: "2017-09-08",
    source: "calendrier yemba d'ASENGO Technologies, vérifié par le Délégué le 21 octobre 2026",
  },
};

export const calendrierDe = (codeDepartement: string | null | undefined) =>
  (codeDepartement && CALENDRIERS[codeDepartement]) || null;

/** La date du jour au Cameroun, « AAAA-MM-JJ ». */
export function dateAuCameroun(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Douala", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

const joursEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** Le rang (0–7) du jour traditionnel d'une date « AAAA-MM-JJ ». */
export function rangTraditionnel(cal: CalendrierTraditionnel, date: string): number {
  return (((joursEntre(cal.ancre, date) % 8) + 8) % 8);
}

/** Le jour traditionnel d'une date. */
export function jourTraditionnel(cal: CalendrierTraditionnel, date: string = dateAuCameroun()) {
  return cal.jours[rangTraditionnel(cal, date)];
}

/** La prochaine date (aujourd'hui compris) qui porte ce jour, « AAAA-MM-JJ ». */
export function prochaineDate(cal: CalendrierTraditionnel, codeJour: string, depuis: string = dateAuCameroun()): string | null {
  const cible = cal.jours.findIndex((j) => j.code === codeJour);
  if (cible < 0) return null;
  const ecart = (cible - rangTraditionnel(cal, depuis) + 8) % 8;
  const t = Date.parse(`${depuis}T00:00:00Z`) + ecart * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** « mardi 27 oct. », ou « aujourd'hui » / « demain ». */
export function dateCourte(date: string, aujourdhui: string = dateAuCameroun()): string {
  const n = joursEntre(aujourdhui, date);
  if (n === 0) return "aujourd'hui";
  if (n === 1) return "demain";
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
}

// ---------------------------------------------------------------------------
// LES LISTES DE CHOIX
// ---------------------------------------------------------------------------

export type Choix = { code: string; libelle: string };

/**
 * COMMENT LE MARCHÉ EST ORGANISÉ (décision du Délégué, 21 octobre 2026 :
 * « Bétail / Porcs / Volailles / Mixte » n'était pas clair). Ce qu'on y vend se
 * dit par les espèces ; ici, seulement où se vendent les animaux. Beaucoup de
 * marchés ont une zone pour les animaux et une autre pour les autres produits.
 */
export const ORGANISATIONS: (Choix & { aide: string })[] = [
  { code: "RESERVE_ANIMAUX", libelle: "Un marché réservé aux animaux", aide: "On n'y vend que des animaux." },
  { code: "ZONE_ANIMAUX", libelle: "Un marché général, avec une zone pour les animaux", aide: "Vivres et autres produits d'un côté ; les animaux dans un espace à part." },
  { code: "MELANGE", libelle: "Un marché général, sans zone pour les animaux", aide: "Les animaux se vendent au milieu des autres produits." },
];

/** L'ancienne question, gardée pour relire une fiche remplie avant le 21 octobre 2026. */
export const TYPES_MARCHE: Choix[] = [
  { code: "BETAIL", libelle: "Bétail" },
  { code: "PORCS", libelle: "Porcs" },
  { code: "VOLAILLES", libelle: "Volailles" },
  { code: "MIXTE", libelle: "Mixte (vivres et animaux)" },
];

/** L'espèce la plus vendue : une espèce vendue, ou ces deux regroupements. */
export const PETITS_RUMINANTS = "PETITS_RUMINANTS";
export const PLUSIEURS_ESPECES = "PLUSIEURS";
export function choixEspecePrincipale(especesVendues: string[], libelleEspece: (code: string) => string): Choix[] {
  return [
    ...especesVendues.map((e) => ({ code: e, libelle: libelleEspece(e) })),
    ...(especesVendues.includes("OVINS") && especesVendues.includes("CAPRINS") ? [{ code: PETITS_RUMINANTS, libelle: "Petits ruminants (moutons et chèvres)" }] : []),
    { code: PLUSIEURS_ESPECES, libelle: "Plusieurs espèces, à part égale" },
  ];
}

export const FONCTIONNEMENTS: Choix[] = [
  { code: "FONCTIONNEL", libelle: "Fonctionne" },
  { code: "SAISONNIER", libelle: "Seulement à certaines saisons" },
  { code: "NON_FONCTIONNEL", libelle: "Ne fonctionne plus" },
];

export const PORTEES: Choix[] = [
  { code: "LOCAL", libelle: "Local (le village, le quartier)" },
  { code: "INTERCOMMUNAL", libelle: "Plusieurs communes" },
  { code: "REGIONAL", libelle: "Toute la région et au-delà" },
];

export const RYTHMES: Choix[] = [
  { code: "HUIT_JOURS", libelle: "Selon les jours du village (8 jours)" },
  { code: "SEMAINE", libelle: "Un jour fixe de la semaine" },
  { code: "QUOTIDIEN", libelle: "Tous les jours" },
];

export const JOURS_SEMAINE = ["LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI", "DIMANCHE"];

export const EFFECTIFS: Choix[] = [
  { code: "MOINS_50", libelle: "Moins de 50" },
  { code: "DE_50_A_200", libelle: "50 à 200" },
  { code: "PLUS_200", libelle: "Plus de 200" },
];

export const ETATS: Choix[] = [
  { code: "ABSENT", libelle: "Absent" },
  { code: "BON", libelle: "Bon" },
  { code: "MOYEN", libelle: "Moyen" },
  { code: "MAUVAIS", libelle: "Mauvais" },
];

export const CONTROLES: Choix[] = [
  { code: "TOUJOURS", libelle: "Toujours" },
  { code: "PARFOIS", libelle: "Parfois" },
  { code: "JAMAIS", libelle: "Jamais" },
];

export const ACCES: Choix[] = [
  { code: "BITUMEE", libelle: "Route bitumée" },
  { code: "PISTE_BONNE", libelle: "Piste en bon état" },
  { code: "PISTE_DIFFICILE", libelle: "Piste difficile en saison des pluies" },
];

/** Les départements de l'Ouest et les autres régions : d'où viennent les animaux. */
export const DEPARTEMENTS_OUEST = ["Bamboutos", "Haut-Nkam", "Hauts-Plateaux", "Koung-Khi", "Menoua", "Mifi", "Ndé", "Noun"];
export const REGIONS = ["Adamaoua", "Centre", "Est", "Extrême-Nord", "Littoral", "Nord", "Nord-Ouest", "Sud", "Sud-Ouest"];

/** Où partent les animaux : quelques villes, et « autre ». */
export const VILLES_DESTINATION = ["Dschang", "Bafoussam", "Mbouda", "Bafang", "Bangangté", "Foumban", "Nkongsamba", "Douala", "Yaoundé"];

/**
 * Les lieux de provenance, codés : « MEME_ARRONDISSEMENT », « ARR:Fokoué »,
 * « DEP:Mifi », « REG:Adamaoua », « PAYS » (un pays voisin), « AUTRE ».
 */
export function lieuxDeProvenance(arrondissements: string[], arrondissementDuMarche: string, departement: string): { groupe: string; lieux: Choix[] }[] {
  return [
    { groupe: "Ici", lieux: [{ code: "MEME_ARRONDISSEMENT", libelle: `Arrondissement de ${arrondissementDuMarche}` }] },
    {
      groupe: `Autres arrondissements (${departement})`,
      lieux: arrondissements.filter((a) => a !== arrondissementDuMarche).map((a) => ({ code: `ARR:${a}`, libelle: a })),
    },
    { groupe: "Autres départements de l'Ouest", lieux: DEPARTEMENTS_OUEST.filter((d) => d !== departement).map((d) => ({ code: `DEP:${d}`, libelle: d })) },
    { groupe: "Autres régions", lieux: REGIONS.map((r) => ({ code: `REG:${r}`, libelle: r })) },
    { groupe: "Ailleurs", lieux: [{ code: "PAYS", libelle: "Un pays voisin (Nigeria, Tchad…)" }, { code: "AUTRE", libelle: "Autre : préciser" }] },
  ];
}

export function lieuxDeDestination(): Choix[] {
  return [...VILLES_DESTINATION.map((v) => ({ code: `VILLE:${v}`, libelle: v })), { code: "PAYS", libelle: "Un pays voisin" }, { code: "AUTRE", libelle: "Autre : préciser" }];
}

/** Le libellé d'un lieu codé. */
export function libelleLieu(code: string, autre?: string | null, arrondissementDuMarche?: string): string {
  if (code === "MEME_ARRONDISSEMENT") return arrondissementDuMarche ? `Arrondissement de ${arrondissementDuMarche}` : "Même arrondissement";
  if (code === "PAYS") return "Pays voisin";
  if (code === "AUTRE") return autre?.trim() ? autre.trim() : "Autre";
  const [, nom] = code.split(":");
  if (code.startsWith("DEP:")) return `Département ${nom}`;
  if (code.startsWith("REG:")) return `Région ${nom}`;
  return nom ?? code;
}

// ---------------------------------------------------------------------------
// LA FICHE
// ---------------------------------------------------------------------------

export interface FicheMarche {
  /** Où se vendent les animaux : ORGANISATIONS. */
  organisation?: string | null;
  /** L'espèce la plus vendue (code d'espèce, PETITS_RUMINANTS ou PLUSIEURS). */
  especePrincipale?: string | null;
  /** Ancienne question (avant le 21 octobre 2026) : relue, plus posée. */
  typeMarche?: string | null;
  fonctionnement?: string | null;
  portee?: string | null;
  rythme?: string | null;
  /** Le jour du grand marché : un code du calendrier traditionnel, ou un jour de la semaine. */
  grandMarche?: string | null;
  petitMarche?: string | null;
  /** Le nom du jour tel que le village le dit, s'il diffère (ou si le calendrier du département manque). */
  nomLocalJour?: string | null;
  /** Par espèce vendue : la taille habituelle un jour de marché. */
  effectifs?: Record<string, string>;
  provenances?: string[];
  provenancePrincipale?: string | null;
  provenanceAutre?: string | null;
  destinations?: string[];
  destinationPrincipale?: string | null;
  destinationAutre?: string | null;
  /** Par équipement : ABSENT, BON, MOYEN, MAUVAIS. */
  equipements?: Record<string, string>;
  equipementAutre?: string | null;
  etatEquipementAutre?: string | null;
  controleVeterinaire?: string | null;
  laissezPasser?: boolean | null;
  acces?: string | null;
}

const dans = (liste: Choix[], v: unknown) => (typeof v === "string" && liste.some((c) => c.code === v) ? v : null);
const texte = (v: unknown, max = 120) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const lieuValide = (code: string) => /^(MEME_ARRONDISSEMENT|PAYS|AUTRE|ARR:.{1,60}|DEP:.{1,60}|REG:.{1,60}|VILLE:.{1,60})$/.test(code);

/**
 * Contrôle et nettoie une fiche reçue. Rend un message d'erreur, ou la fiche
 * — seulement des valeurs connues. `codesEquipements`, `codesEspeces` :
 * les listes de src/lib/acteurs.ts.
 */
export function nettoyerFicheMarche(
  brut: unknown,
  codesEspeces: string[],
  codesEquipements: string[],
  codeDepartement?: string | null
): { erreur: string } | { fiche: FicheMarche } {
  if (brut == null) return { fiche: {} };
  if (typeof brut !== "object" || Array.isArray(brut)) return { erreur: "Fiche du marché illisible." };
  const b = brut as Record<string, unknown>;
  const f: FicheMarche = {};

  f.organisation = dans(ORGANISATIONS, b.organisation);
  f.typeMarche = dans(TYPES_MARCHE, b.typeMarche);
  // L'espèce la plus vendue doit faire partie des espèces vendues : contrôlé à
  // l'écriture (preparerEcriture), qui connaît la liste.
  f.especePrincipale =
    typeof b.especePrincipale === "string" && [...codesEspeces, PETITS_RUMINANTS, PLUSIEURS_ESPECES].includes(b.especePrincipale) ? b.especePrincipale : null;
  f.fonctionnement = dans(FONCTIONNEMENTS, b.fonctionnement);
  f.portee = dans(PORTEES, b.portee);
  f.rythme = dans(RYTHMES, b.rythme);
  const cal = calendrierDe(codeDepartement);
  const jourValide = (v: unknown) => {
    if (typeof v !== "string") return null;
    if (f.rythme === "SEMAINE") return JOURS_SEMAINE.includes(v) ? v : null;
    if (f.rythme === "HUIT_JOURS") return cal ? (cal.jours.some((j) => j.code === v) ? v : null) : null;
    return null;
  };
  f.grandMarche = jourValide(b.grandMarche);
  f.petitMarche = jourValide(b.petitMarche);
  if (f.petitMarche && f.petitMarche === f.grandMarche) return { erreur: "Le petit marché et le grand marché ne peuvent pas tomber le même jour." };
  f.nomLocalJour = f.rythme === "HUIT_JOURS" ? texte(b.nomLocalJour, 60) : null;

  const effectifs: Record<string, string> = {};
  if (b.effectifs && typeof b.effectifs === "object") {
    for (const [esp, v] of Object.entries(b.effectifs as Record<string, unknown>)) {
      const e = dans(EFFECTIFS, v);
      if (codesEspeces.includes(esp) && e) effectifs[esp] = e;
    }
  }
  f.effectifs = effectifs;

  for (const sens of ["provenance", "destination"] as const) {
    const cle = sens === "provenance" ? "provenances" : "destinations";
    const liste = Array.isArray(b[cle]) ? Array.from(new Set((b[cle] as unknown[]).map(String).filter(lieuValide))).slice(0, 30) : [];
    const principale = typeof b[`${sens}Principale`] === "string" ? (b[`${sens}Principale`] as string) : null;
    if (principale && !liste.includes(principale)) return { erreur: `Le lieu principal de ${sens} doit faire partie des lieux cochés.` };
    if (liste.length && !principale) {
      if (liste.length === 1) {
        // Un seul lieu : c'est lui le principal.
        f[`${sens}Principale`] = liste[0];
      } else {
        return { erreur: `Indiquez le lieu principal de ${sens} parmi ceux cochés.` };
      }
    } else {
      f[`${sens}Principale`] = principale;
    }
    f[cle] = liste;
    f[`${sens}Autre`] = liste.includes("AUTRE") ? texte(b[`${sens}Autre`], 80) : null;
  }

  const equipements: Record<string, string> = {};
  if (b.equipements && typeof b.equipements === "object") {
    for (const [eq, v] of Object.entries(b.equipements as Record<string, unknown>)) {
      const e = dans(ETATS, v);
      if (codesEquipements.includes(eq) && e) equipements[eq] = e;
    }
  }
  f.equipements = equipements;
  f.equipementAutre = texte(b.equipementAutre, 80);
  f.etatEquipementAutre = f.equipementAutre ? dans(ETATS, b.etatEquipementAutre) : null;

  f.controleVeterinaire = dans(CONTROLES, b.controleVeterinaire);
  f.laissezPasser = typeof b.laissezPasser === "boolean" ? b.laissezPasser : null;
  f.acces = dans(ACCES, b.acces);
  return { fiche: f };
}

/** Les équipements présents (état autre qu'« absent ») : la colonne `infrastructures`, lue par les anciens écrans. */
export const equipementsPresents = (f: FicheMarche) =>
  Object.entries(f.equipements ?? {}).filter(([, e]) => e !== "ABSENT").map(([code]) => code);

export const libelleDe = (liste: Choix[], code: string | null | undefined) => (code ? liste.find((c) => c.code === code)?.libelle ?? code : null);

/** L'espèce la plus vendue, en clair. */
export function especePrincipaleEnClair(f: FicheMarche, libelleEspece: (code: string) => string): string | null {
  if (!f.especePrincipale) return null;
  if (f.especePrincipale === PETITS_RUMINANTS) return "petits ruminants (moutons et chèvres)";
  if (f.especePrincipale === PLUSIEURS_ESPECES) return "plusieurs espèces à part égale";
  return libelleEspece(f.especePrincipale).toLowerCase();
}

/** Le marché en une ligne : « Marché réservé aux animaux — surtout bovins ». Une seule espèce vendue : c'est elle. */
export function typeEnClair(f: FicheMarche, libelleEspece: (code: string) => string, especesVendues: string[] = []): string | null {
  const orga = f.organisation ? libelleDe(ORGANISATIONS, f.organisation)!.replace(/^Un m/, "M") : libelleDe(TYPES_MARCHE, f.typeMarche);
  const esp = especePrincipaleEnClair(
    !f.especePrincipale && especesVendues.length === 1 ? { ...f, especePrincipale: especesVendues[0] } : f,
    libelleEspece
  );
  if (!orga) return esp ? `Surtout ${esp}` : null;
  return esp ? `${orga} — ${f.especePrincipale === PLUSIEURS_ESPECES ? esp : `surtout ${esp}`}` : orga;
}

/** Les jours du marché, en clair : « Grand marché : Ngang (mardi 27 oct.) · Petit marché : Meta ». */
export function joursEnClair(f: FicheMarche, codeDepartement: string | null | undefined, avecDates = true): string | null {
  if (f.rythme === "QUOTIDIEN") return "Tous les jours";
  const cal = calendrierDe(codeDepartement);
  const nomJour = (code: string | null | undefined) => {
    if (!code) return null;
    if (f.rythme === "SEMAINE") return code.charAt(0) + code.slice(1).toLowerCase();
    const j = cal?.jours.find((x) => x.code === code);
    if (!j) return code;
    const d = avecDates && cal ? prochaineDate(cal, code) : null;
    return d ? `${j.libelle} (prochain : ${dateCourte(d)})` : j.libelle;
  };
  const parties = [
    f.grandMarche ? `${f.petitMarche ? "Grand marché : " : ""}${nomJour(f.grandMarche)}` : null,
    f.petitMarche ? `Petit marché : ${nomJour(f.petitMarche)}` : null,
    f.nomLocalJour ? `nom local : ${f.nomLocalJour}` : null,
  ].filter(Boolean);
  if (f.rythme === "SEMAINE" && parties.length) return `Chaque semaine — ${parties.join(" · ")}`;
  return parties.length ? parties.join(" · ") : null;
}

/** Les lieux, le principal d'abord et marqué : « Fokoué (principal), Mifi ». */
export function lieuxEnClair(liste: string[] | undefined, principale: string | null | undefined, autre: string | null | undefined, arr?: string): string | null {
  if (!liste?.length) return null;
  const ordonnee = principale ? [principale, ...liste.filter((x) => x !== principale)] : liste;
  return ordonnee.map((c) => `${libelleLieu(c, autre, arr)}${c === principale && liste.length > 1 ? " (principal)" : ""}`).join(", ");
}

/** La précision GPS exigée, en mètres (décision du Délégué). */
export const PRECISION_GPS_MAX_M = 5;
