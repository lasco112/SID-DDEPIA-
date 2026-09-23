/**
 * Conformité du rapport trimestriel au canevas RÉGIONAL, qui fait foi.
 *
 * Décision du Délégué du 14 août 2026 : le canevas de la DREPIA-Ouest fait
 * autorité ; le canevas départemental n'en est qu'une adaptation, et là où les
 * deux divergent, c'est le régional qui a raison.
 *
 * TROIS ADAPTATIONS SONT LÉGITIMES, et neutralisées avant comparaison. Sans
 * cela, tous les tableaux paraîtraient divergents pour de bonnes raisons :
 *
 *   - la maille : huit départements et le siège régional deviennent six
 *     arrondissements ;
 *   - la période : semestrielle devient trimestrielle ;
 *   - les totaux : le département ajoute la comparaison à la même période de
 *     l'année précédente, que le régional n'a pas.
 *
 * Tout le reste — libellés, accents, casse, ordre — doit suivre le régional.
 *
 * LES ÉCARTS ASSUMÉS sont listés dans ECARTS_ASSUMES avec leur justification :
 * le canevas régional a des défauts de mise en forme — une colonne sans nom, un
 * intitulé resté en première ligne de données, un espace manquant — que
 * l'adaptation départementale a corrigés. Les « rétablir » rendrait le document
 * moins lisible sans le rendre plus conforme.
 *
 * Le test échoue dans les DEUX sens : si un écart non justifié apparaît, et si
 * un écart assumé cesse de se produire sans que la liste soit mise à jour.
 *
 *   npm run test:canevas
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import PizZip from "pizzip";
import { SECTION_I } from "../src/server/trimestre/canevas/sectionI";
import { SECTION_BUDGET } from "../src/server/trimestre/canevas/sectionBudget";
import { SECTION_II_BOVIN } from "../src/server/trimestre/canevas/sectionBovin";
import { SECTION_II_OVIN, SECTION_II_CAPRIN, SECTION_II_EQUIDES } from "../src/server/trimestre/canevas/sectionElevages";
import { SECTION_II_PORCIN, SECTION_II_AVICOLE } from "../src/server/trimestre/canevas/sectionPorcinAvicole";
import { SECTION_II_AUTRES, SECTION_III_PECHE } from "../src/server/trimestre/canevas/sectionPecheEtDivers";
import { SECTION_IV_SANTE } from "../src/server/trimestre/canevas/sectionSanteAnimale";
import { colonnesDe, lignesDe, inventaireSection } from "../src/server/trimestre/canevas/rendu";
import { type Bloc, type ContexteCanevas, type SectionCanevas } from "../src/server/trimestre/canevas/types";

const REGIONAL = "docs/canevas/CANEVAS_REGIONAL_DREPIA-OUEST_S1-2026.docx";

const CTX: ContexteCanevas = {
  periodeCourt: "T1 2026",
  periodeCourtN1: "T1 2025",
  annee: 2026,
  mois: ["JANVIER", "FÉVRIER", "MARS"],
  arrondissements: ["Dschang", "Fokoué", "Fongo-Tongo", "Nkong-Ni", "Penka-Michel", "Santchou"],
};

const SECTIONS: SectionCanevas[] = [
  SECTION_I, SECTION_BUDGET, SECTION_II_BOVIN, SECTION_II_OVIN, SECTION_II_CAPRIN,
  SECTION_II_EQUIDES, SECTION_II_PORCIN, SECTION_II_AVICOLE, SECTION_II_AUTRES, SECTION_III_PECHE,
  SECTION_IV_SANTE,
];

/**
 * Écarts au régional qui sont ASSUMÉS, et non des oublis.
 *
 * Le canevas régional a des défauts de mise en forme que l'adaptation
 * départementale a corrigés. Les « rétablir » rendrait le document moins
 * lisible, pas plus conforme : ce ne sont pas des différences de contenu.
 * Chaque entrée porte sa justification ; toute autre divergence est une faute.
 */
const ECARTS_ASSUMES = new Set([
  // Le régional laisse la première cellule d'en-tête VIDE. Le département
  // l'intitule « Désignation ». Une colonne sans nom n'est pas un contenu à
  // préserver.
  "I n° 4",
  "I n° 7",
  // Le régional place « Structures » en PREMIÈRE LIGNE de données, séquelle
  // d'une ligne d'en-tête scindée. Le département en a fait un en-tête propre.
  "I n° 12",
  // Le régional écrit « Prix moyenFCFA/Unité », sans espace. Le département a
  // rétabli l'espace manquant.
  "II-1 n° 21",
  // Même séquelle qu'au n° 12 : « Catégorie » traîne en première ligne de
  // données alors que c'est un intitulé de colonne.
  "II-6 n° 42",
  "II-6 n° 44",
  // Personnel par grade : le régional laisse l'en-tête de la première colonne
  // vide (le département l'intitule « Grade ») et écrit « Technicien
  // Supérieurs d’élevage » et « Technicien d’aquacuture » : fautes de frappe
  // corrigées.
  "I n° 3",
  // Pendant du n° 12 pour l'investissement : il en a la forme, et le test
  // l'apparie au n° 12 par son titre, dont il ne diffère que d'un mot.
  "I n° 102",
  // Le régional étage l'en-tête sur deux lignes : « STRUCTURES » au-dessus
  // des territoires, « MOIS » au-dessus des mois. Sur une ligne d'en-tête, la
  // première colonne — celle des mois — s'intitule « MOIS ».
  "I n° 13",
  // En-tête du régional sur deux lignes (« Types d’infrastructures d’élevage »
  // coiffant trois colonnes) : mis à plat, chaque colonne garde son intitulé.
  "II-1 n° 108",
  // Le régional écrit « Castre », sans accent, aux abattages et à la viande.
  "II-1 n° 16",
  "II-1 n° 18",
  // Le régional colle « récolté(en litres) » et « Cire(enkg) » : espaces
  // rétablis.
  "II-7-9 n° 52",
  // En-tête du régional sur trois lignes (« Nombre de / Pisciculteurs »,
  // « Etangs / Nbre / Superficie (m2) »…) : mis à plat, chaque colonne portant
  // son intitulé complet.
  "III n° 111",
]);

// ------------------------------------------------------------ lecture du canevas

const texteDe = (f: string) =>
  f.replace(/<w:tab\/>/g, " ").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&")
   .replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
   .replace(/\s+/g, " ").trim();

interface TableauOfficiel {
  entetes: string[];
  lignes: string[];
  /** Titre de la légende régionale, sans « Tableau n° X : ». Vide si le tableau n'en a pas. */
  titre?: string;
}
const region: TableauOfficiel[] = [];

/**
 * Les légendes de tableau contenues dans un fragment du document, dans l'ordre.
 */
function legendesDans(fragment: string): string[] {
  return fragment
    .split("</w:p>").map(texteDe).filter(Boolean)
    .filter((p) => /^(le\s+)?tableau\s*(n\s*[°o0]?\s*)?\d+/i.test(p))
    .map((p) => p.replace(/^(le\s+)?tableau\s*(n\s*[°o0]?\s*)?\d+\s*[:.]?\s*/i, "").trim())
    .filter(Boolean);
}

/**
 * La légende d'un tableau régional, déduite du texte qui l'entoure.
 *
 * Le régional place presque toujours la légende AVANT le tableau : c'est la
 * dernière légende qui le précède. Il arrive qu'elle vienne APRÈS — celle des
 * produits de la ruche, « Le tableau 53 : … ». Mais une légende qui suit un
 * tableau appartient en général au tableau SUIVANT : l'attribuer au précédent
 * faisait « voler » à un organigramme sans légende celle du tableau n° 1. On
 * ne retient donc une légende suivante que si une autre légende vient encore
 * après elle, avant le tableau suivant — la seconde étant alors celle du
 * suivant.
 */
function legendeDe(avant: string, apres: string): string | undefined {
  const precedentes = legendesDans(avant);
  if (precedentes.length) return precedentes[precedentes.length - 1];
  const suivantes = legendesDans(apres);
  return suivantes.length >= 2 ? suivantes[0] : undefined;
}

before(() => {
  if (!existsSync(REGIONAL)) return;
  const xml = new PizZip(readFileSync(REGIONAL)).file("word/document.xml")!.asText();
  const corps = xml.slice(xml.indexOf("<w:body>"), xml.lastIndexOf("</w:body>"));
  let i = 0;
  const bornes: { d: number; f: number }[] = [];
  while (i < corps.length) {
    const d = corps.indexOf("<w:tbl>", i);
    if (d < 0) break;
    let prof = 0, j = d;
    while (j < corps.length) {
      const o = corps.indexOf("<w:tbl>", j), f = corps.indexOf("</w:tbl>", j);
      if (f < 0) break;
      if (o >= 0 && o < f) { prof++; j = o + 7; } else { prof--; j = f + 8; if (prof === 0) break; }
    }
    bornes.push({ d, f: j });
    i = j;
  }
  bornes.forEach(({ d, f }, k) => {
    const tbl = corps.slice(d, f);
    const trs = Array.from(tbl.slice(7, -8).matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g))
      .map((m) => m[0]).filter((t) => !t.includes("<w:tbl>"));
    const cel = (tr: string) => Array.from(tr.matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)).map((c) => texteDe(c[0]));
    const avant = corps.slice(k > 0 ? bornes[k - 1].f : 0, d);
    const apres = corps.slice(f, k + 1 < bornes.length ? bornes[k + 1].d : corps.length);
    region.push({
      entetes: trs.length ? cel(trs[0]) : [],
      lignes: trs.slice(1).map((tr) => cel(tr)[0] ?? "").filter(Boolean),
      titre: legendeDe(avant, apres),
    });
  });
});

// -------------------------------------------------------------- neutralisation

/**
 * Un millésime dépend de la période : « ANNEE 2025 » au régional du premier
 * semestre 2026 devient « ANNEE 2026 » l'année suivante. On compare donc les
 * libellés sans leurs millésimes.
 */
const sansAnnee = (s: string) => s.replace(/\b(19|20)\d{2}\b/g, "{A}");

const cle = (s: string) =>
  sansAnnee(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Libellés relevant de la maille ou de la période : ils DOIVENT différer. */
const TERRITOIRES = new Set([
  "departement", "departements", "arrondissement", "arrondissements",
  "btos", "bamboutos", "hautnkam", "hautpltx", "hautspltx", "hautsplateaux", "hautplateaux",
  "koungkhi", "nkoungkhi", "menoua", "mifi", "nde", "noun",
  "drepiaosiege", "drepiasiege", "drepiao", "drepia",
  "dschang", "fokoue", "fongotongo", "nkongni", "penkamichel", "santchou",
  "ecart",
  "haut", "hauts", "nkam", "pltx", "plateaux", "nkoung", "khi", "o", "siege",
  "categoriedepart", "categoriearrondissement", "categoriedepartement", "categoriedepartements",
  "nationalitearrondissement", "nationalitedepartement", "nationalitedepartements",
  "equipementsarrondissement", "equipementsdepartement", "equipementsdepartements",
  "especesarrondissement", "especesdepartement", "especesdepartements",
  "arrondissementenginsdepeches", "departementenginsdepeches", "departementsenginsdepeches",
  "produitsarrondissement", "produitsdepartement", "produitsdepartements",
  "arrondissementespeces", "departementespeces",
  "arrondissementaffections", "departementsaffections", "departementaffections",
  // Le siège : « DREPIA siège » au régional, « DDEPIA » au département.
  "ddepia", "ddepiasiege",
  "hautsnkam", "hnkam", "hplateaux", "kkhi",
  "departementsespeces",
  // Structures RÉGIONALES, sans équivalent dans un département : le centre de
  // formation zootechnique et la station de Kounden (décision D1).
  "cnfzvh", "cnfzv", "kounden",
  // « RAS » (rien à signaler) tient lieu de ligne quand un territoire n'a rien.
  "ras",
  // Les mois de la période : ceux du semestre au régional, du trimestre ici.
  "janvier", "fevrier", "mars", "avril", "mai", "juin",
  "juillet", "aout", "septembre", "octobre", "novembre", "decembre",
]);

const estNeutre = (s: string) => {
  const k = cle(s);
  // Un libellé purement numérique — « 1 », « 2 », « 3 » — ne dit rien du
  // contenu d'un tableau. Le compter appariait le tableau des contraintes
  // stratégiques à celui des centres d'alevinage, qui numérotent tous deux
  // leurs lignes.
  if (/^\d+$/.test(k) || /^\s*\d+\s*$/.test(s)) return true;
  // « Bamboutos(6) » : le régional suffixe parfois le territoire d'un effectif.
  return !k || k.startsWith("total") || TERRITOIRES.has(k) || TERRITOIRES.has(k.replace(/\d+$/, ""));
};

const significatifs = (t: TableauOfficiel) => [...t.entetes, ...t.lignes].filter((l) => l && !estNeutre(l));

function ressemblance(a: TableauOfficiel, b: TableauOfficiel): number {
  const A = new Set(significatifs(a).map(cle));
  const B = new Set(significatifs(b).map(cle));
  if (!A.size || !B.size) return 0;
  let c = 0;
  A.forEach((x) => { if (B.has(x)) c++; });
  return c / Math.max(A.size, B.size);
}

/**
 * Mots porteurs d'un titre de tableau. Les mots vides et ceux de la maille
 * (« par département », « par arrondissement ») sont écartés : le titre
 * départemental les transpose légitimement.
 */
const MOTS_VIDES = new Set([
  "de", "la", "le", "les", "des", "du", "d", "l", "par", "et", "en", "a", "au", "aux", "dans", "sur", "un", "une",
  "departement", "departements", "arrondissement", "arrondissements", "region", "tableau", "n",
]);
const motsTitre = (t: string) =>
  new Set(
    t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .split(/[^a-z0-9]+/).filter((m) => m && !/^\d+$/.test(m) && !MOTS_VIDES.has(m))
      // Pluriel et singulier désignent le même tableau : « structure » et
      // « structures » ne sont pas deux titres.
      .map((m) => m.replace(/s$/, ""))
  );

function ressemblanceTitre(a: string, b: string): number {
  const A = motsTitre(a), B = motsTitre(b);
  if (!A.size || !B.size) return 0;
  let c = 0;
  A.forEach((x) => { if (B.has(x)) c++; });
  return c / Math.max(A.size, B.size);
}

/**
 * L'original régional d'un tableau décrit.
 *
 * On apparie D'ABORD PAR LE TITRE de la légende. L'appariement par simple
 * ressemblance du contenu avait un angle mort : un tableau décrit avec les
 * MAUVAISES colonnes ressemblait au tableau régional qui porte ces colonnes-là,
 * et passait pour conforme. C'est ainsi que le tableau de l'apiculture, doté
 * des colonnes de la pisciculture, était apparié au tableau de l'aquaculture —
 * et jugé sans défaut.
 *
 * La ressemblance du contenu ne sert plus que de repli, pour les tableaux sans
 * titre (budget-programme) ou dont le régional n'a pas de légende.
 */
function originalRegional(b: Extract<Bloc, { type: "tableau" }>, mien: TableauOfficiel) {
  if (b.titre) {
    let meilleur: TableauOfficiel | null = null, score = 0;
    for (const r of region) {
      if (!r.titre) continue;
      const s = ressemblanceTitre(b.titre, r.titre);
      if (s > score) { score = s; meilleur = r; }
    }
    if (meilleur && score >= 0.6) return { original: meilleur, parTitre: true };
  }
  let meilleur: TableauOfficiel | null = null, score = 0;
  for (const r of region) {
    const s = ressemblance(mien, r);
    if (s > score) { score = s; meilleur = r; }
  }
  return { original: meilleur && score >= 0.5 ? meilleur : null, parTitre: false };
}

/**
 * Identifiant d'un tableau dans les messages et dans ECARTS_ASSUMES. Un tableau
 * sans numéro est désigné par son titre : une même section en compte plusieurs,
 * et « I n° — » les confondrait.
 */
const idTableau = (s: SectionCanevas, b: Extract<Bloc, { type: "tableau" }>) =>
  b.numero != null ? `${s.cle} n° ${b.numero}` : `${s.cle} « ${b.titre} »`;

const tableauxDe = (s: SectionCanevas) =>
  s.blocs.filter((b): b is Extract<Bloc, { type: "tableau" }> => b.type === "tableau");

/** Compare chaque tableau décrit à son original régional. */
function analyser() {
  const divergents: { id: string; titre: string; ecarts: string[] }[] = [];
  let conformes = 0, sansOriginal = 0, total = 0;

  for (const section of SECTIONS) {
    for (const b of tableauxDe(section)) {
      total++;
      const mien: TableauOfficiel = { entetes: colonnesDe(b, CTX), lignes: lignesDe(b, CTX) };
      const { original: meilleur } = originalRegional(b, mien);
      if (!meilleur) { sansOriginal++; continue; }

      const a = significatifs(mien);
      const b2 = significatifs(meilleur);
      const parCle = new Map(b2.map((l) => [cle(l), l]));
      const ecarts: string[] = [];
      for (const l of a) {
        const orig = parCle.get(cle(l));
        if (orig === undefined) ecarts.push(`« ${l} » absent du régional`);
        else if (sansAnnee(orig) !== sansAnnee(l)) ecarts.push(`« ${l} » au lieu de « ${orig} »`);
      }
      const miens = new Set(a.map(cle));
      for (const l of b2) if (!miens.has(cle(l))) ecarts.push(`« ${l} » manquant chez nous`);

      if (ecarts.length === 0) conformes++;
      else divergents.push({ id: idTableau(section, b), titre: b.titre, ecarts });
    }
  }
  return { divergents, conformes, sansOriginal, total };
}

// ------------------------------------------------------------------- tests

test("le canevas régional est présent dans le dépôt", () => {
  assert.ok(existsSync(REGIONAL), `Fichier absent : ${REGIONAL}`);
  assert.ok(region.length > 100, `seulement ${region.length} tableaux lus`);
});

test("aucun écart au régional en dehors de ceux qui sont assumés", () => {
  const { divergents } = analyser();
  const inattendues = divergents.filter((d) => !ECARTS_ASSUMES.has(d.id));
  assert.deepEqual(
    inattendues.map((d) => `${d.id} — ${d.titre} : ${d.ecarts.join(" ; ")}`),
    [],
    "un tableau s'écarte du régional sans justification : c'est une faute, ou un écart à assumer explicitement"
  );
});

test("les écarts assumés se produisent tous encore", () => {
  const { divergents } = analyser();
  const ids = new Set(divergents.map((d) => d.id));
  const disparus = Array.from(ECARTS_ASSUMES).filter((id) => !ids.has(id));
  assert.deepEqual(
    disparus, [],
    "ces écarts ne se produisent plus : retirez-les de ECARTS_ASSUMES pour que le filet reste tendu"
  );
});

test("la conformité progresse", () => {
  const { conformes, total, sansOriginal } = analyser();
  console.log(`      ${conformes} conformes · ${total - conformes - sansOriginal} divergents · ${sansOriginal} sans original régional`);
  assert.ok(conformes >= 69, `régression : ${conformes} tableaux conformes au lieu de 69 au minimum`);
});

// -------------------------------------------------- contrôles de structure

test("aucun tableau ne porte de colonne « Écart » : l'écart est une ligne de pied", () => {
  // Le tableau des alevins en portait une, sans aucune ligne. Il suit
  // désormais le régional, où l'écart est une ligne.
  const porteurs: string[] = [];
  for (const section of SECTIONS) {
    for (const b of tableauxDe(section)) {
      if (colonnesDe(b, CTX).some((c) => /^écart$/i.test(c))) porteurs.push(idTableau(section, b));
    }
  }
  assert.deepEqual(porteurs, []);
});

test("aucune période n'est écrite en dur dans la description du canevas", () => {
  /*
   * « TOTAL 1er S1 2026 », « Production semestrielle d'alevins », « Bilan
   * épidémiologique du trimestre » : recopiés du régional, ils sortaient tels
   * quels dans un rapport du troisième trimestre. Une période s'écrit par
   * jeton — {P}, {A}, {M1}… — jamais en clair.
   */
  const fige = (t: string) => /\b(19|20)\d{2}\b|semest|trimest|\bS[12]\b|\bT[1-4]\b/i.test(t);
  const figes: string[] = [];
  for (const section of SECTIONS) {
    for (const b of section.blocs) {
      const textes =
        b.type === "titre" ? [b.texte]
        : b.type === "tableau" ? [b.titre, ...(b.kind === "arrondissements" ? [b.enteteLibelle] : b.entetes), ...b.lignes]
        : [];
      for (const t of textes) if (fige(t)) figes.push(`${section.cle} : « ${t} »`);
    }
  }
  assert.deepEqual(figes, []);
});

test("les jetons de période sont tous substitués", () => {
  for (const section of SECTIONS) {
    for (const b of tableauxDe(section)) {
      const restants = [...colonnesDe(b, CTX), ...lignesDe(b, CTX)].filter((x) => x.includes("{"));
      assert.deepEqual(restants, [], `${section.cle} : jeton non remplacé`);
    }
  }
});

test("les clés des zones de texte sont uniques dans chaque section", () => {
  for (const section of SECTIONS) {
    const cles = section.blocs.filter((b) => b.type === "zoneTexte").map((b) => (b as { cle: string }).cle);
    assert.equal(new Set(cles).size, cles.length, `${section.cle} : deux zones portent la même clé`);
  }
});

test("tout tableau du rapport porte une légende, donc un numéro", () => {
  // Décision du Délégué : aucun tableau sans numéro. Une légende vide
  // produisait un tableau hors de la numérotation et de la liste des tableaux.
  const sansLegende: string[] = [];
  for (const section of SECTIONS) {
    for (const b of tableauxDe(section)) if (!b.titre.trim()) sansLegende.push(idTableau(section, b));
  }
  assert.deepEqual(sansLegende, []);
});

test("le budget-programme décrit ses quatre programmes, un tableau légendé chacun", () => {
  const titres = SECTION_BUDGET.blocs.filter((b) => b.type === "titre" && b.niveau === 2).map((b) => (b as { texte: string }).texte);
  assert.equal(titres.length, 4);
  for (const code of ["053", "055", "057", "059"]) {
    assert.ok(titres.some((t) => t.startsWith(`PROGRAMME ${code} :`)), `programme ${code} manquant`);
  }
  const tableaux = tableauxDe(SECTION_BUDGET);
  assert.deepEqual(
    tableaux.map((b) => b.titre),
    ["053", "055", "057", "059"].map((c) => `Activités menées au titre du programme ${c}`)
  );
  // Numéros INTERNES 104 à 107 : ils adressent les saisies de la colonne
  // « Description du niveau de réalisation ». Le numéro affiché, lui, vient de
  // la légende.
  assert.deepEqual(tableaux.map((b) => b.numero), [104, 105, 106, 107]);
});

test("l'inventaire des sections est cohérent", () => {
  let tableaux = 0;
  for (const section of SECTIONS) {
    const inv = inventaireSection(section, CTX);
    assert.ok(inv.titres > 0, `${section.cle} : aucun titre`);
    tableaux += inv.tableaux;
  }
  // 86 : le tableau de promptitude et de complétude est retiré (décision du Délégué).
  assert.equal(tableaux, 86, "86 tableaux décrits à ce jour");
});

test("les numéros internes sont uniques : ils adressent les saisies", () => {
  const vus = new Map<number, string>();
  const doublons: string[] = [];
  for (const section of SECTIONS) {
    for (const b of tableauxDe(section)) {
      assert.ok(b.numero != null, `${section.cle} « ${b.titre} » : numéro interne manquant`);
      if (vus.has(b.numero!)) doublons.push(`n° ${b.numero} : « ${vus.get(b.numero!)} » et « ${b.titre} »`);
      vus.set(b.numero!, b.titre);
    }
  }
  assert.deepEqual(doublons, []);
});
