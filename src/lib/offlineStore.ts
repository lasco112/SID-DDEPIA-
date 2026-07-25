/**
 * offlineStore.ts — pont entre /api/bootstrap et Dexie (lib/dexie.ts).
 *
 * `telechargerBootstrap` fait le TÉLÉCHARGEMENT INITIAL requis par la
 * spécification hors-ligne : un seul appel réseau qui remplit toutes les
 * tables de référence locales, après quoi l'ouverture d'un tableau ou la
 * navigation ne dépendent plus jamais du réseau. Appelée :
 *  - de façon bloquante à la toute première connexion sur un appareil
 *    (aucune donnée locale encore présente) ;
 *  - en tâche de fond, silencieusement, à chaque ouverture ultérieure tant
 *    que le réseau est disponible (pour rester à jour sans jamais bloquer
 *    l'utilisateur qui, lui, peut être hors ligne).
 */
import { offlineDB } from "@/lib/dexie";
import { NAV_PAR_ROLE } from "@/lib/navItems";

export interface BootstrapPayload {
  meta: {
    username: string;
    nom: string;
    role: string;
    arrondissementId: string | null;
    arrondissementNom: string | null;
    sectionId: string | null;
    periodeActiveId: string | null;
    telechargeLe: string;
    donneesPurgeesLe?: string | null;
  };
  tableaux: Array<Omit<import("@/lib/dexie").TableauOffline, never>>;
  etablissements: Array<import("@/lib/dexie").EtablissementOffline>;
  referentiels: Array<import("@/lib/dexie").ReferentielOffline>;
  periode: import("@/lib/dexie").PeriodeOffline | null;
}

export async function telechargerBootstrap(): Promise<void> {
  const res = await fetch("/api/bootstrap");
  if (!res.ok) throw new Error("Échec du téléchargement initial");
  const data: BootstrapPayload = await res.json();

  await offlineDB.transaction(
    "rw",
    [
      offlineDB.meta,
      offlineDB.tableaux,
      offlineDB.etablissements,
      offlineDB.referentiels,
      offlineDB.periodes,
      offlineDB.saisies,
    ],
    async () => {
      // Le PIN local (pinHash) n'est jamais renvoyé par le serveur — il ne
      // doit pas être écrasé par un rafraîchissement du reste des données.
      const metaExistant = await offlineDB.meta.get("bootstrap");

      // Le DD a purgé les données depuis le dernier passage de cet appareil :
      // ses brouillons locaux non synchronisés sont obsolètes. Sans ce
      // nettoyage ils repartiraient vers le serveur à la prochaine synchro et
      // recréeraient exactement ce que la purge venait d'effacer.
      const purgeServeur = data.meta.donneesPurgeesLe ?? null;
      if (purgeServeur && metaExistant && metaExistant.donneesPurgeesLe !== purgeServeur) {
        await offlineDB.saisies.clear();
      }

      await offlineDB.meta.put({ cle: "bootstrap", ...data.meta, pinHash: metaExistant?.pinHash });
      await offlineDB.tableaux.clear();
      await offlineDB.tableaux.bulkPut(data.tableaux);
      await offlineDB.etablissements.clear();
      await offlineDB.etablissements.bulkPut(data.etablissements);
      await offlineDB.referentiels.clear();
      await offlineDB.referentiels.bulkPut(data.referentiels);
      await offlineDB.periodes.clear();
      if (data.periode) await offlineDB.periodes.put(data.periode);

      // Brouillons rattachés à un établissement que le DD a supprimé entre-temps :
      // ils ne peuvent plus être synchronisés (la clé étrangère n'existe plus) et
      // resteraient bloqués indéfiniment en « en attente de synchronisation ».
      const idsValides = new Set(data.etablissements.map((e) => e.id));
      const orphelines = await offlineDB.saisies
        .filter((s) => Boolean(s.etablissementId) && !idsValides.has(s.etablissementId as string))
        .primaryKeys();
      if (orphelines.length > 0) await offlineDB.saisies.bulkDelete(orphelines);
    }
  );
}

/** Y a-t-il déjà des données de référence locales (peu importe leur âge) ? */
export async function bootstrapPresent(): Promise<boolean> {
  const meta = await offlineDB.meta.get("bootstrap");
  return Boolean(meta);
}

export async function metaBootstrap() {
  return offlineDB.meta.get("bootstrap");
}

/**
 * Nom du cache HTTP du service worker (public/sw.js) — DOIT rester identique
 * à CACHE_NAME là-bas. Les deux écrivent dans le même cache nommé : le SW y
 * met les pages visitées normalement, ici on y ajoute PROACTIVEMENT les pages
 * jamais visitées (ex. un tableau que le DA n'a encore jamais ouvert), pour
 * que la navigation hors ligne les trouve dès la première tentative — c'est
 * la partie "mise en cache de toutes les pages, pas seulement l'accueil" de
 * la spécification hors-ligne.
 */
const CACHE_NAME = "sid-ddepia-v3";

/** Pages non paramétrées par tableau, selon le rôle (miroir de Sidebar.tsx). */
/** Dérivé de la même source que le menu (Sidebar.tsx) — jamais désynchronisé. */
const ROUTES_PAR_ROLE: Record<string, string[]> = Object.fromEntries(
  Object.entries(NAV_PAR_ROLE).map(([role, items]) => [role, items.map((i) => i.href)])
);

/**
 * Précharge dans le cache HTTP toutes les pages que ce rôle peut ouvrir,
 * y compris une route par tableau (ex. /da/saisie/T14) pour DA/AGENT_SAISIE —
 * sans attendre que l'utilisateur les ait ouvertes une première fois.
 * Best-effort : une page qui échoue à se précharger ne bloque pas les autres,
 * et l'utilisateur pourra toujours l'ouvrir normalement en ligne plus tard.
 */
export async function precacherPagesRole(role: string): Promise<void> {
  if (typeof window === "undefined" || !("caches" in window)) return;

  const urls = [...(ROUTES_PAR_ROLE[role] ?? ["/dashboard"])];
  if (role === "DA" || role === "AGENT_SAISIE") {
    const tableaux = await offlineDB.tableaux.toArray();
    for (const t of tableaux) urls.push(`/da/saisie/${t.code}`);
  }

  const cache = await caches.open(CACHE_NAME);
  await Promise.all(
    urls.map(async (url) => {
      try {
        const res = await fetch(url, { credentials: "same-origin" });
        if (res.ok) await cache.put(url, res.clone());
      } catch {
        // Une page non préchargée reste simplement indisponible hors ligne
        // tant qu'elle n'a pas été ouverte au moins une fois en ligne.
      }
    })
  );
}
