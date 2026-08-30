/**
 * La saisie des tableaux du BAC, de la cellule au document.
 *
 * Les treize tableaux du Bureau des Affaires Communes n'étaient collectés nulle
 * part : ils sortaient vides du rapport trimestriel, sans que rien ne le
 * signale. Ce contrôle vérifie qu'une cellule saisie par le chef BAC se
 * retrouve bien dans le document produit — et qu'on ne peut pas saisir à la
 * main un tableau que les mois alimentent déjà.
 *
 * Tout est écrit puis supprimé.
 *
 *   node --env-file=.env --import tsx scripts/verifier-saisie-canevas.ts
 */
import PizZip from "pizzip";
import { base, baseBrute, transaction, exigerDepartementDeTravail } from "../src/lib/baseDeTravail";
import {
  ecrireSaisieCanevas,
  lireSaisiesCanevas,
  compterSaisiesParTableau,
  estSaisiALaMain,
  cleCellule,
} from "../src/server/trimestre/saisieCanevas";
import { periodeTrimestrielle } from "../src/server/trimestre/rubriques";
import { grillesBac } from "../src/server/trimestre/grilleBac";
import { genererRapportCanevas } from "../src/server/trimestre/rapportCanevas";
import { trimestrielle } from "../src/server/periodes/calendrier";

const dire = (quoi: string, ok: boolean) => {
  console.log(`  ${ok ? "ok    " : "FAUTE "}  ${quoi}`);
  if (!ok) process.exitCode = 1;
};

/** Une cellule du tableau n° 13 — Synthèse des recettes par régie et par mois. */
const CELLULE = { numeroTableau: 13, ligne: "JANVIER", colonne: "DDEPIA" };
const MONTANT = 1234567;

/** Texte du document, tous paragraphes et tableaux confondus. */
const texteDocx = (buf: Buffer) => new PizZip(buf).file("word/document.xml")!.asText();

async function principal() {
  await exigerDepartementDeTravail();

  const periode = trimestrielle(2026, 1);
  let periodeId: string | null = null;
  let periodeCreee = false;

  try {
    const dd = await base.user.findFirstOrThrow({ where: { role: "DD", actif: true }, select: { id: true } });

    const avant = await base.periodeReporting.findFirst({
      where: { type: "TRIMESTRIEL", annee: 2026, trimestre: 1 },
      select: { id: true },
    });
    periodeId = await periodeTrimestrielle(base, periode);
    periodeCreee = !avant;

    // --- Ce qui est saisissable, et ce qui ne l'est pas -----------------------
    console.log("\nCe que le chef BAC peut saisir");
    dire("les treize tableaux du BAC le sont", [1, 5, 11, 13].every(estSaisiALaMain));
    dire("le tableau 69 (abattages), alimenté par les mois, ne l'est PAS", !estSaisiALaMain(69));

    let refus = false;
    try {
      await ecrireSaisieCanevas(base, transaction, periodeId, { numeroTableau: 69, ligne: "Bovins", colonne: "Dschang" }, { valeur: 1 }, dd.id);
    } catch (e) {
      refus = e instanceof Error && /double saisie/i.test(e.message);
    }
    dire("le saisir est refusé, au motif de la double saisie", refus);

    // --- L'écriture d'une cellule --------------------------------------------
    console.log("\nUne cellule saisie");

    const ecrit = await ecrireSaisieCanevas(base, transaction, periodeId, CELLULE, { valeur: MONTANT }, dd.id);
    dire("l'écriture est acceptée", ecrit.enregistre);

    const relues = await lireSaisiesCanevas(base, periodeId);
    dire(`elle se relit à ses coordonnées (${MONTANT})`, relues.get(cleCellule(CELLULE))?.valeur === MONTANT);

    const parTableau = await compterSaisiesParTableau(base, periodeId);
    dire("le compteur du tableau 13 la voit", parTableau.get(13) === 1);

    // --- La clé doit être écrivable en base ----------------------------------
    // Le séparateur avait été saisi comme un caractère NUL invisible : la clé
    // servait de repère en mémoire sans qu'on s'en aperçoive, mais PostgreSQL
    // refuse 0x00 et la trace d'audit échouait — après l'écriture, donc en
    // laissant la cellule enregistrée et l'écran en erreur.
    console.log("\nLa clé d'une cellule");
    const cle = cleCellule(CELLULE);
    dire(`elle est lisible — « ${cle} »`, /^\d+ \| .+ \| .+$/.test(cle));
    dire(
      "elle ne contient aucun caractère de contrôle, que la base refuserait",
      // eslint-disable-next-line no-control-regex
      !/[\u0000-\u001f]/.test(cle)
    );

    const grilles = await grillesBac(base, periode, await lireSaisiesCanevas(base, periodeId));
    const g13 = grilles.find((g) => g.numero === 13);
    dire("le compteur de la grille voit la cellule saisie", g13?.renseignees === 1);

    // --- Elle ressort dans le document ---------------------------------------
    console.log("\nDans le rapport produit");

    const rapport = await genererRapportCanevas(base, periode, { autoriserIncomplet: true });
    const texte = texteDocx(rapport.buffer);
    // Le document formate à la française : 1 234 567, avec des espaces
    // insécables. On cherche donc les chiffres, pas la chaîne brute.
    const attendu = new Intl.NumberFormat("fr-FR").format(MONTANT).replace(/\s/g, "");
    const trouve = texte.replace(/<[^>]+>/g, "").replace(/[\s  ]/g, "").includes(attendu);
    dire(`le montant saisi figure dans le document (${attendu})`, trouve);

    // --- Effacer une cellule -------------------------------------------------
    console.log("\nEffacer");
    const efface = await ecrireSaisieCanevas(base, transaction, periodeId, CELLULE, { valeur: null }, dd.id);
    dire("une valeur vide EFFACE la cellule, au lieu d'écrire zéro", !efface.enregistre);
    const apres = await lireSaisiesCanevas(base, periodeId);
    dire("elle a bien disparu", !apres.has(cleCellule(CELLULE)));
  } finally {
    let n = 0;
    if (periodeId) {
      n = (await base.saisieCanevas.deleteMany({ where: { periodeId } })).count;
      if (periodeCreee) {
        await base.rubriqueNarrative.deleteMany({ where: { periodeId } });
        await base.exportDocument.deleteMany({ where: { periodeId } });
        await base.periodeReporting.delete({ where: { id: periodeId } }).catch(() => {});
      }
    }
    console.log(`\nRemise en état : ${n} cellule(s)${periodeCreee ? ", 1 période trimestrielle" : ""} — supprimée(s).`);
  }
}

principal()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => baseBrute.$disconnect());
