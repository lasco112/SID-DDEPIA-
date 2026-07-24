/**
 * pinLocal.ts — code PIN optionnel pour appareil partagé (spécification
 * hors-ligne, sécurité). Purement local : le PIN ne quitte jamais l'appareil,
 * n'est jamais envoyé au serveur, et seul son empreinte (SHA-256) est
 * conservée dans Dexie — jamais le PIN en clair. Il ne remplace pas
 * l'authentification NextAuth (qui reste nécessaire) : il ajoute un verrou
 * d'écran local pour qu'un tiers ayant accès à un appareil partagé déjà
 * connecté ne puisse pas consulter les données sans connaître ce code.
 */
import { offlineDB } from "@/lib/dexie";

async function hacher(pin: string): Promise<string> {
  const donnees = new TextEncoder().encode(pin);
  const empreinte = await crypto.subtle.digest("SHA-256", donnees);
  return Array.from(new Uint8Array(empreinte))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function definirPin(pin: string): Promise<void> {
  const hash = await hacher(pin);
  const meta = await offlineDB.meta.get("bootstrap");
  if (!meta) throw new Error("Données de l'appareil indisponibles.");
  await offlineDB.meta.put({ ...meta, pinHash: hash });
}

export async function supprimerPin(): Promise<void> {
  const meta = await offlineDB.meta.get("bootstrap");
  if (!meta) return;
  await offlineDB.meta.put({ ...meta, pinHash: undefined });
}

export async function pinConfigure(): Promise<boolean> {
  const meta = await offlineDB.meta.get("bootstrap");
  return Boolean(meta?.pinHash);
}

export async function verifierPin(pin: string): Promise<boolean> {
  const meta = await offlineDB.meta.get("bootstrap");
  if (!meta?.pinHash) return true;
  return (await hacher(pin)) === meta.pinHash;
}
