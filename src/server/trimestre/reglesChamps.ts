/**
 * Règle d'agrégation de chaque champ sur une période multi-mois — étape E4.
 *
 * C'EST LE FICHIER LE PLUS DANGEREUX DU CHANTIER TRIMESTRIEL.
 *
 * Sur un mois, agréger les six arrondissements est toujours une somme. Sur un
 * trimestre, non : additionner trois mois de cheptel compterait trois fois les
 * mêmes bêtes. Mesuré sur les données de juillet 2026 : 37 262 bovins au lieu
 * de 12 664, soit trois fois trop, dans un document signé par le Délégué.
 *
 * Quatre règles, et une seule s'applique à chaque champ :
 *
 *   SOMME            un flux — ce qui se produit, s'abat, se vend, se vaccine.
 *                    Trois mois s'additionnent.
 *   DERNIERE_VALEUR  un stock — ce qui EXISTE à un instant. On retient la
 *                    dernière valeur renseignée du trimestre, jamais la somme.
 *   MOYENNE_PONDEREE un prix. La moyenne des trois moyennes mensuelles serait
 *                    fausse dès que les volumes diffèrent : 100 têtes à 300 000
 *                    et 1 tête à 100 000 ne font pas 200 000 de moyenne.
 *                    Pondération par les quantités vendues du même mois.
 *   TEXTE            ni sommé ni moyenné. On conserve les valeurs distinctes.
 *
 * GARANTIE : `regleDuChamp` LÈVE sur un code inconnu. Aucun champ ne peut être
 * agrégé par défaut. Un champ ajouté au canevas sans règle fait échouer le
 * calcul immédiatement, au lieu de produire un chiffre faux que personne ne
 * vérifiera. Le test `reglesChamps.test.ts` parcourt tous les champs de la base
 * et vérifie que chacun tombe sur une règle.
 */

export type RegleAgregation = "SOMME" | "DERNIERE_VALEUR" | "MOYENNE_PONDEREE" | "TEXTE";

export class ChampSansRegleError extends Error {
  constructor(code: string) {
    super(
      `Aucune règle d'agrégation trimestrielle pour le champ « ${code} ». ` +
        `Ajoutez-la dans src/server/trimestre/reglesChamps.ts — ne laissez JAMAIS ` +
        `le moteur choisir seul : une somme appliquée à un stock triple le résultat.`
    );
    this.name = "ChampSansRegleError";
  }
}

/**
 * Chaque entrée porte son motif. L'ordre compte : la première correspondance
 * gagne, donc les cas particuliers viennent AVANT les familles générales.
 */
interface Regle {
  motif: RegExp;
  regle: RegleAgregation;
  /** Pour MOYENNE_PONDEREE : comment retrouver la quantité qui pondère. */
  ponderePar?: (code: string) => string[];
  pourquoi: string;
}

/**
 * Un prix moyen est pondéré par les quantités VENDUES du même mois et de la
 * même catégorie. Les tableaux 5.x déclarent les ventes par décade : le
 * dénominateur est la somme des trois décades.
 *   T51_BOVIN_VACHE_PRIX_MOYEN → T51_BOVIN_VACHE_VENDU_D1 / _D2 / _D3
 */
function quantitesDuPrix(code: string): string[] {
  const base = code.replace(/_PRIX_MOYEN$/, "");
  return ["_VENDU_D1", "_VENDU_D2", "_VENDU_D3"].map((s) => base + s);
}

const REGLES: Regle[] = [
  // ---- Cas particuliers, avant toute famille -----------------------------
  {
    motif: /_PRIX_MOYEN$/,
    regle: "MOYENNE_PONDEREE",
    ponderePar: quantitesDuPrix,
    pourquoi: "Un prix ne s'additionne pas, et sa moyenne simple ignore les volumes.",
  },
  {
    motif: /_OBSERVATIONS$|^T21_LIEUX$/,
    regle: "TEXTE",
    pourquoi: "Champ libre : ni somme ni moyenne n'a de sens.",
  },
  {
    motif: /_DEBUT$/,
    regle: "DERNIERE_VALEUR",
    pourquoi:
      "Effectif PRÉSENT en début de mois : c'est un stock. Les additionner " +
      "compterait trois fois les mêmes pondeuses, poulets ou reproducteurs.",
  },
  {
    motif: /^T17_NB_ETANGS$|^T17_SUPERFICIE$/,
    regle: "DERNIERE_VALEUR",
    pourquoi: "Le nombre d'étangs et leur superficie existent, ils ne se produisent pas.",
  },
  {
    motif: /_NBCHAMPS$|_SUPERFICIE$/,
    regle: "DERNIERE_VALEUR",
    pourquoi: "Un champ fourrager et sa superficie sont un patrimoine, pas une production.",
  },

  // ---- Familles ----------------------------------------------------------
  {
    motif: /^T11_CHEPTEL_/,
    regle: "DERNIERE_VALEUR",
    pourquoi: "Tableau 1.1 — effectif du cheptel : le stock du département à la date de clôture.",
  },
  {
    motif: /^T12_VOL_/,
    regle: "DERNIERE_VALEUR",
    pourquoi: "Tableau 1.2 — effectif de la volaille : un stock, comme le cheptel.",
  },
  {
    motif: /^T1[3-7]_/,
    regle: "SOMME",
    pourquoi: "Tableaux 1.3 à 1.7 — productions : poussins, œufs, poulets, captures, poissons.",
  },
  {
    motif: /^T2[1-6]_/,
    regle: "SOMME",
    pourquoi: "Tableaux 2.1 à 2.6 — abattages, viande, provende, foin, lait, transformation.",
  },
  {
    motif: /^T3[1-5]_/,
    regle: "SOMME",
    pourquoi: "Tableaux 3.x — actes sanitaires et inspections : des flux d'activité.",
  },
  {
    motif: /^T5[1-6]_/,
    regle: "SOMME",
    pourquoi: "Tableaux 5.x — mises en vente et ventes par décade : des flux.",
  },
];

/** La règle applicable à ce champ. Lève si aucune ne s'applique. */
export function regleDuChamp(code: string): RegleAgregation {
  return trouver(code).regle;
}

/** La règle et son motif — pour afficher au DD pourquoi un chiffre a été obtenu ainsi. */
export function regleExpliquee(code: string): { regle: RegleAgregation; pourquoi: string } {
  const r = trouver(code);
  return { regle: r.regle, pourquoi: r.pourquoi };
}

/** Les champs de quantité qui pondèrent ce prix. Vide si le champ n'est pas un prix. */
export function champsDePonderation(code: string): string[] {
  const r = trouver(code);
  return r.ponderePar ? r.ponderePar(code) : [];
}

function trouver(code: string): Regle {
  const r = REGLES.find((x) => x.motif.test(code));
  if (!r) throw new ChampSansRegleError(code);
  return r;
}

/**
 * Vérifie qu'une liste de champs est entièrement couverte.
 * Appelée au démarrage d'une agrégation : mieux vaut refuser de calculer que
 * produire un trimestre dont un tableau serait faux.
 */
export function verifierCouverture(codes: string[]): { code: string }[] {
  const sansRegle: { code: string }[] = [];
  for (const code of codes) {
    try {
      trouver(code);
    } catch {
      sansRegle.push({ code });
    }
  }
  return sansRegle;
}
