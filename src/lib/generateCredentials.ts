/**
 * generateCredentials.ts — identifiant + mot de passe temporaire pour un
 * nouveau compte créé par le DD (CDC §4.1 : pas d'inscription libre).
 */
import { db } from "@/lib/db";
import { randomInt } from "node:crypto";

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/** Identifiant déterministe par rattachement, avec suffixe numérique en cas de collision. */
export async function genererIdentifiant(opts: {
  role: string;
  arrondissementNom?: string;
  sectionCode?: string;
  nom: string;
}): Promise<string> {
  let base: string;
  if (opts.role === "DA" && opts.arrondissementNom) base = `da.${slug(opts.arrondissementNom)}`;
  else if (opts.role === "AGENT_SAISIE" && opts.arrondissementNom) base = `agent.${slug(opts.arrondissementNom)}`;
  else if (opts.role.startsWith("CHEF_") && opts.sectionCode) base = `chef.${slug(opts.sectionCode)}`;
  else if (opts.role === "DD") base = "dd.menoua";
  else base = `admin.${slug(opts.nom).slice(0, 12) || "technique"}`;

  let candidat = base;
  let n = 2;
  while (await db.user.findUnique({ where: { username: candidat } })) {
    candidat = `${base}${n}`;
    n += 1;
  }
  return candidat;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"; // sans caractères ambigus (0/O, 1/l/I)

/**
 * Mot de passe temporaire proposé à la création d'un compte ou à une
 * réinitialisation. Simple et identique pour tous (demande explicite du DD
 * pour la phase MVP/pilote) : `mustChangePassword` reste actif, donc la
 * personne devra de toute façon le changer à sa première connexion — ce
 * n'est qu'un point de départ facile à communiquer oralement.
 */
export function genererMotDePasseTemporaire(): string {
  return "password123";
}

/** Génère un mot de passe aléatoire lisible — conservé pour un usage futur si besoin d'un vrai secret (non utilisé par défaut). */
export function genererMotDePasseAleatoire(longueur = 10): string {
  let out = "";
  for (let i = 0; i < longueur; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}
