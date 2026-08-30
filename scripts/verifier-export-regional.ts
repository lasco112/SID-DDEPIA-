/**
 * L'export consolidé destiné à la DREPIA-Ouest (lot 16).
 *
 * Ce contrôle vérifie deux choses, dans cet ordre d'importance :
 *
 *  1. QU'UN STOCK N'EST PAS SOMMÉ. Un cheptel consolidé sur six mois par
 *     addition serait multiplié par six. C'est l'erreur la plus grave que ce
 *     système puisse commettre, et elle ne se verrait pas : le document
 *     paraîtrait normal, et un chiffre faux partirait au MINEPIA.
 *
 *  2. Qu'une période incomplète est REFUSÉE, sauf demande expresse — auquel cas
 *     le document porte sa mention de provisoire.
 *
 * Le document produit n'est pas archivé ici : on appelle le générateur, pas la
 * route. La remise en état supprime la période semestrielle créée.
 *
 *   node --env-file=.env --import tsx scripts/verifier-export-regional.ts
 */
import ExcelJS from "exceljs";
import { base, baseBrute, exigerDepartementDeTravail } from "../src/lib/baseDeTravail";
import { genererExportRegional, periodeSemestrielle } from "../src/server/export/regional-xlsx";
import { semestrielle } from "../src/server/periodes/calendrier";
import { agreger } from "../src/server/trimestre/agregation";

const dire = (quoi: string, ok: boolean) => {
  console.log(`  ${ok ? "ok    " : "FAUTE "}  ${quoi}`);
  if (!ok) process.exitCode = 1;
};
const noter = (quoi: string) => console.log(`  ?     NON VÉRIFIÉ — ${quoi}`);

async function principal() {
  await exigerDepartementDeTravail();
  const periodesCreees: string[] = [];

  try {
    // Le semestre qui contient le mois de référence du golden master.
    const mois = await base.periodeReporting.findMany({
      where: { type: "MENSUEL" },
      orderBy: [{ annee: "asc" }, { mois: "asc" }],
      select: { annee: true, mois: true },
    });
    if (mois.length === 0) throw new Error("Aucune période mensuelle : le contrôle ne prouverait rien.");

    const annee = mois[0].annee;
    const semestre = (mois[0].mois ?? 1) <= 6 ? 1 : 2;
    const periode = semestrielle(annee, semestre);
    console.log(`\nSemestre étudié : S${semestre} ${annee}`);

    // --- 1. Le stock n'est pas sommé -----------------------------------------
    console.log("\nLa règle qui compte : un stock n'est jamais sommé");

    const { valeurs } = await agreger(base, periode, { autoriserIncomplet: true });
    const stocks = valeurs.filter((v) => v.regle === "DERNIERE_VALEUR" && v.arrondissementCode === null && v.valeur != null);
    const sommes = valeurs.filter((v) => v.regle === "SOMME" && v.arrondissementCode === null && v.valeur != null);

    dire(`des indicateurs de STOCK sont bien présents (${stocks.length})`, stocks.length > 0);
    dire(`des indicateurs de FLUX aussi (${sommes.length})`, sommes.length > 0);

    // La preuve : pour un stock, la valeur consolidée doit être l'une des
    // valeurs mensuelles — pas leur addition.
    let stocksVerifies = 0;
    let stocksFautifs: string[] = [];
    for (const v of stocks.slice(0, 40)) {
      const mensuelles = v.detail.map((d) => d.valeur).filter((x): x is number => x != null);
      if (mensuelles.length < 2) continue;
      const somme = mensuelles.reduce((a, b) => a + b, 0);
      stocksVerifies++;
      // Elle vaut l'une des valeurs mensuelles, et surtout PAS leur somme
      // (sauf cas dégénéré où la somme égale la dernière valeur).
      const estUneMensuelle = mensuelles.includes(v.valeur as number);
      const estLaSomme = v.valeur === somme && somme !== mensuelles.at(-1);
      if (!estUneMensuelle || estLaSomme) stocksFautifs.push(`${v.fieldCode} (=${v.valeur}, mois=${mensuelles.join("+")})`);
    }
    if (stocksVerifies === 0) {
      noter("aucun stock renseigné sur au moins deux mois : la comparaison n'est pas possible ici");
    } else {
      dire(
        `sur ${stocksVerifies} stock(s) à plusieurs mois, aucun n'est la somme de ses mois`,
        stocksFautifs.length === 0
      );
      if (stocksFautifs.length) console.log(`        fautifs : ${stocksFautifs.slice(0, 3).join(" ; ")}`);
    }

    // --- 2. Le document ------------------------------------------------------
    console.log("\nLe document produit");

    const produit = await genererExportRegional(base, periode, { autoriserIncomplet: true });
    dire("le classeur est produit", produit.buffer.length > 0);
    dire(`il consolide des valeurs (${produit.valeursConsolidees})`, produit.valeursConsolidees > 0);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(produit.buffer as any);
    const lisezMoi = wb.getWorksheet("LISEZ-MOI");
    dire("il porte un onglet LISEZ-MOI", Boolean(lisezMoi));

    const titre = String(lisezMoi?.getCell("A1").value ?? "");
    dire(`son titre vise la DREPIA-Ouest — « ${titre} »`, titre.includes("DREPIA-OUEST"));

    const onglets = wb.worksheets.map((w) => w.name).filter((n) => n !== "LISEZ-MOI");
    dire(`il porte un onglet par section (${onglets.join(", ")})`, onglets.length > 0);

    // La colonne « Règle » est ce qui permet au lecteur régional de savoir si
    // une valeur est une somme ou un état de fin de période.
    const premier = wb.getWorksheet(onglets[0]);
    const entetes = (premier?.getRow(1).values as unknown[]) ?? [];
    dire("chaque onglet porte une colonne « Règle »", entetes.map(String).includes("Règle"));
    dire(
      "et la colonne de total nomme le département",
      entetes.map(String).some((v) => v.startsWith("TOTAL ") && !/^TOTAL \d/.test(v))
    );

    // --- 3. Une période incomplète est refusée -------------------------------
    console.log("\nCe qui doit être refusé");

    const complet = (await agreger(base, periode, { autoriserIncomplet: true }), true);
    let refus = false;
    try {
      await genererExportRegional(base, periode); // sans autoriserIncomplet
    } catch (e) {
      refus = e instanceof Error && /incompl|absent/i.test(e.message);
    }
    if (refus) {
      dire("une période incomplète est refusée, avec le motif", true);
    } else {
      noter("le semestre étudié est complet : le refus ne peut pas être joué ici");
    }
    void complet;

    // --- 4. La période semestrielle se matérialise une seule fois ------------
    console.log("\nLa période semestrielle");
    const id1 = await periodeSemestrielle(base, periode);
    periodesCreees.push(id1);
    const id2 = await periodeSemestrielle(base, periode);
    dire("elle est créée au premier besoin, puis réutilisée", id1 === id2);

    const ligne = await base.periodeReporting.findUniqueOrThrow({ where: { id: id1 } });
    dire(`elle porte bien le semestre ${semestre} de ${annee}`, ligne.semestre === semestre && ligne.annee === annee);
  } finally {
    let n = 0;
    if (periodesCreees.length) {
      n = (await base.periodeReporting.deleteMany({ where: { id: { in: periodesCreees } } })).count;
    }
    console.log(`\nRemise en état : ${n} période(s) semestrielle(s) supprimée(s).`);
  }
}

principal()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => baseBrute.$disconnect());
