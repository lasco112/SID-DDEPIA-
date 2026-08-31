/**
 * L'accès au modèle fonctionne-t-il ?
 *
 * À lancer une fois la clé collée dans `.env`. Il fait UN appel réel, sur des
 * faits fictifs, et dit ce qui va et ce qui ne va pas.
 *
 * Il ne journalise jamais la clé, ni en clair ni tronquée. Il ne touche à aucune
 * donnée du SID : les faits soumis sont inventés pour l'occasion.
 *
 *   node --env-file=.env --import tsx scripts/verifier-acces-ia.ts
 */
import {
  configurationDepuisEnvironnement,
  passerelleCompatibleOpenAI,
} from "../src/server/redaction/passerelleCompatibleOpenAI";
import { preparerFaits, controlerEtSubstituer } from "../src/server/redaction/gardeFous";
import type { Fait } from "../src/server/trimestre/faits";

const dire = (quoi: string, ok: boolean) => {
  console.log(`  ${ok ? "ok    " : "FAUTE "}  ${quoi}`);
  if (!ok) process.exitCode = 1;
};

/** Des faits inventés : aucune donnée du SID ne sort pour ce contrôle. */
const FAITS: Fait[] = [
  {
    fieldCode: "ESSAI_A",
    libelle: "Production d'œufs",
    type: "EVOLUTION",
    importance: 0.9,
    phrase: "La production d'œufs s'établit à 128 400 unités, en progression de 12,0 % sur un an.",
    calcul: "contrôle d'accès",
  },
  {
    fieldCode: "ESSAI_B",
    libelle: "Abattages contrôlés",
    type: "EVOLUTION",
    importance: 0.8,
    phrase: "Les abattages contrôlés atteignent 3 412 têtes.",
    calcul: "contrôle d'accès",
  },
];

async function principal() {
  console.log("\nLa configuration");
  const config = configurationDepuisEnvironnement();
  if (!config) {
    console.log("  ?     NON CONFIGURÉ — il manque IA_URL_BASE, IA_CLE ou IA_MODELE dans .env.");
    console.log("        Voir .env.example, et docs/CHOIX_MODELE.md pour ce qu'il faut comme accès.");
    console.log("\n  Rien n'est cassé : sans configuration, le SID rédige avec son moteur de règles,");
    console.log("  exactement comme aujourd'hui. L'assistance reste éteinte.");
    return;
  }
  // On montre l'adresse et le modèle — jamais la clé, pas même tronquée.
  console.log(`        service : ${config.urlBase}`);
  console.log(`        modèle  : ${config.modele}`);
  dire("les trois variables sont renseignées", true);

  console.log("\nL'appel");
  const passerelle = passerelleCompatibleOpenAI(config);
  dire("la passerelle se déclare disponible", await passerelle.disponible());

  const preparation = preparerFaits(FAITS);
  const invite = [
    "Rédigez un paragraphe à partir des faits suivants, en reprenant les repères tels quels :",
    "",
    ...preparation.faits.map((f) => `- ${f.id} : {{${f.id}.phrase}}`),
  ].join("\n");

  const debut = Date.now();
  const proposition = await passerelle.proposer({ invite });
  const duree = Date.now() - debut;

  if (!proposition) {
    dire(`le service n'a rien rendu (${duree} ms) — voir le message ci-dessus`, false);
    console.log("\n  Le SID continuerait de fonctionner : le moteur de règles prend le relais.");
    return;
  }
  dire(`le service a répondu en ${proposition.latenceMs} ms`, true);
  console.log(`        modèle annoncé : ${proposition.versionModele ?? "(non précisé)"}`);
  console.log(`        proposition brute : « ${proposition.texte.replace(/\s+/g, " ").slice(0, 120)}… »`);

  console.log("\nLes garde-fous");
  const resultat = controlerEtSubstituer(proposition.texte, preparation, FAITS);
  if (resultat.retenu) {
    dire("la proposition franchit tous les contrôles", true);
    console.log(`        texte final : « ${resultat.texte.replace(/\s+/g, " ").slice(0, 130)}… »`);
  } else {
    // Ce n'est PAS un échec du contrôle : c'est le contrôle qui fait son
    // travail. Un modèle qui se fait rejeter souvent sera écarté au banc
    // d'essai — c'est précisément ce qu'on veut mesurer.
    console.log(`  ?     proposition écartée — ${resultat.motif}`);
    console.log(`        ${resultat.explication}`);
    console.log("        Le SID a rendu le texte du moteur de règles à la place.");
  }

  console.log("\n  L'accès fonctionne. Le banc d'essai peut être lancé.");
}

principal().catch((e) => {
  // Ne jamais afficher l'exception brute : elle peut porter l'en-tête d'autorisation.
  console.error("  FAUTE   contrôle interrompu :", e instanceof Error ? e.message.slice(0, 200) : "erreur inconnue");
  process.exitCode = 1;
});
