/**
 * Le rôle d'une session suit la BASE, pas le moment de la connexion.
 *
 * Incident du 23 septembre 2026 : un agent de saisie, au moment d'envoyer son
 * travail, s'est vu proposer « Envoyer au Délégué Départemental ». Le rôle
 * était figé dans le jeton de session à la connexion, pour trente jours : un
 * compte créé en DA puis corrigé en agent de saisie gardait les écrans — et
 * le bouton d'envoi — d'un DA.
 *
 *   node --env-file=.env --import tsx --test tests/session-role.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { authOptions } from "../src/lib/auth";
import { base } from "../src/lib/baseDeTravail";

test("un jeton qui croit le compte DA est ramené au rôle réel d'agent de saisie", async () => {
  const agent = await base.user.findFirst({
    where: { role: "AGENT_SAISIE", actif: true },
    select: { id: true, arrondissementId: true },
  });
  assert.ok(agent, "Aucun agent de saisie actif dans la base de test.");

  // Jeton émis quand le compte était encore DA, sans arrondissement.
  const perime = {
    sub: agent.id,
    role: "DA",
    arrondissementId: null,
    iat: Math.floor(Date.now() / 1000),
  };
  const jwt = authOptions.callbacks!.jwt!;
  const token = (await jwt({ token: perime, trigger: undefined } as never)) as Record<string, unknown>;

  assert.equal(token.revoque, undefined, "Le compte est actif : la session ne doit pas être révoquée.");
  assert.equal(token.role, "AGENT_SAISIE");
  assert.equal(token.arrondissementId, agent.arrondissementId);
});

test.after(async () => { await base.$disconnect(); });
