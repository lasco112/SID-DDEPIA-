// ÉPREUVE HORS LIGNE RÉELLE — saisie MENSUELLE, dans un Chrome isolé piloté
// par script : réseau coupé pour de bon (navigator.onLine = false), service
// worker actif, base locale IndexedDB, rechargement sans réseau, retour du
// réseau et envoi automatique. Profil Chrome vierge, jamais celui de
// l'utilisateur. Le navigateur intégré de l'éditeur refuse les service
// workers : il ne peut pas servir à cette épreuve.
//
// puppeteer-core n'est PAS une dépendance du SID (règle : aucune dépendance
// sans validation). L'installer à part, puis lancer :
//
//   (dans un dossier temporaire)  npm i puppeteer-core@23
//   node --env-file=.env --import tsx scripts/navigateur/preparer.ts   → « <periodeId> <jeton> »
//   PUPPETEER=<chemin>/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js \
//     JETON=<jeton> PERIODE=<periodeId> node scripts/navigateur/mensuel-hors-ligne.mjs
//   node --env-file=.env --import tsx scripts/navigateur/nettoyer.ts
//
// LOCAL SEULEMENT.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const puppeteer = (await import(process.env.PUPPETEER ? pathToFileURL(process.env.PUPPETEER).href : "puppeteer-core")).default;
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const { JETON, PERIODE } = process.env;
const resultats = [];
const controle = (intitule, ok, detail) => {
  resultats.push(ok);
  console.log(`${ok ? "  ok     " : "  FAUTE  "} ${intitule}${detail ? ` — ${detail}` : ""}`);
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const navigateur = await puppeteer.launch({
  executablePath: process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  userDataDir: mkdtempSync(join(tmpdir(), "sid-hl-")),
});
const page = await navigateur.newPage();
await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(String(e).slice(0, 160)));
await page.setCookie(
  { name: "next-auth.session-token", value: JETON, domain: "localhost", path: "/", httpOnly: true },
  { name: "sid_periode", value: PERIODE, domain: "localhost", path: "/" }
);

const local = () =>
  page.evaluate(
    () =>
      new Promise((res) => {
        const r = indexedDB.open("SID_DDEPIA_MENOUA");
        r.onsuccess = () => {
          const q = r.result.transaction("saisies", "readonly").objectStore("saisies").getAll();
          q.onsuccess = () => res(q.result.map((s) => ({ fieldCode: s.fieldCode, valeur: s.valeur, statut: s.statutLocal, periodeId: s.periodeId })));
        };
        r.onerror = () => res([]);
      })
  );

try {
  console.log("\n1. PRÉPARATION EN LIGNE (première connexion de la journée)");
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle2", timeout: 120_000 });
  await pause(20_000);
  await page.reload({ waitUntil: "networkidle2" });
  await pause(3000);
  controle("service worker actif et maître de la page", await page.evaluate(() => Boolean(navigator.serviceWorker.controller)));
  controle(
    "les pages de saisie sont gardées sur l'appareil",
    await page.evaluate(async () => {
      for (const nom of await caches.keys()) if (await (await caches.open(nom)).match("/da/saisie/T11", { ignoreVary: true })) return true;
      return false;
    })
  );

  await page.goto(`${BASE}/da/saisie/T11`, { waitUntil: "networkidle2", timeout: 120_000 });
  await page.waitForSelector('input[type="number"]', { timeout: 60_000 });

  console.log("\n2. LE RÉSEAU TOMBE — saisie sur le terrain");
  await page.setOfflineMode(true);
  await pause(500);
  controle("l'appareil se sait hors ligne", await page.evaluate(() => !navigator.onLine && /Hors ligne/.test(document.body.innerText)));
  const champs = await page.$$('input[type="number"]');
  await champs[0].click({ clickCount: 3 });
  await champs[0].type("250");
  await champs[1].click({ clickCount: 3 });
  await champs[1].type("0");
  await pause(1500);
  let l = (await local()).filter((s) => s.periodeId === PERIODE);
  controle("chaque frappe est enregistrée sur l'appareil", l.some((s) => s.valeur === 250 && s.statut === "BROUILLON_LOCAL") && l.some((s) => s.valeur === 0), JSON.stringify(l));

  console.log("\n3. RECHARGEMENT SANS RÉSEAU (téléphone éteint, appli rouverte)");
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 }).catch((e) => erreurs.push(String(e)));
  await pause(4000);
  const titre = await page.evaluate(() => document.querySelector("h1")?.innerText ?? "");
  controle("la page s'ouvre sans réseau", /cheptel/i.test(titre), titre);
  await page.waitForSelector('input[type="number"]', { timeout: 20_000 }).catch(() => {});
  const valeurs = await page.$$eval('input[type="number"]', (xs) => xs.slice(0, 2).map((x) => x.value));
  controle("les chiffres saisis sont toujours là", valeurs[0] === "250" && valeurs[1] === "0", JSON.stringify(valeurs));

  console.log("\n4. NAVIGATION SANS RÉSEAU");
  await page.goto(`${BASE}/da/saisie/T12`, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch((e) => erreurs.push(String(e)));
  await pause(3000);
  controle("un autre tableau s'ouvre sans réseau", await page.evaluate(() => /volaille/i.test(document.body.innerText)));

  console.log("\n5. LE RÉSEAU REVIENT — envoi automatique, sans geste de l'agent");
  await page.goto(`${BASE}/da/saisie/T11`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.setOfflineMode(false);
  await page.waitForFunction(
    () =>
      new Promise((res) => {
        const r = indexedDB.open("SID_DDEPIA_MENOUA");
        r.onsuccess = () => {
          const q = r.result.transaction("saisies", "readonly").objectStore("saisies").getAll();
          q.onsuccess = () => res(q.result.filter((s) => s.valeur === 250).every((s) => s.statutLocal === "SYNCHRONISE"));
        };
      }),
    { timeout: 60_000, polling: 1000 }
  ).catch(() => {});
  l = (await local()).filter((s) => s.periodeId === PERIODE);
  controle("l'appareil marque ses saisies « synchronisées »", l.length > 0 && l.every((s) => s.statut === "SYNCHRONISE"), JSON.stringify(l));
} finally {
  console.log(`\nErreurs JavaScript de la page : ${erreurs.length ? erreurs.join(" | ") : "aucune"}`);
  await navigateur.close();
  console.log(`${resultats.filter(Boolean).length}/${resultats.length} contrôles réussis (mensuel hors ligne).`);
}
