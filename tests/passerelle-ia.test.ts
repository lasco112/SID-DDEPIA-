/**
 * La passerelle vers un modèle, éprouvée sans fournisseur.
 *
 * Un petit serveur local imite l'interface « compatible OpenAI ». On vérifie
 * ainsi l'adaptateur AVANT que la Délégation n'engage la moindre dépense — et
 * surtout on vérifie les cas qui comptent vraiment : le service en panne, le
 * service trop lent, le service qui refuse. Dans les trois, le SID doit se
 * rabattre sans bruit sur son moteur de règles.
 *
 * Aucun appel ne sort de la machine.
 *
 *   node --import tsx --test tests/passerelle-ia.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import {
  passerelleCompatibleOpenAI,
  configurationDepuisEnvironnement,
  CONSIGNE_SYSTEME,
} from "../src/server/redaction/passerelleCompatibleOpenAI";

/** Ce que le faux service doit faire au prochain appel. */
let comportement: "normal" | "erreur" | "lent" | "vide" = "normal";
/** Ce que le service a reçu — pour vérifier ce qu'on lui envoie. */
let dernierCorps: any = null;
let derniereAutorisation: string | undefined;

let serveur: Server;
let urlBase: string;

before(async () => {
  serveur = createServer((req, res) => {
    let brut = "";
    req.on("data", (c) => (brut += c));
    req.on("end", () => {
      dernierCorps = JSON.parse(brut || "{}");
      derniereAutorisation = req.headers.authorization;

      if (comportement === "erreur") {
        res.writeHead(429, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "quota dépassé" }));
        return;
      }
      if (comportement === "lent") {
        // Plus long que le délai que le test accordera : jamais de réponse.
        setTimeout(() => res.end("{}"), 5_000);
        return;
      }
      if (comportement === "vide") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ choices: [] }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          model: "modele-simule-1.0",
          choices: [{ message: { content: "  {{F1.phrase}} {{F2.phrase}}  " } }],
        })
      );
    });
  });

  await new Promise<void>((ok) => serveur.listen(0, "127.0.0.1", ok));
  const { port } = serveur.address() as AddressInfo;
  urlBase = `http://127.0.0.1:${port}/v1`;
});

after(async () => {
  await new Promise<void>((ok) => serveur.close(() => ok()));
});

const passerelle = () => passerelleCompatibleOpenAI({ urlBase, cle: "cle-de-controle", modele: "modele-simule" });

test("un service qui répond normalement rend une proposition", async () => {
  comportement = "normal";
  const p = await passerelle().proposer({ invite: "Rédigez : {{F1.phrase}}" });

  assert.ok(p, "Aucune proposition rendue.");
  assert.equal(p.texte, "{{F1.phrase}} {{F2.phrase}}", "Le texte doit être rendu débarrassé de ses espaces.");
  assert.equal(p.modele, "modele-simule");
  assert.equal(p.versionModele, "modele-simule-1.0");
  assert.ok(p.latenceMs >= 0);
});

test("la consigne système part avec l'invite, et interdit les chiffres", async () => {
  comportement = "normal";
  await passerelle().proposer({ invite: "Rédigez." });

  assert.equal(dernierCorps.messages[0].role, "system");
  assert.equal(dernierCorps.messages[0].content, CONSIGNE_SYSTEME);
  assert.ok(/N'écrivez JAMAIS un chiffre/.test(CONSIGNE_SYSTEME));
  // Peu de créativité : un rapport ne doit pas varier d'une fois sur l'autre.
  assert.ok(dernierCorps.temperature <= 0.3, "La température est trop haute pour un document officiel.");
});

test("la clé part en en-tête, et nulle part ailleurs", async () => {
  comportement = "normal";
  await passerelle().proposer({ invite: "Rédigez." });

  assert.equal(derniereAutorisation, "Bearer cle-de-controle");
  assert.ok(!JSON.stringify(dernierCorps).includes("cle-de-controle"), "La clé s'est glissée dans le corps.");
});

test("un service qui refuse ne fait pas tomber le SID", async () => {
  comportement = "erreur";
  const p = await passerelle().proposer({ invite: "Rédigez." });
  assert.equal(p, null, "Un refus doit rendre null, jamais lever.");
});

test("un service trop lent est abandonné, sans lever", async () => {
  comportement = "lent";
  const debut = Date.now();
  const p = await passerelle().proposer({ invite: "Rédigez.", delaiMs: 150 });

  assert.equal(p, null);
  assert.ok(Date.now() - debut < 2_000, "L'abandon n'a pas eu lieu au délai demandé.");
});

test("une réponse sans texte rend null plutôt qu'une chaîne vide", async () => {
  comportement = "vide";
  assert.equal(await passerelle().proposer({ invite: "Rédigez." }), null);
});

test("un service injoignable rend null", async () => {
  const morte = passerelleCompatibleOpenAI({
    urlBase: "http://127.0.0.1:1/v1", // port réservé, personne n'écoute
    cle: "x",
    modele: "y",
  });
  assert.equal(await morte.proposer({ invite: "Rédigez.", delaiMs: 500 }), null);
});

test("sans configuration, il n'y a pas de passerelle — et ce n'est pas une erreur", () => {
  const avant = { ...process.env };
  delete process.env.IA_URL_BASE;
  delete process.env.IA_CLE;
  delete process.env.IA_MODELE;
  assert.equal(configurationDepuisEnvironnement(), null);

  process.env.IA_URL_BASE = "https://exemple/v1/";
  process.env.IA_CLE = "k";
  process.env.IA_MODELE = "m";
  const c = configurationDepuisEnvironnement();
  assert.equal(c?.urlBase, "https://exemple/v1", "La barre finale doit être retirée, sinon l'URL est doublée.");

  process.env = avant;
});
