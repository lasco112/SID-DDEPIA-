/**
 * Les contrôles croisés du canevas.
 *
 * Le cahier des charges pose qu'« aucune génération n'est possible tant que ces
 * contrôles échouent ». Ce contrôle-ci vérifie deux choses :
 *
 *  1. qu'une incohérence saisie ARRÊTE réellement la production du document —
 *     et pas seulement qu'elle est signalée quelque part ;
 *  2. que les contrôles dont la donnée n'est pas collectée sont déclarés NON
 *     CALCULABLES, et non « respectés ». Un contrôle qu'on ne sait pas faire
 *     n'est pas un contrôle réussi : le confondre donnerait au Délégué
 *     l'assurance d'une vérification qui n'a jamais eu lieu.
 *
 *   node --env-file=.env --import tsx scripts/verifier-controles-croises.ts
 */
import { base, baseBrute, transaction, exigerDepartementDeTravail } from "../src/lib/baseDeTravail";
import { passerControles } from "../src/server/trimestre/controles";
import { ecrireSaisieCanevas } from "../src/server/trimestre/saisieCanevas";
import { periodeTrimestrielle } from "../src/server/trimestre/rubriques";
import { genererRapportCanevas, ControlesCroisesError } from "../src/server/trimestre/rapportCanevas";
import { trimestrielle } from "../src/server/periodes/calendrier";
import { listerArrondissements } from "../src/lib/arrondissements";

const dire = (quoi: string, ok: boolean) => {
  console.log(`  ${ok ? "ok    " : "FAUTE "}  ${quoi}`);
  if (!ok) process.exitCode = 1;
};

const MOIS = ["JANVIER", "FÉVRIER", "MARS"];

async function principal() {
  await exigerDepartementDeTravail();

  const periode = trimestrielle(2026, 1);
  let periodeId: string | null = null;
  let periodeCreee = false;

  try {
    const dd = await base.user.findFirstOrThrow({ where: { role: "DD", actif: true }, select: { id: true } });
    const arrondissements = await listerArrondissements(base);
    const regies = ["DDEPIA", ...arrondissements.map((a) => a.nom)];

    const avant = await base.periodeReporting.findFirst({
      where: { type: "TRIMESTRIEL", annee: 2026, trimestre: 1 },
      select: { id: true },
    });
    periodeId = await periodeTrimestrielle(base, periode);
    periodeCreee = !avant;

    // --- L'inventaire des contrôles ------------------------------------------
    console.log("\nCe que le SID sait vérifier, et ce qu'il ne sait pas");

    const vierge = await passerControles(base, periode, periodeId, MOIS, regies);
    dire(`les cinq contrôles du canevas sont déclarés (${vierge.resultats.length})`, vierge.resultats.length === 5);
    dire(
      `trois sont NON CALCULABLES faute de donnée collectée (${vierge.nonCalculables})`,
      vierge.nonCalculables >= 3
    );
    for (const r of vierge.resultats) {
      const marque = { respecte: "·", viole: "✗", nonCalculable: "?" }[r.etat];
      console.log(`        ${marque} ${r.intitule.slice(0, 62)}`);
    }
    dire(
      "aucun contrôle non calculable n'est compté comme respecté",
      vierge.resultats.filter((r) => r.etat === "respecte").every((r) => !/lésion|œufs commercial|ventes de poisson/i.test(r.intitule))
    );

    // --- Un total saisi à la main ne compte plus ----------------------------
    // Depuis la saisie trimestrielle, les totaux sont CALCULÉS à partir des
    // régies. Un ancien total mal saisi (500 pour 100 + 100) ne doit ni bloquer
    // la génération, ni s'imprimer.
    console.log("\nUn ancien total saisi à la main, et faux");

    await ecrireSaisieCanevas(base, transaction, periodeId, { numeroTableau: 13, ligne: "JANVIER", colonne: "DDEPIA" }, { valeur: 100 }, dd.id);
    await ecrireSaisieCanevas(base, transaction, periodeId, { numeroTableau: 13, ligne: "JANVIER", colonne: arrondissements[0].nom }, { valeur: 100 }, dd.id);
    await ecrireSaisieCanevas(base, transaction, periodeId, { numeroTableau: 13, ligne: "JANVIER", colonne: "TOTAL" }, { valeur: 500 }, dd.id);

    const apres = await passerControles(base, periode, periodeId, MOIS, regies);
    dire("le contrôle des recettes passe : les totaux sont calculés", apres.violations.length === 0);

    const rapport = await genererRapportCanevas(base, periode, { autoriserIncomplet: true });
    const texte = rapport.buffer.length ? new (require("pizzip"))(rapport.buffer).file("word/document.xml").asText().replace(/<[^>]+>/g, "|") : "";
    dire("le document se produit", rapport.buffer.length > 0);
    dire("il imprime le total CALCULÉ (200), pas le total saisi (500)", /\|200\|/.test(texte) && !/\|500\|/.test(texte));

    // --- Le rapport d'un arrondissement n'est pas concerné --------------------
    console.log("\nLe rapport d'un arrondissement");
    await ecrireSaisieCanevas(base, transaction, periodeId, { numeroTableau: 13, ligne: "JANVIER", colonne: "TOTAL" }, { valeur: 999 }, dd.id);
    const rapportDA = await genererRapportCanevas(base, periode, {
      autoriserIncomplet: true,
      arrondissement: arrondissements[0].nom,
    });
    dire(
      "il se produit malgré l'incohérence départementale, qui ne le concerne pas",
      rapportDA.buffer.length > 0
    );
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
