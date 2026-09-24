// ÉPREUVE HORS LIGNE RÉELLE — le rapport TRIMESTRIEL sans réseau, dans un
// Chrome isolé, réseau réellement coupé. Agent de saisie de Nkong-Ni, trimestre
// à rapporter. Mêmes prérequis que mensuel-hors-ligne.mjs (puppeteer-core à part) :
//
//   PUPPETEER=<…>/puppeteer-core.js JETON=<jeton> node scripts/navigateur/trimestre-hors-ligne.mjs
//
// Les écritures faites par l'épreuve (une case du tableau 101, une analyse, un
// texte) sont à effacer ensuite. LOCAL SEULEMENT.
import { mkdtempSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";

const puppeteer = (await import(process.env.PUPPETEER ? pathToFileURL(process.env.PUPPETEER).href : "puppeteer-core")).default;
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const resultats = [];
const controle = (intitule, ok, detail) => {
  resultats.push(ok);
  console.log(`${ok ? "  ok     " : "  FAUTE  "} ${intitule}${detail ? ` — ${detail}` : ""}`);
};

const navigateur = await puppeteer.launch({
  executablePath: process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  userDataDir: mkdtempSync(join(tmpdir(), "sid-hlt-")),
});
const page = await navigateur.newPage();
await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
const erreursJs = [];
page.on("pageerror", (e) => erreursJs.push(String(e).slice(0, 160)));
page.on("dialog", (d) => d.accept());
await page.setCookie({ name: "next-auth.session-token", value: process.env.JETON, domain: "localhost", path: "/", httpOnly: true });
const texte = () => page.evaluate(() => (document.querySelector("main") ?? document.body).innerText.replace(/\s+/g, " "));
const file = () =>
  page.evaluate(
    () =>
      new Promise((res) => {
        const r = indexedDB.open("SID_DDEPIA_MENOUA");
        r.onsuccess = () => {
          if (!r.result.objectStoreNames.contains("fileTrimestre")) return res([]);
          const q = r.result.transaction("fileTrimestre", "readonly").objectStore("fileTrimestre").getAll();
          q.onsuccess = () => res(q.result.map((o) => ({ cle: o.cle, refusee: o.refusee, erreur: o.erreur })));
        };
      })
  );
const cliquer = (motif) =>
  page.evaluate((m) => {
    const b = [...document.querySelectorAll("button")].find((x) => new RegExp(m, "i").test(x.innerText));
    b?.click();
    return Boolean(b);
  }, motif);

try {
  console.log("\n1. EN LIGNE : l'agent ouvre ses écrans une fois (le téléphone en garde la copie)");
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle2", timeout: 120_000 });
  await pause(15_000);
  for (const chemin of ["/trimestre/analyses", "/trimestre/textes", "/trimestre/circuit", "/trimestre/saisie"]) {
    await page.goto(`${BASE}${chemin}`, { waitUntil: "networkidle2", timeout: 120_000 });
    await pause(4000);
  }
  await pause(15_000); // toutes les grilles, gardées en arrière-plan

  console.log("\n2. LE RÉSEAU TOMBE");
  await page.setOfflineMode(true);
  await page.goto(`${BASE}/trimestre/saisie`, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => {});
  await pause(5000);
  let t = await texte();
  controle("la liste des tableaux s'ouvre sans réseau", /case\(s\) renseignée/.test(t) && /Hors ligne/.test(t), t.slice(t.indexOf("Hors ligne"), t.indexOf("Hors ligne") + 90));

  // Un tableau jamais ouvert en ligne : sa grille a été gardée d'avance.
  const ouvert = await cliquer("Structures administratives");
  await pause(4000);
  const champ = await page.$("main input:not([type=checkbox])");
  controle("un tableau jamais ouvert s'ouvre sans réseau, prêt à saisir", ouvert && champ != null);
  if (champ) {
    await champ.click({ clickCount: 3 });
    await champ.type("7");
    await page.keyboard.press("Tab");
    await pause(2500);
  }
  t = await texte();
  controle("la case est gardée sur le téléphone, et l'agent le sait", /gardée sur ce téléphone/.test(t));
  let f = await file();
  controle("elle attend dans la file du trimestre", f.some((o) => o.cle.startsWith("saisie|")), JSON.stringify(f));

  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
  await pause(5000);
  await cliquer("Structures administratives");
  await pause(4000);
  const valeur = await page.$eval("main input:not([type=checkbox])", (x) => x.value).catch(() => null);
  controle("après rechargement sans réseau, le 7 est toujours là", valeur === "7", String(valeur));

  await page.goto(`${BASE}/trimestre/analyses`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await pause(5000);
  t = await texte();
  controle("les analyses s'ouvrent sans réseau", /à relire/.test(t));
  await cliquer("Commencer la relecture");
  await pause(2000);
  await cliquer("Valider et passer au suivant");
  await pause(3000);
  f = await file();
  controle("une analyse validée sans réseau est gardée", f.some((o) => o.cle.startsWith("analyse|")));

  await page.goto(`${BASE}/trimestre/textes`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await pause(6000);
  t = await texte();
  controle("les textes s'ouvrent sans réseau", /zones prêtes/.test(t));
  await cliquer("Deuxième partie, II-2");
  await pause(1500);
  const zone = await page.$("textarea");
  if (zone) {
    await zone.type("Texte écrit sans réseau.");
    await page.evaluate(() => document.activeElement?.blur());
    await pause(2500);
  }
  f = await file();
  controle("un texte écrit sans réseau est gardé", f.some((o) => o.cle.startsWith("texte|")), JSON.stringify(f.map((o) => o.cle)));

  await page.goto(`${BASE}/trimestre/circuit`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await pause(5000);
  t = await texte();
  controle("le circuit se consulte sans réseau", /Circuit du rapport trimestriel/.test(t) && /Hors ligne/.test(t));

  console.log("\n3. LE RÉSEAU REVIENT — envoi seul, sans geste de l'agent");
  await page.setOfflineMode(false);
  await page.waitForFunction(
    () =>
      new Promise((res) => {
        const r = indexedDB.open("SID_DDEPIA_MENOUA");
        r.onsuccess = () => {
          const q = r.result.transaction("fileTrimestre", "readonly").objectStore("fileTrimestre").getAll();
          q.onsuccess = () => res(q.result.length === 0);
        };
      }),
    { timeout: 60_000, polling: 1000 }
  ).catch(() => {});
  f = await file();
  controle("la file du trimestre est vide : tout est parti", f.length === 0, JSON.stringify(f));
} finally {
  console.log(`\nErreurs JavaScript : ${erreursJs.length ? erreursJs.join(" | ") : "aucune"}`);
  await navigateur.close();
  console.log(`${resultats.filter(Boolean).length}/${resultats.length} contrôles réussis (trimestre hors ligne).`);
}
