/**
 * Chaque bouton du menu doit ouvrir son écran — pour chaque rôle, en réel
 * comme en démonstration.
 *
 * Le 15 octobre 2026, le Délégué a trouvé des boutons « qui ne fonctionnent
 * pas » : le menu proposait un écran que les règles d'accès (middleware.ts)
 * refusaient, et le refus renvoyait sans un mot à l'accueil — « Tableaux
 * administratifs du BAC » pour le DD, « Comptes utilisateurs », « Journal
 * d'activité » et « Questions des utilisateurs » en démonstration. Ce test
 * compare le menu (navItems.ts) aux règles, pour qu'un tel écart ne revienne
 * pas sans qu'on le voie.
 *
 *   node --import tsx --test tests/menu-acces.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { menuDe } from "../src/lib/navItems";
import { PROTECTED_PREFIXES, CHEMINS_SURS_DEMO, CHEMINS_EXACTS_SURS_DEMO } from "../src/middleware";

const ROLES = ["DD", "DA", "AGENT_SAISIE", "CHEF_BAC", "CHEF_PSA", "CHEF_SSV", "CHEF_SPAIH", "ADMIN_TECH"];

const correspond = (chemin: string, prefixe: string) => chemin === prefixe || chemin.startsWith(`${prefixe}/`);

function liensDu(role: string, adminSysteme = false): string[] {
  return Array.from(new Set(menuDe(role, adminSysteme).flatMap((g) => g.items.map((i) => i.href))));
}

test("en réel, chaque lien du menu est permis au rôle qui le voit", () => {
  const refus: string[] = [];
  for (const role of ROLES) {
    for (const href of liensDu(role, role === "DD")) {
      const regle = PROTECTED_PREFIXES.find((r) => correspond(href, r.prefix));
      if (regle && !regle.roles.includes(role)) refus.push(`${role} → ${href}`);
    }
  }
  assert.deepEqual(refus, [], `liens du menu refusés par middleware.ts : ${refus.join(", ")}`);
});

test("en démonstration, chaque lien du menu est ouvert (hors administration du système)", () => {
  const fermes: string[] = [];
  // Les fonctions proposées par la page /demo. L'espace technique de
  // l'administrateur (santé, sauvegarde du serveur) reste fermé en
  // démonstration, et la page n'offre pas ce rôle.
  for (const role of ROLES.filter((r) => r !== "ADMIN_TECH")) {
    // L'administration du système n'existe pas en démonstration : aucun
    // compte de démonstration n'en porte la marque.
    for (const href of liensDu(role, false)) {
      const ouvert =
        CHEMINS_EXACTS_SURS_DEMO.includes(href) || CHEMINS_SURS_DEMO.some((p) => correspond(href, p));
      if (!ouvert) fermes.push(`${role} → ${href}`);
    }
  }
  assert.deepEqual(fermes, [], `liens du menu fermés en démonstration : ${fermes.join(", ")}`);
});

test("en démonstration, les actions sur les comptes restent fermées", () => {
  for (const action of ["/api/admin/utilisateurs/x/statut", "/api/admin/utilisateurs/x/reset-password", "/api/admin/utilisateurs/reinitialiser-tous"]) {
    const ouvert =
      CHEMINS_EXACTS_SURS_DEMO.includes(action) || CHEMINS_SURS_DEMO.some((p) => correspond(action, p));
    assert.equal(ouvert, false, action);
  }
});
