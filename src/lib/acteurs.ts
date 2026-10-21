/**
 * Les acteurs du registre des établissements, et leurs informations
 * structurelles (demande du Délégué, 20 octobre 2026 : « les infos sur les
 * marchés — nom, coordonnées GPS, espèces vendues… » et « sortir toute la
 * liste, tous les acteurs, ou faire des tris »).
 *
 * Les neuf types sont ceux de la liste de référence TYPE_ETABLISSEMENT du SID
 * (prisma/seed-lib/referentielsDeBase.ts) ; seuls les quatre premiers servent
 * aux tableaux nominatifs du mensuel (1.3, 1.4, 1.5, 2.3). Chaque acteur est
 * rattaché à un arrondissement, donc à un département.
 */
import { PRECISION_GPS_MAX_M } from "./marches";

export interface TypeActeur {
  code: string;
  /** Au singulier, tel qu'il s'écrit dans une liste. */
  libelle: string;
  /** Au pluriel, sur l'onglet du registre. */
  pluriel: string;
  /** Le tableau du mensuel qui s'en sert, s'il y en a un. */
  tableau?: string;
}

export const TYPES_ACTEURS: TypeActeur[] = [
  { code: "ETAB_COUVOIR", libelle: "Couvoir", pluriel: "Couvoirs", tableau: "1.3" },
  { code: "ETAB_FERME_PONTE", libelle: "Ferme de ponte", pluriel: "Fermes de ponte", tableau: "1.4" },
  { code: "ETAB_FERME_CHAIR", libelle: "Ferme de poulets de chair", pluriel: "Fermes de poulets de chair", tableau: "1.5" },
  { code: "ETAB_PROVENDERIE", libelle: "Provenderie", pluriel: "Provenderies", tableau: "2.3" },
  { code: "ETAB_MARCHE", libelle: "Marché", pluriel: "Marchés" },
  { code: "ETAB_ABATTOIR", libelle: "Abattoir", pluriel: "Abattoirs" },
  { code: "ETAB_AIRE_ABATTAGE", libelle: "Aire d'abattage aménagée", pluriel: "Aires d'abattage" },
  { code: "ETAB_ETANG", libelle: "Étang piscicole", pluriel: "Étangs piscicoles" },
  { code: "ETAB_CLINIQUE_PRIVEE", libelle: "Clinique vétérinaire privée", pluriel: "Cliniques vétérinaires privées" },
];

export const CODES_ACTEURS = TYPES_ACTEURS.map((t) => t.code);
export const libelleActeur = (code: string) => TYPES_ACTEURS.find((t) => t.code === code)?.libelle ?? code;

/** La question « espèces », selon le type d'acteur — absente pour les fermes avicoles, dont l'espèce va de soi. */
export const QUESTION_ESPECES: Record<string, string> = {
  ETAB_MARCHE: "Espèces vendues",
  ETAB_ABATTOIR: "Espèces abattues",
  ETAB_AIRE_ABATTAGE: "Espèces abattues",
  ETAB_ETANG: "Espèces élevées",
  ETAB_CLINIQUE_PRIVEE: "Espèces soignées",
};

/** Les espèces — vendues sur un marché, élevées, abattues… */
export const ESPECES: { code: string; libelle: string }[] = [
  { code: "BOVINS", libelle: "Bovins" },
  { code: "OVINS", libelle: "Ovins" },
  { code: "CAPRINS", libelle: "Caprins" },
  { code: "PORCINS", libelle: "Porcins" },
  { code: "VOLAILLE", libelle: "Volaille" },
  { code: "LAPINS", libelle: "Lapins" },
  { code: "AULACODES", libelle: "Aulacodes" },
  { code: "COBAYES", libelle: "Cobayes" },
  { code: "EQUINS", libelle: "Équins" },
  { code: "ASINS", libelle: "Asins" },
  { code: "POISSONS", libelle: "Poissons" },
  { code: "ESCARGOTS", libelle: "Escargots" },
  { code: "OEUFS", libelle: "Œufs" },
  { code: "MIEL", libelle: "Miel et produits de la ruche" },
];

export const JOURS = ["LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI", "DIMANCHE"];
export const libelleJour = (j: string) => j.charAt(0) + j.slice(1).toLowerCase();

/** Les équipements d'un marché. */
export const INFRASTRUCTURES_MARCHE: { code: string; libelle: string }[] = [
  { code: "CLOTURE", libelle: "Clôture" },
  { code: "HANGAR", libelle: "Hangar / abri" },
  { code: "PARC_ATTENTE", libelle: "Parc d'attente des animaux" },
  { code: "QUAI_EMBARQUEMENT", libelle: "Quai d'embarquement" },
  { code: "POINT_EAU", libelle: "Point d'eau" },
  { code: "BASCULE", libelle: "Bascule / pesage" },
  { code: "AIRE_ABATTAGE", libelle: "Aire d'abattage" },
  { code: "POSTE_VETERINAIRE", libelle: "Poste de contrôle vétérinaire" },
  { code: "TOILETTES", libelle: "Toilettes" },
];

const libelleDe = (liste: { code: string; libelle: string }[], code: string) => liste.find((x) => x.code === code)?.libelle ?? code;
export const libellesEspeces = (codes: string[]) => codes.map((c) => libelleDe(ESPECES, c)).join(", ");
export const libellesInfrastructures = (codes: string[]) => codes.map((c) => libelleDe(INFRASTRUCTURES_MARCHE, c)).join(", ");

/** Les informations structurelles, nettoyées : seules les valeurs connues passent. */
export interface InfosStructurelles {
  latitude?: number | null;
  longitude?: number | null;
  /** Précision de la position, en mètres, telle que le téléphone l'a mesurée. */
  precisionGPS?: number | null;
  /** Quand la position a été prise (ISO). */
  dateCollecteGPS?: string | null;
  especes?: string[];
  joursMarche?: string[];
  infrastructures?: string[];
  observations?: string | null;
}

/**
 * Vérifie et nettoie ce qu'un formulaire envoie. Rend un message d'erreur, ou
 * les données à écrire (seulement les champs présents).
 *
 * LA POSITION (décision du Délégué, 21 octobre 2026) : prise par le téléphone,
 * à 5 m près au plus — jamais tapée à la main. Une position qui arrive sans sa
 * précision, ou moins précise, n'est PAS enregistrée : le reste de la fiche
 * l'est. On ne refuse pas l'envoi entier — un vieux téléphone qui renvoie une
 * saisie faite hors ligne avant la mise à jour ne doit pas rester bloqué.
 */
export function nettoyerInfos(body: Record<string, unknown>): { erreur: string } | { donnees: InfosStructurelles } {
  const donnees: InfosStructurelles = {};
  const nombre = (v: unknown) => (v === "" || v == null ? null : Number(String(v).replace(",", ".")));
  if ("latitude" in body || "longitude" in body) {
    const lat = nombre(body.latitude);
    const lng = nombre(body.longitude);
    if ((lat == null) !== (lng == null)) return { erreur: "Donnez la latitude ET la longitude, ou aucune des deux." };
    if (lat != null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) return { erreur: "Latitude invalide : un nombre entre -90 et 90 (ex. 5,4467)." };
    if (lng != null && (!Number.isFinite(lng) || lng < -180 || lng > 180)) return { erreur: "Longitude invalide : un nombre entre -180 et 180 (ex. 10,0533)." };
    const precision = nombre(body.precisionGPS);
    if (lat == null) {
      donnees.latitude = null;
      donnees.longitude = null;
      donnees.precisionGPS = null;
      donnees.dateCollecteGPS = null;
    } else if (precision != null && Number.isFinite(precision) && precision >= 0 && precision <= PRECISION_GPS_MAX_M) {
      donnees.latitude = lat;
      donnees.longitude = lng;
      donnees.precisionGPS = Math.round(precision * 10) / 10;
      const le = typeof body.dateCollecteGPS === "string" ? new Date(body.dateCollecteGPS) : null;
      const maintenant = new Date();
      donnees.dateCollecteGPS = (le && !Number.isNaN(le.getTime()) && le <= maintenant ? le : maintenant).toISOString();
    }
    // Sinon : position sans précision, ou trop imprécise — ignorée.
  }
  const liste = (v: unknown, permis: string[]) =>
    Array.isArray(v) ? Array.from(new Set(v.map(String).filter((x) => permis.includes(x)))) : undefined;
  if ("especes" in body) donnees.especes = liste(body.especes, ESPECES.map((e) => e.code)) ?? [];
  if ("joursMarche" in body) donnees.joursMarche = liste(body.joursMarche, JOURS) ?? [];
  if ("infrastructures" in body) donnees.infrastructures = liste(body.infrastructures, INFRASTRUCTURES_MARCHE.map((e) => e.code)) ?? [];
  if ("observations" in body) donnees.observations = String(body.observations ?? "").trim().slice(0, 1000) || null;
  return { donnees };
}
