/**
 * LA FICHE « RÉPERTOIRE » D'UN ACTEUR (demande du Délégué, 12 novembre 2026) :
 * le registre des établissements demande, selon le type d'acteur, les mêmes
 * informations que le RÉPERTOIRE DES ACTEURS DU SOUS-SECTEUR EPIA de la
 * Délégation régionale de l'Ouest (fichier « REPERTOIRE EPIAH fokoue 2026 »,
 * et la fiche « FILIÈRE 4/9 — RÉPERTOIRE DES PISCICULTEURS »).
 *
 * Les intitulés sont ceux du canevas papier. Le nom et prénoms du promoteur
 * (ou du responsable) est le « Propriétaire » du registre, son contact le
 * « Téléphone », le village le CZV / village, les coordonnées géographiques
 * la position GPS prise par le téléphone : rien de tout cela n'est répété ici.
 *
 * Fichier sans dépendance : lu par l'appareil (formulaire, hors ligne) et par
 * le serveur (contrôle de ce qui est enregistré, export de la liste).
 */

export type GenreChamp = "ouiNon" | "sexe" | "nombre" | "texte" | "choix";

export interface ChampRepertoire {
  code: string;
  libelle: string;
  genre: GenreChamp;
  /** Pour « choix » : les réponses possibles, telles qu'elles s'écrivent. */
  options?: string[];
  /** Exemple affiché dans la case vide. */
  exemple?: string;
}

export type FicheRepertoire = Record<string, string | number | null>;

const HOMOLOGUEE: ChampRepertoire = { code: "homologuee", libelle: "Ferme homologuée ?", genre: "ouiNon" };
const SEXE: ChampRepertoire = { code: "sexe", libelle: "Sexe du promoteur", genre: "sexe" };
const EXPERIENCE: ChampRepertoire = { code: "experience", libelle: "Expérience (en années)", genre: "nombre" };
const MODE: ChampRepertoire = { code: "mode", libelle: "Type / mode d'élevage", genre: "choix", options: ["Intensif", "Semi-intensif", "Extensif"] };
const EFFECTIF_M: ChampRepertoire = { code: "effectifM", libelle: "Effectifs — mâles", genre: "nombre" };
const EFFECTIF_F: ChampRepertoire = { code: "effectifF", libelle: "Effectifs — femelles", genre: "nombre" };
const RACES: ChampRepertoire = { code: "races", libelle: "Races / souches présentes dans le cheptel", genre: "texte", exemple: "Ex. : Large white, hybrides" };
const PROVENANCE: ChampRepertoire = { code: "provenance", libelle: "Provenance des animaux", genre: "texte", exemple: "Ex. : Douala, fermes locales" };

/** Les colonnes communes à toutes les filières d'élevage du répertoire. */
const ELEVEUR: ChampRepertoire[] = [HOMOLOGUEE, SEXE, EXPERIENCE, MODE, EFFECTIF_M, EFFECTIF_F, RACES, PROVENANCE];

export const CHAMPS_REPERTOIRE: Record<string, ChampRepertoire[]> = {
  ETAB_FERME_PONTE: ELEVEUR,
  ETAB_FERME_CHAIR: ELEVEUR,
  ETAB_PORCHERIE: ELEVEUR,
  ETAB_POULET_LOCAL: ELEVEUR,
  ETAB_PETITS_RUMINANTS: ELEVEUR,
  ETAB_BOVINS: ELEVEUR,
  ETAB_NON_CONVENTIONNEL: ELEVEUR,
  ETAB_APICULTEUR: [
    HOMOLOGUEE, SEXE, EXPERIENCE, MODE, EFFECTIF_M, EFFECTIF_F,
    { ...RACES, exemple: "Ex. : abeille locale" },
    { code: "ruches", libelle: "Nombre de ruches", genre: "nombre" },
  ],
  ETAB_PROVENDERIE: [
    { code: "homologuee", libelle: "Structure homologuée ?", genre: "ouiNon" },
    SEXE, EXPERIENCE,
    { code: "typeProvende", libelle: "Type de provende", genre: "texte", exemple: "Ex. : provende ponte, chair, porc" },
    { code: "quantite", libelle: "Quantité", genre: "texte", exemple: "Ex. : 20 tonnes par mois" },
    { code: "provenanceMatieres", libelle: "Provenance des matières premières", genre: "texte" },
  ],
  // Aquaculteurs (répertoire de Fokoué) et pisciculteurs (fiche régionale « filière 4/9 »).
  ETAB_ETANG: [
    HOMOLOGUEE, SEXE, EXPERIENCE,
    { code: "association", libelle: "Appartenance à une association de producteurs ?", genre: "ouiNon" },
    { code: "mode", libelle: "Type / mode d'élevage", genre: "texte", exemple: "Ex. : dérivation, hors sol" },
    { code: "etangsNombre", libelle: "Étangs opérationnels — nombre", genre: "nombre" },
    { code: "etangsSuperficie", libelle: "Étangs opérationnels — superficie (m²)", genre: "nombre" },
    { code: "bacsNombre", libelle: "Bacs opérationnels — nombre", genre: "nombre" },
    { code: "bacsVolume", libelle: "Bacs opérationnels — volume (m³)", genre: "nombre" },
    { code: "cages", libelle: "Nombre de cages", genre: "nombre" },
    { code: "capacite", libelle: "Capacité de production", genre: "texte", exemple: "Ex. : 3 000 kg par an" },
    { code: "production", libelle: "Production (quantités produites)", genre: "texte", exemple: "Ex. : 1 000 kg" },
    { code: "especesPoissons", libelle: "Espèces", genre: "texte", exemple: "Ex. : silure, tilapia" },
    { code: "provenanceAlevins", libelle: "Provenance des géniteurs / alevins", genre: "texte" },
  ],
  ETAB_OP: [
    { code: "typeOP", libelle: "Type de l'OP", genre: "texte", exemple: "Ex. : GIC, coopérative, association" },
    { code: "homologuee", libelle: "Homologuée ?", genre: "ouiNon" },
    { code: "dateCreation", libelle: "Date de création", genre: "texte", exemple: "Ex. : 12/03/2015" },
    { code: "numeroEnregistrement", libelle: "Numéro d'enregistrement", genre: "texte" },
    { code: "membresM", libelle: "Membres — hommes", genre: "nombre" },
    { code: "membresF", libelle: "Membres — femmes", genre: "nombre" },
    { code: "activite", libelle: "Activité principale", genre: "texte" },
  ],
  ETAB_BOUCHER: [
    { code: "qualite", libelle: "Qualité", genre: "choix", options: ["Boucher", "Charcutier", "Boucher-charcutier"] },
    { code: "cni", libelle: "N° de CNI", genre: "texte" },
  ],
  // Propriétaires de chiens (12 novembre 2026) : pas de filière au répertoire
  // régional ; mêmes colonnes de base, et ce qui compte pour la rage.
  ETAB_CHIEN: [
    { ...SEXE, libelle: "Sexe du propriétaire" },
    { code: "effectifM", libelle: "Chiens — mâles", genre: "nombre" },
    { code: "effectifF", libelle: "Chiens — femelles", genre: "nombre" },
    { ...RACES, libelle: "Races", exemple: "Ex. : berger allemand, race locale" },
    { code: "vaccinRage", libelle: "Vacciné(s) contre la rage ?", genre: "ouiNon" },
    { code: "dateVaccin", libelle: "Date de la dernière vaccination antirabique", genre: "texte", exemple: "Ex. : 15/09/2026" },
    { code: "garde", libelle: "Mode de garde", genre: "choix", options: ["Attaché", "En enclos", "En liberté"] },
  ],
  ETAB_PECHEUR: [
    { code: "permis", libelle: "Permis de pêche ?", genre: "ouiNon" },
    SEXE, EXPERIENCE,
    { code: "modePeche", libelle: "Type / mode de pêche", genre: "texte", exemple: "Ex. : filet, ligne, nasse" },
    { code: "quantites", libelle: "Quantités", genre: "texte", exemple: "Ex. : 50 kg par mois" },
    { code: "especesCapturees", libelle: "Espèces capturées", genre: "texte" },
    { code: "lieuPeche", libelle: "Lieu de pêche", genre: "texte" },
  ],
};

/** Ce que la colonne « Propriétaire » veut dire, selon le canevas du type. */
export const LIBELLE_PROPRIETAIRE: Record<string, string> = {
  ETAB_OP: "Nom du responsable",
  ETAB_BOUCHER: "Noms et prénoms",
  ETAB_PECHEUR: "Nom et prénoms du pêcheur",
  ETAB_CHIEN: "Nom et prénoms du propriétaire",
};
export const libelleProprietaire = (typeCode: string) =>
  LIBELLE_PROPRIETAIRE[typeCode] ?? (CHAMPS_REPERTOIRE[typeCode] ? "Nom et prénoms du promoteur" : "Propriétaire");

/** Le titre court de la colonne, dans la liste du registre. */
export const enteteProprietaire = (typeCode: string) =>
  ({ ETAB_OP: "Responsable", ETAB_BOUCHER: "Noms et prénoms", ETAB_PECHEUR: "Pêcheur", ETAB_CHIEN: "Propriétaire" } as Record<string, string>)[typeCode] ??
  (CHAMPS_REPERTOIRE[typeCode] ? "Promoteur" : "Propriétaire");

export const champsRepertoire =(typeCode: string): ChampRepertoire[] => CHAMPS_REPERTOIRE[typeCode] ?? [];

/**
 * Garde seulement ce que le canevas du type prévoit, nettoyé : un nombre
 * positif (ou rien), un texte court, un oui/non, un sexe, un choix connu.
 */
export function nettoyerFicheRepertoire(typeCode: string, brut: unknown): { erreur: string } | { fiche: FicheRepertoire | null } {
  const champs = champsRepertoire(typeCode);
  if (!champs.length) return { erreur: "Ce type d'établissement n'a pas de fiche de répertoire." };
  if (brut == null) return { fiche: null };
  if (typeof brut !== "object" || Array.isArray(brut)) return { erreur: "Fiche illisible." };
  const src = brut as Record<string, unknown>;
  const fiche: FicheRepertoire = {};
  for (const c of champs) {
    const v = src[c.code];
    if (v == null || String(v).trim() === "") continue;
    const s = String(v).replace(/\s+/g, " ").trim();
    if (c.genre === "nombre") {
      const n = Number(s.replace(/[\s  ]/g, "").replace(",", "."));
      if (!Number.isFinite(n) || n < 0) return { erreur: `« ${c.libelle} » : inscrivez un nombre (ou laissez vide).` };
      fiche[c.code] = n;
    } else if (c.genre === "ouiNon") {
      const u = s.toUpperCase();
      if (u !== "OUI" && u !== "NON") return { erreur: `« ${c.libelle} » : Oui ou Non.` };
      fiche[c.code] = u;
    } else if (c.genre === "sexe") {
      const u = s.toUpperCase();
      if (u !== "M" && u !== "F") return { erreur: `« ${c.libelle} » : M ou F.` };
      fiche[c.code] = u;
    } else if (c.genre === "choix") {
      const o = c.options?.find((x) => x.toLowerCase() === s.toLowerCase());
      if (!o) return { erreur: `« ${c.libelle} » : réponse inconnue.` };
      fiche[c.code] = o;
    } else {
      fiche[c.code] = s.slice(0, 200);
    }
  }
  return { fiche: Object.keys(fiche).length ? fiche : null };
}

/** Une valeur de la fiche, telle qu'elle s'écrit dans une liste. */
export function valeurEnClair(c: ChampRepertoire, v: string | number | null | undefined): string {
  if (v == null || v === "") return "";
  if (c.genre === "ouiNon") return v === "OUI" ? "Oui" : "Non";
  if (typeof v === "number") return v.toLocaleString("fr-FR");
  return String(v);
}
