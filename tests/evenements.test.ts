/**
 * Classement des listes du mensuel dans les tableaux du canevas (étape c2).
 *
 * Ces règles décident où une vaccination, un acte de clinique ou un mouvement
 * de bétail est compté. Une erreur ici ne se voit pas dans le rapport — un
 * chiffre plausible dans la mauvaise case — d'où ces vérifications une à une.
 *
 *   node --import tsx --test tests/evenements.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LIAISONS_EVENEMENTS, especeCirculation, liaisonEvenementDe,
} from "../src/server/trimestre/evenements";
import { SECTION_IV_SANTE } from "../src/server/trimestre/canevas/sectionSanteAnimale";
import { SECTION_II_OVIN, SECTION_II_CAPRIN } from "../src/server/trimestre/canevas/sectionElevages";
import { SECTION_II_PORCIN } from "../src/server/trimestre/canevas/sectionPorcinAvicole";
import { colonnesDe, lignesDe } from "../src/server/trimestre/canevas/rendu";
import type { Bloc, ContexteCanevas } from "../src/server/trimestre/canevas/types";

const CTX: ContexteCanevas = {
  periodeCourt: "T3 2026", periodeCourtN1: "T3 2025", annee: 2026,
  mois: ["JUILLET", "AOÛT", "SEPTEMBRE"],
  arrondissements: ["Dschang", "Fokoué", "Fongo-Tongo", "Nkong-Ni", "Penka-Michel", "Santchou"],
};

const liaison = (numero: number) => LIAISONS_EVENEMENTS.find((l) => l.numero === numero)!;

test("circulation : une seule espèce reconnue, sinon rien n'est deviné", () => {
  assert.equal(especeCirculation("Bovins"), "bovin");
  assert.equal(especeCirculation("bœufs de boucherie"), "bovin");
  assert.equal(especeCirculation("Moutons"), "ovin");
  assert.equal(especeCirculation("Chèvres"), "caprin");
  assert.equal(especeCirculation("Porcelets"), "porcin");
  assert.equal(especeCirculation("Petits ruminants"), "ambigu");
  assert.equal(especeCirculation("Bovins et ovins"), "ambigu");
  assert.equal(especeCirculation("Volaille"), null);
});

test("une ligne ambiguë n'est signalée qu'une fois, et ne grossit aucun total", () => {
  const ambigu = { especeOuProduit: "Petits ruminants", effectif: 40 };
  const signalements = LIAISONS_EVENEMENTS.filter((l) => l.sources.includes("T44"))
    .map((l) => l.categorie(ambigu, "T44"))
    .filter((c) => c === null);
  assert.equal(signalements.length, 1);
  assert.ok(LIAISONS_EVENEMENTS.filter((l) => l.sources.includes("T44")).every((l) => l.totalClasseesSeulement));
});

test("vaccination : la rage n'est « canine » que pour un chien", () => {
  const v = liaison(64);
  assert.equal(v.categorie({ maladie: "MAL_RAGE", espece: "ESP_CANIN" }, "T32"), "Rage canine");
  assert.equal(v.categorie({ maladie: "MAL_RAGE", espece: "ESP_FELIN" }, "T32"), null);
  assert.equal(v.categorie({ maladie: "MAL_PPR", espece: "ESP_CAPRIN" }, "T32"), "PPR");
  // Le charbon BACTÉRIDIEN n'est pas le charbon SYMPTOMATIQUE du canevas.
  assert.equal(v.categorie({ maladie: "MAL_CHARBON_BACTERIDIEN" }, "T32"), null);
  // Les vaccinations des cliniques privées comptent ; leurs autres actes, non.
  assert.equal(v.categorie({ activite: "ACTE_VACCINATION_PRIVEE", maladie: "MAL_NEWCASTLE" }, "T33"), "MNC");
  assert.equal(v.categorie({ activite: "ACTE_CONSULTATION", maladie: "MAL_NEWCASTLE" }, "T33"), undefined);
});

test("cliniques : chaque acte va à son tableau, chaque espèce à sa colonne", () => {
  assert.equal(liaison(65).categorie({ activite: "ACTE_CONSULTATION", espece: "ESP_LAPIN" }, "T33"), "Lapin");
  assert.equal(liaison(66).categorie({ activite: "ACTE_DEPARASITAGE", espece: "ESP_LAPIN" }, "T33"), "Lapine");
  assert.equal(liaison(65).categorie({ activite: "ACTE_CONSULTATION", espece: "ESP_CAMELIN" }, "T33"), "Autres");
  assert.equal(liaison(65).categorie({ activite: "ACTE_DEPARASITAGE", espece: "ESP_BOVIN" }, "T33"), undefined);
  // Six colonnes seulement aux castrations : un chat castré n'a pas de case.
  assert.equal(liaison(67).categorie({ activite: "ACTE_CASTRATION", espece: "ESP_FELIN" }, "T33"), null);
});

test("affections : la vaccination n'est pas une affection ; la coccidiose n'est « aviaire » que chez la volaille", () => {
  const a = liaison(68);
  assert.equal(a.categorie({ activite: "ACTE_VACCINATION_PRIVEE", maladie: "MAL_PPR" }, "T33"), undefined);
  assert.equal(a.categorie({ activite: "ACTE_CONSULTATION", maladie: "MAL_PPR" }, "T33"), "PPR");
  assert.equal(a.categorie({ activite: "ACTE_CONSULTATION", maladie: "MAL_COCCIDIOSE", espece: "ESP_VOLAILLE" }, "T33"), "Coccidiose aviaire");
  assert.equal(a.categorie({ activite: "ACTE_CONSULTATION", maladie: "MAL_COCCIDIOSE", espece: "ESP_LAPIN" }, "T33"), null);
});

test("chaque case visée existe au canevas, au caractère près", () => {
  const blocs = [SECTION_IV_SANTE, SECTION_II_OVIN, SECTION_II_CAPRIN, SECTION_II_PORCIN]
    .flatMap((s) => s.blocs)
    .filter((b): b is Extract<Bloc, { type: "tableau" }> => b.type === "tableau");
  const ecarts: string[] = [];
  for (const l of LIAISONS_EVENEMENTS) {
    const bloc = blocs.find((b) => liaisonEvenementDe(b.numero) === l);
    if (!bloc) { ecarts.push(`${l.titre} : tableau introuvable`); continue; }
    const cases = new Set(l.orientation === "lignes" ? colonnesDe(bloc, CTX) : lignesDe(bloc, CTX));
    // Toutes les catégories que les règles peuvent produire.
    const produites = new Set<string>();
    const echantillons = [
      ...["ESP_BOVIN", "ESP_OVIN", "ESP_CAPRIN", "ESP_PORCIN", "ESP_EQUIN", "ESP_CANIN", "ESP_FELIN", "ESP_VOLAILLE", "ESP_LAPIN", "ESP_CAMELIN"]
        .flatMap((espece) => ["ACTE_CONSULTATION", "ACTE_DEPARASITAGE", "ACTE_CASTRATION", "ACTE_VACCINATION_PRIVEE"]
          .flatMap((activite) => ["MAL_PPR", "MAL_NEWCASTLE", "MAL_GUMBORO", "MAL_DERMATOSE_NODULAIRE", "MAL_PASTEURELLOSE",
            "MAL_COLIBACILLOSE_AVIAIRE", "MAL_RAGE", "MAL_COCCIDIOSE", "MAL_FIEVRE_APHTEUSE"]
            .map((maladie) => ({ espece, activite, maladie })))),
      ...["Moutons", "Chèvres", "Porcs"].map((especeOuProduit) => ({ especeOuProduit })),
    ];
    for (const e of echantillons) for (const s of l.sources) {
      const c = l.categorie(e, s);
      if (c) produites.add(c);
    }
    for (const c of Array.from(produites)) if (!cases.has(c)) ecarts.push(`${l.titre} : « ${c} » absent du tableau`);
    for (const t of Object.keys(l.textes ?? {})) if (!cases.has(t)) ecarts.push(`${l.titre} : colonne « ${t} » absente`);
  }
  assert.deepEqual(ecarts, []);
  assert.ok(liaisonEvenementDe(109), "la circulation des porcins doit être reliée");
});
