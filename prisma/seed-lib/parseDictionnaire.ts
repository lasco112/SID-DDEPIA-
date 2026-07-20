/**
 * parseDictionnaire.ts — Lecture du dictionnaire de données validé par le DD
 * ---------------------------------------------------------------------------
 * Source : prisma/data/DICO_DONNEES_CANEVAS_MENSUEL_MENOUA.xlsx
 * 5 onglets (S1 à S5), 11 colonnes identiques :
 *   [N° tableau, CODE STABLE, Libellé, Unité, Type, Famille, Section resp.,
 *    Agrégation période longue, Libellé à corriger, Unité à corriger, Validation DD]
 *
 * Une ligne "Tableau X.Y — Titre" (CODE STABLE vide) ouvre un nouveau tableau ;
 * les lignes suivantes sont ses champs, jusqu'à la prochaine ligne "Tableau".
 *
 * Les tableaux de famille EVENEMENT n'ont qu'UNE ligne dans le classeur (le
 * schéma y est décrit en texte libre, ex. "{maladie, espece, ...}") : leur
 * structure typée exacte est déclarée à la main dans EVENEMENT_SCHEMAS
 * ci-dessous plutôt que parsée depuis ce texte, pour garantir les bons types
 * et catégories de référentiel.
 */

import * as XLSX from "xlsx";
import path from "node:path";

export type Famille = "MATRICE" | "NOMINATIF" | "EVENEMENT";
export type Agregation = "STOCK" | "SOMME" | "MOYENNE";
export type TypeValeur = "ENTIER" | "DECIMAL" | "TEXTE";

export interface ChampDico {
  numero: string;
  code: string;
  libelle: string;
  unite: string;
  typeValeur: TypeValeur;
  famille: Famille;
  sectionCode: string;
  agregation: Agregation;
  ordre: number;
}

export interface TableauDico {
  templateCode: string; // "T11", "T22", "T34"...
  numero: string; // "1.1", "2.2", "3.4"...
  titre: string;
  famille: Famille;
  sectionCode: string;
  note: string;
  champs: ChampDico[];
  ordre: number;
}

const SHEETS = [
  "S1 - Productions",
  "S2 - Industries",
  "S3 - Services vétérinaires",
  "S4 - Mouvements",
  "S5 - Commercialisation",
] as const;

/** Un seul FormField par tableau EVENEMENT sert de marqueur dans le classeur ;
 *  la structure réelle (utilisée pour SaisieEvenement.payload et le rendu du
 *  formulaire) est déclarée ici, clé par clé, une fois pour toutes. */
export interface ChampEvenement {
  key: string;
  label: string;
  type: "ref" | "texte" | "entier" | "decimal";
  ref?: string; // catégorie ReferentielItem si type = "ref"
}

export const EVENEMENT_SCHEMAS: Record<string, ChampEvenement[]> = {
  T31_EVT_FOYER: [
    { key: "maladie", label: "Maladie", type: "ref", ref: "MALADIE" },
    { key: "localisation", label: "Localisation", type: "texte" },
    { key: "nbFoyers", label: "Nombre de foyers", type: "entier" },
    { key: "effectifTouche", label: "Effectif touché", type: "entier" },
    { key: "morts", label: "Morts", type: "entier" },
    { key: "mesurePrise", label: "Mesure prise", type: "texte" },
    { key: "animauxSaisis", label: "Animaux saisis", type: "entier" },
  ],
  T32_EVT_VACCINATION: [
    { key: "maladie", label: "Maladie", type: "ref", ref: "MALADIE" },
    { key: "espece", label: "Espèce", type: "ref", ref: "ESPECE" },
    { key: "vaccin", label: "Vaccin", type: "ref", ref: "VACCIN" },
    { key: "effectifVaccine", label: "Effectif vacciné", type: "entier" },
    { key: "localites", label: "Localités", type: "texte" },
  ],
  T33_EVT_ACTIVITE_PRIVEE: [
    { key: "activite", label: "Activité", type: "ref", ref: "ACTE_VETERINAIRE" },
    { key: "espece", label: "Espèce", type: "ref", ref: "ESPECE" },
    { key: "maladie", label: "Maladie", type: "ref", ref: "MALADIE" },
    { key: "effectif", label: "Effectif", type: "entier" },
  ],
  T35_EVT_SAISIE_ABATTOIR: [
    { key: "affection", label: "Affection / motif", type: "ref", ref: "MOTIF_SAISIE" },
    { key: "produitSaisi", label: "Produit saisi", type: "texte" },
    { key: "quantiteKg", label: "Quantité (kg)", type: "decimal" },
    { key: "coutPerteFCFA", label: "Coût de la perte (FCFA)", type: "decimal" },
  ],
  T41_EVT_EXPORT: [
    { key: "espece", label: "Espèce", type: "ref", ref: "ESPECE" },
    { key: "destination", label: "Destination", type: "texte" },
    { key: "effectif", label: "Effectif", type: "entier" },
  ],
  T42_EVT_IMPORT: [
    { key: "espece", label: "Espèce", type: "ref", ref: "ESPECE" },
    { key: "paysOrigine", label: "Pays d'origine", type: "texte" },
    { key: "effectif", label: "Effectif", type: "entier" },
  ],
  T43_EVT_TRANSIT: [
    { key: "espece", label: "Espèce", type: "ref", ref: "ESPECE" },
    { key: "paysProvenance", label: "Pays de provenance", type: "texte" },
    { key: "paysDestination", label: "Pays de destination", type: "texte" },
    { key: "effectif", label: "Effectif", type: "entier" },
  ],
  T44_EVT_CIRCULATION: [
    { key: "especeOuProduit", label: "Espèce ou produit", type: "texte" },
    { key: "pointDepart", label: "Point de départ", type: "texte" },
    { key: "destination", label: "Destination", type: "texte" },
    { key: "modeDeplacement", label: "Mode de déplacement", type: "texte" },
    { key: "effectif", label: "Effectif", type: "entier" },
  ],
};

function normType(t: string): TypeValeur {
  if (t === "ENTIER" || t === "DECIMAL") return t;
  return "TEXTE";
}

export function parseDictionnaire(
  filePath: string = path.join(
    process.cwd(),
    "prisma",
    "data",
    "DICO_DONNEES_CANEVAS_MENSUEL_MENOUA.xlsx"
  )
): TableauDico[] {
  const wb = XLSX.readFile(filePath);
  const tableaux: TableauDico[] = [];
  let tableauOrdre = 0;

  for (const sheetName of SHEETS) {
    const ws = wb.Sheets[sheetName];
    if (!ws) throw new Error(`Onglet introuvable dans le dictionnaire : ${sheetName}`);
    const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

    let courant: TableauDico | null = null;
    let champOrdre = 0;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const [numeroOrTitre, code, libelle, unite, type, famille, sectionCode, agregation, , , ] = row;
      if (!code) {
        // Ligne d'en-tête de tableau : "Tableau 1.1 — Effectif du cheptel"
        const m = String(numeroOrTitre).match(/Tableau\s+([\d.]+)\s*[—-]\s*(.+)/);
        if (!m) continue; // ligne vide de séparation
        const [, numero, titre] = m;
        const note = String(row[8] ?? "");
        tableauOrdre += 1;
        champOrdre = 0;
        courant = {
          templateCode: "T" + numero.replace(/\./g, ""),
          numero,
          titre: titre.trim(),
          famille: "MATRICE", // ajusté dès le premier champ rencontré
          sectionCode: "",
          note,
          champs: [],
          ordre: tableauOrdre,
        };
        tableaux.push(courant);
        continue;
      }

      if (!courant) {
        throw new Error(`Ligne de champ orpheline (sans tableau) : ${JSON.stringify(row)}`);
      }
      courant.famille = famille as Famille;
      courant.sectionCode = sectionCode;
      champOrdre += 1;
      courant.champs.push({
        numero: String(numeroOrTitre),
        code,
        libelle,
        unite,
        typeValeur: normType(type),
        famille: famille as Famille,
        sectionCode,
        agregation: agregation as Agregation,
        ordre: champOrdre,
      });
    }
  }

  return tableaux;
}
