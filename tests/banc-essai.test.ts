/**
 * Le banc d'essai : choisir un modèle à l'aveugle.
 *
 * Ce qui doit être garanti par le CODE, et non par une consigne :
 *
 *  - la correspondance lettre → modèle ne part jamais avec les textes ;
 *  - l'ordre est retiré au sort à chaque cas, sinon il se devine ;
 *  - on refuse de désigner un vainqueur quand l'échantillon ne le permet pas.
 *
 * Ce dernier point compte autant que les autres : un banc d'essai qui tranche
 * toujours, même sans matière, ne sert qu'à habiller une décision déjà prise.
 *
 *   node --import tsx --test tests/banc-essai.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  anonymiser,
  depouiller,
  classer,
  CAS_MINIMUM,
  type ChoixDepouille,
  type Lettre,
} from "../src/server/redaction/bancEssai";
import type { PropositionModele } from "../src/server/redaction/passerelle";

const proposition = (modele: string, texte: string): PropositionModele => ({
  modele,
  texte,
  latenceMs: 100,
});

const TROIS = [
  proposition("alpha", "Le cheptel recule de {{F1.evolution}}."),
  proposition("beta", "On note un recul de {{F1.evolution}} du cheptel."),
  proposition("gamma", "Le cheptel est en recul : {{F1.evolution}}."),
];

test("les textes sont présentés sous des lettres, sans nom de modèle", () => {
  const cas = anonymiser(TROIS);

  assert.equal(cas.candidats.length, 3);
  for (const c of cas.candidats) {
    assert.ok(["A", "B", "C"].includes(c.lettre));
    // Aucun nom de modèle ne doit transparaître dans ce qui est montré.
    for (const p of TROIS) assert.ok(!c.texte.includes(p.modele));
    assert.deepEqual(Object.keys(c), ["lettre", "texte"], "Le candidat expose autre chose que sa lettre et son texte.");
  }
});

test("tous les textes soumis sont présentés, aucun n'est perdu", () => {
  const cas = anonymiser(TROIS);
  const textes = cas.candidats.map((c) => c.texte).sort();
  assert.deepEqual(textes, TROIS.map((p) => p.texte).sort());
});

test("l'ordre change d'un cas à l'autre — sinon il se devine", () => {
  // Sur trente tirages, il serait extraordinaire que « alpha » tombe toujours
  // sur la même lettre si le mélange fonctionne.
  const lettresDAlpha = new Set<Lettre>();
  for (let i = 0; i < 30; i++) {
    const cas = anonymiser(TROIS);
    for (const [lettre, modele] of Array.from(cas.correspondance.entries())) {
      if (modele === "alpha") lettresDAlpha.add(lettre);
    }
  }
  assert.ok(lettresDAlpha.size > 1, "Le même modèle tombe toujours sur la même lettre.");
});

test("le dépouillement rend le modèle retenu et ceux qui sont écartés", () => {
  const cas = anonymiser(TROIS);
  const lettre = cas.candidats[0].lettre;
  const d = depouiller(cas, lettre);

  assert.equal(d.modeleRetenu, cas.correspondance.get(lettre));
  assert.equal(d.modelesEcartes.length, 2);
  assert.ok(!d.modelesEcartes.includes(d.modeleRetenu));
});

test("une lettre qui n'existe pas est refusée, au lieu d'être devinée", () => {
  const cas = anonymiser(TROIS);
  assert.throws(() => depouiller(cas, "E"), /ne figure pas/);
});

test("comparer moins de deux propositions n'a pas de sens", () => {
  assert.throws(() => anonymiser([proposition("seul", "x")]), /au moins deux/);
});

test("un échantillon trop petit ne désigne AUCUN vainqueur", () => {
  const choix: ChoixDepouille[] = Array.from({ length: 4 }, () => ({
    modeleRetenu: "alpha",
    modelesEcartes: ["beta", "gamma"],
  }));
  const c = classer(choix);

  assert.equal(c.vainqueur, null, "Quatre cas ont suffi à trancher : c'est trancher au hasard.");
  assert.ok(c.reserve?.includes("trop peu"));
  assert.equal(c.cas, 4);
});

test("deux modèles trop proches ne départagent pas non plus", () => {
  // 8 contre 7 sur quinze cas : l'écart ne dit rien.
  const choix: ChoixDepouille[] = [
    ...Array.from({ length: 8 }, () => ({ modeleRetenu: "alpha", modelesEcartes: ["beta"] })),
    ...Array.from({ length: 7 }, () => ({ modeleRetenu: "beta", modelesEcartes: ["alpha"] })),
  ];
  const c = classer(choix);

  assert.equal(c.vainqueur, null);
  assert.ok(c.reserve?.includes("trop proches"));
  assert.ok(c.reserve?.includes("coût"), "La réserve doit dire sur quoi départager autrement.");
});

test("une préférence nette, sur assez de cas, désigne un vainqueur", () => {
  const choix: ChoixDepouille[] = [
    ...Array.from({ length: 13 }, () => ({ modeleRetenu: "alpha", modelesEcartes: ["beta"] })),
    ...Array.from({ length: 3 }, () => ({ modeleRetenu: "beta", modelesEcartes: ["alpha"] })),
  ];
  const c = classer(choix);

  assert.equal(c.vainqueur, "alpha");
  assert.equal(c.cas, 16);
  assert.ok(c.cas >= CAS_MINIMUM);
  assert.equal(c.preferences[0].modele, "alpha");
  assert.equal(c.preferences[0].retenu, 13);
});

test("le taux tient compte du nombre de fois où un modèle a été PRÉSENTÉ", () => {
  // Un modèle présenté deux fois et retenu deux fois n'est pas meilleur qu'un
  // modèle présenté vingt fois et retenu quinze fois — il est moins éprouvé.
  const choix: ChoixDepouille[] = [
    ...Array.from({ length: 15 }, () => ({ modeleRetenu: "beaucoup", modelesEcartes: ["autre"] })),
    ...Array.from({ length: 5 }, () => ({ modeleRetenu: "autre", modelesEcartes: ["beaucoup"] })),
  ];
  const c = classer(choix);
  const beaucoup = c.preferences.find((p) => p.modele === "beaucoup")!;
  assert.equal(beaucoup.presente, 20);
  assert.equal(beaucoup.retenu, 15);
  assert.equal(Math.round(beaucoup.taux * 100), 75);
});
