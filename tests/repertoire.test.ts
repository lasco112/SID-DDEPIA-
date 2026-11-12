/**
 * LE RÉPERTOIRE DES ACTEURS EPIA (demande du Délégué, 12 novembre 2026) :
 * la fiche de chaque filière, la lecture du fichier Word du canevas régional,
 * et son import dans le registre d'un arrondissement.
 *
 * Le fichier Word est FABRIQUÉ ici, avec des noms inventés : un vrai
 * répertoire (noms, téléphones) n'entre jamais dans le dépôt.
 *
 *   node --env-file=.env --import tsx --test tests/repertoire.test.ts
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import PizZip from "pizzip";
import { base } from "../src/lib/baseDeTravail";
import { lireRepertoire, typeDeFiliere } from "../src/server/etablissements/lectureRepertoire";
import { analyserRepertoire, inscrireRepertoire } from "../src/server/etablissements/importRepertoire";
import { nettoyerFicheRepertoire } from "../src/lib/repertoire";
import { preparerEcriture } from "../src/server/etablissements/donnees";

const debut = new Date();
const crees: string[] = [];

after(async () => {
  await base.etablissement.deleteMany({ where: { id: { in: crees } } });
  await base.auditLog.deleteMany({ where: { createdAt: { gte: debut }, action: "IMPORT_REPERTOIRE" } });
  await base.$disconnect();
});

// --- Un petit répertoire Word, au format du canevas régional ---------------
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const p = (t: string) => `<w:p><w:r><w:t>${esc(t)}</w:t></w:r></w:p>`;
const tc = (t: string, span = 1) => `<w:tc><w:tcPr>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ""}</w:tcPr>${p(t)}</w:tc>`;
const tr = (...cells: string[]) => `<w:tr>${cells.join("")}</w:tr>`;
const ENTETE = [
  "N°", "Nom et prénoms du promoteur", "Ferme homologuée ?(Oui/Non)", "Contacts du promoteur", "Sexe(M/F)", "Expérience en années",
  "Type / mode d’élevage", "Effectifs", "Races / souches présentes dans le cheptel", "Provenance des animaux", "Coordonnées Géographiques",
];
const tableauEleveurs = (lignes: string[]) =>
  `<w:tbl>${tr(...ENTETE.map((h) => tc(h, h === "Effectifs" || h === "Coordonnées Géographiques" ? 2 : 1)))}` +
  tr(...Array.from({ length: 7 }, () => tc("")), tc("M"), tc("F"), tc(""), tc(""), tc(""), tc("")) +
  tr(...Array.from({ length: 11 }, () => tc("")), tc("X"), tc("Y")) +
  lignes.join("") +
  `</w:tbl>`;
const ligne = (...v: string[]) => tr(...v.map((x) => tc(x)));
const village = (nom: string) => tr(tc(nom, 13));

function docx(): Buffer {
  const corps =
    p("REPERTOIRE DES ACTEURS DU SOUS-SECTEUR DE L’ELEVAGE, DES PECHES, DES INDUSTRIES ANIMALES ET HALIEUTIQUES DE FOKOUE") +
    p("PORCICULTEURS") +
    p("PORCICULTEURS DE L’ARRONDISSMENT DE FOKOUE") +
    tableauEleveurs([
      village("Village Lepoung"),
      ligne("1", "Essai Porc Un", "Non", "699000001", "M", "15", "Intensifs", "4", "30", "Large white", "Douala", "", ""),
      village("VILLAGE ; FONTSA TOUALA"),
      ligne("2", "GIC Essai", "Non", "-", "M", "1 An", "Jntensif", "3 000", "", "", "Douala", "5,44", "10,05"),
      ligne("3", "", "", "", "", "", "", "", "", "", "", "", ""),
    ]) +
    p("PRODUCTEURS PETITS RUMINANTS") +
    tableauEleveurs([
      tr(tc(""), tc("OVINS"), ...Array.from({ length: 11 }, () => tc(""))),
      ligne("1", "Essai Mouton", "NON", "699000002", "M", "25", "EXTENSIF", "8", "15", "", "Septentrion", "", ""),
      tr(tc(""), tc("CAPRINS"), ...Array.from({ length: 11 }, () => tc(""))),
      ligne("2", "Essai Chèvre", "NON", "699000003", "F", "10", "EXTENSIF", "1", "8", "", "", "", ""),
      ligne("3", "Essai Chèvre", "NON", "", "F", "10", "EXTENSIF", "1", "8", "", "", "", ""),
    ]);
  const zip = new PizZip();
  zip.file("word/document.xml", `<?xml version="1.0"?><w:document xmlns:w="w"><w:body>${corps}</w:body></w:document>`);
  return zip.generate({ type: "nodebuffer" }) as Buffer;
}

test("la fiche du répertoire : seules les colonnes du canevas du type passent, nettoyées", () => {
  const r = nettoyerFicheRepertoire("ETAB_BOVINS", { sexe: "f", experience: "12", mode: "extensif", homologuee: "oui", inconnu: "x", effectifM: "" });
  assert.deepEqual(r, { fiche: { sexe: "F", experience: 12, mode: "Extensif", homologuee: "OUI" } });
  assert.ok("erreur" in nettoyerFicheRepertoire("ETAB_BOVINS", { experience: "beaucoup" }));
  assert.ok("erreur" in nettoyerFicheRepertoire("ETAB_ABATTOIR", {}), "un abattoir n'a pas de fiche de répertoire");
  // Les propriétaires de chiens (12 novembre 2026) : la rage d'abord.
  assert.deepEqual(nettoyerFicheRepertoire("ETAB_CHIEN", { effectifM: "2", vaccinRage: "oui", garde: "en liberté" }), {
    fiche: { effectifM: 2, vaccinRage: "OUI", garde: "En liberté" },
  });
  assert.equal(typeDeFiliere("PROPRIETAIRES DE CHIENS DE L'ARRONDISSEMENT"), "ETAB_CHIEN");
  // Le serveur : une fiche de répertoire sur un type qui n'en a pas est refusée ; la fiche d'un marché suit son chemin.
  assert.ok("erreur" in preparerEcriture({ fiche: { sexe: "M" } }, { typeCode: "ETAB_ABATTOIR", codeDepartement: null, username: "t" }));
  const ok = preparerEcriture({ fiche: { ruches: "60" } }, { typeCode: "ETAB_APICULTEUR", codeDepartement: null, username: "t" });
  assert.deepEqual("data" in ok && ok.data.fiche, { ruches: 60 });
});

test("lecture du fichier Word : filières, villages, colonnes fusionnées, lignes vides ignorées, X/Y non repris", () => {
  assert.equal(typeDeFiliere("REPERTOIRE DES ACTEURS DU SOUS-SECTEUR DE L’ELEVAGE, DES PECHES"), null);
  assert.equal(typeDeFiliere("FILIERE 4/9 REPERTOIRE DES PISCICULTEURS"), "ETAB_ETANG");
  const r = lireRepertoire(docx());
  assert.deepEqual(r.filieres.map((f) => [f.typeCode, f.acteurs]), [["ETAB_PORCHERIE", 2], ["ETAB_PETITS_RUMINANTS", 3]]);
  const [un, gic, mouton, chevre] = r.lignes;
  assert.equal(un.village, "Lepoung");
  assert.equal(un.proprietaire, "Essai Porc Un");
  assert.deepEqual(un.fiche, { homologuee: "NON", sexe: "M", experience: 15, mode: "Intensif", effectifM: 4, effectifF: 30, races: "Large white", provenance: "Douala" });
  assert.equal(gic.village, "FONTSA TOUALA");
  assert.equal(gic.proprietaire, null, "un GIC n'est pas un promoteur");
  assert.equal(gic.telephone, null);
  assert.equal(gic.fiche?.experience, 1);
  assert.equal(gic.fiche?.effectifM, 3000);
  assert.ok(!JSON.stringify(gic).includes("5,44"), "les coordonnées du papier ne sont pas reprises");
  assert.deepEqual(mouton.especes, ["OVINS"]);
  assert.deepEqual(chevre.especes, ["CAPRINS"]);
  assert.equal(chevre.fiche?.sexe, "F");
});

test("import à Fokoué : village officiel ou « autre village », doublons décochés, inscription recontrôlée", async () => {
  const fok = await base.arrondissement.findFirstOrThrow({ where: { nom: "Fokoué" }, select: { id: true } });
  const dd = await base.user.findFirstOrThrow({ where: { role: "DD", actif: true }, select: { id: true, username: true } });
  const lecture = lireRepertoire(docx());
  const props = (await analyserRepertoire(base, fok.id, lecture.lignes))!;
  assert.equal(props[0].villageId, "vil_fok_fokoue_lepoung", "Lepoung : la liste officielle");
  assert.equal(props[1].villageId, null);
  assert.equal(props[1].villageAutre, "Fontsa Touala", "absent de la liste officielle : autre village du CZV");
  assert.equal(props[1].centreId, "czv_fok_fokoue");
  assert.equal(props[2].localite, "Fokoué", "sans village : la localité de l'arrondissement");
  assert.equal(props[4].doublon, "fichier", "deux fois dans le fichier");

  // Étanchéité : un arrondissement d'un autre département n'existe pas ici.
  assert.equal(await analyserRepertoire(base, "arr_mbd", lecture.lignes), null);
  assert.equal(await inscrireRepertoire(base, dd, "arr_mbd", props, "essai"), null);

  // L'inscription : une fiche falsifiée est refusée, le doublon du fichier écarté.
  const lignes = [...props.slice(0, 4), { ...props[0], nom: "Essai Faux", fiche: { experience: "beaucoup" } }, props[4]];
  const r = (await inscrireRepertoire(base, dd, fok.id, lignes, "repertoire-essai.docx"))!;
  crees.push(...r.ids);
  assert.equal(r.inscrits, 4);
  assert.deepEqual(r.ignores.map((i) => i.nom).sort(), ["Essai Chèvre", "Essai Faux"]);
  const e = await base.etablissement.findUniqueOrThrow({ where: { id: r.ids[0] }, select: { typeCode: true, localite: true, observations: true, fiche: true, actif: true } });
  assert.equal(e.typeCode, "ETAB_PORCHERIE");
  assert.equal(e.localite, "LEPOUNG");
  assert.equal(e.actif, true);
  assert.match(e.observations ?? "", /à vérifier par le DA/);
  assert.equal((e.fiche as Record<string, unknown>).effectifF, 30);

  // Le même fichier, une seconde fois : tout est déjà au registre.
  const encore = (await analyserRepertoire(base, fok.id, lecture.lignes))!;
  assert.ok(encore.slice(0, 4).every((x) => x.doublon === "registre"));
  const r2 = (await inscrireRepertoire(base, dd, fok.id, props.slice(0, 4), "repertoire-essai.docx"))!;
  crees.push(...r2.ids);
  assert.equal(r2.inscrits, 0);
});
