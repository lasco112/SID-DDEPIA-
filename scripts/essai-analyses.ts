/**
 * Essai du moteur d'analyse sur quelques tableaux du trimestre.
 *
 *   node --env-file=.env --import tsx scripts/essai-analyses.ts 2026 3
 */
import { base } from "../src/lib/baseDeTravail";
import { trimestrielle, memePeriodeAnneePrecedente } from "../src/server/periodes/calendrier";
import { preparer, fournisseur } from "../src/server/trimestre/remplissage";
import { champsMobilises } from "../src/server/trimestre/liaison";
import { SECTIONS_CANEVAS } from "../src/server/trimestre/canevas/sections";
import { listerArrondissements } from "../src/lib/arrondissements";
import { analyserTableau, type SujetTableau } from "../src/server/trimestre/analyse/analyseTableau";
import type { FournisseurValeur } from "../src/server/trimestre/canevas/rendu";
import type { ContexteCanevas } from "../src/server/trimestre/canevas/types";

const SUJETS: Record<number, SujetTableau> = {
  14: { sujet: "Le cheptel bovin", pluriel: false, unite: "têtes" },
  16: { sujet: "Les abattages contrôlés de bovins", pluriel: true, unite: "têtes" },
  45: { sujet: "Les abattages contrôlés de volaille", pluriel: true, unite: "sujets" },
  64: { sujet: "Les vaccinations", pluriel: true, unite: "animaux vaccinés" },
  13: { sujet: "Les recettes", pluriel: true, unite: "FCFA" },
};

/** Le T3 2025 des vaccinations, tel qu'un agent le saisirait : chiffres FICTIFS pour l'essai. */
const N1_FICTIF: Record<string, number> = {
  Dschang: 380, "Fokoué": 520, "Fongo-Tongo": 150, "Nkong-Ni": 600, "Penka-Michel": 310, Santchou: 870,
};

const court = (a: number, t: number) => `T${t} ${a}`;

async function essai(annee: number, rang: number, arrondissement?: { id: string; nom: string }) {
  const p = trimestrielle(annee, rang);
  const n1 = memePeriodeAnneePrecedente(p);
  const tous = await listerArrondissements(base);
  const ctx: ContexteCanevas = {
    periodeCourt: court(annee, rang), periodeCourtN1: court(n1.annee, rang), annee,
    mois: [], arrondissements: arrondissement ? [arrondissement.nom] : tous.map((a) => a.nom),
    arrondissement: arrondissement?.nom,
  } as ContexteCanevas;
  const d = await preparer(base, p, champsMobilises(), { autoriserIncomplet: true, arrondissementId: arrondissement?.id });
  const reel = fournisseur(d, ctx);
  const avecN1Saisi: FournisseurValeur = (q) => {
    const v = reel(q);
    if (v != null || q.numeroTableau !== 64) return v;
    const colN1 = q.colonne === `TOTAL ${ctx.periodeCourtN1}`;
    if (colN1 && N1_FICTIF[q.ligne] != null) return String(N1_FICTIF[q.ligne]);
    if (colN1 && q.ligne === `TOTAL ${ctx.periodeCourt}`)
      return String(ctx.arrondissements.reduce((s, a) => s + (N1_FICTIF[a] ?? 0), 0));
    return v;
  };

  console.log(`\n==================== ${arrondissement ? "RAPPORT DA — " + arrondissement.nom : "RAPPORT DD — département"} ====================`);
  for (const s of SECTIONS_CANEVAS) for (const b of s.blocs) {
    if (b.type !== "tableau" || b.numero == null || !SUJETS[b.numero]) continue;
    for (const [etiquette, v] of [["", reel], [" — avec le T3 2025 saisi par les agents (chiffres fictifs)", avecN1Saisi]] as const) {
      if (etiquette && b.numero !== 64) continue;
      const a = analyserTableau(b, ctx, v, SUJETS[b.numero]);
      if (!a) continue;
      console.log(`\n[${b.titre}]${etiquette}`);
      for (const ph of a.phrases) console.log(`  • ${ph.texte}\n      calcul : ${ph.calcul}`);
    }
  }
}

(async () => {
  const annee = Number(process.argv[2] ?? 2026);
  const rang = Number(process.argv[3] ?? 3);
  await essai(annee, rang);
  const dschang = (await listerArrondissements(base)).find((a) => a.nom === "Dschang")!;
  await essai(annee, rang, dschang);
  await base.$disconnect();
})();
