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
  /** Saisies déjà enregistrées sur le serveur pour le rapport en cours. */
  saisies?: Array<{
    clientId: string;
    templateCode: string;
    famille: "MATRICE" | "NOMINATIF" | "EVENEMENT";
    fieldCode?: string | null;
    etablissementId?: string | null;
    valeur?: number | null;
    valeurTexte?: string | null;
    payload?: unknown;
    nonRenseigne: boolean;
    motifNonRenseigne?: string | null;
    updatedAt: string;
  }>;
}

/**
 * Fusionne les saisies venues du serveur dans la base locale.
 *
 * Règle : une saisie locale NON ENCORE ENVOYÉE et plus récente n'est jamais
 * écrasée — sans quoi un agent perdrait, au simple rafraîchissement, le
 * travail qu'il vient de taper hors ligne. Dans tous les autres cas la version
 * du serveur fait foi, ce qui permet enfin à un DA de retrouver ses données
 * sur un nouveau téléphone.
 */
async function fusionnerSaisiesDuServeur(
  username: string,
  periodeId: string,
  venantDuServeur: NonNullable<BootstrapPayload["saisies"]>
): Promise<void> {
  if (venantDuServeur.length === 0) return;

  const locales = await offlineDB.saisies.where("username").equals(username).toArray();
  const cle = (s: { famille: string; templateCode: string; fieldCode?: string | null; etablissementId?: string | null; clientId: string }) =>
    s.famille === "EVENEMENT"
      ? `E:${s.clientId}`
      : `${s.famille}:${s.templateCode}:${s.fieldCode ?? ""}:${s.etablissementId ?? ""}`;

  const parCle = new Map(locales.map((l) => [cle(l), l]));

  const aEcrire: import("@/lib/dexie").SaisieOffline[] = [];
  for (const s of venantDuServeur) {
    const locale = parCle.get(cle(s));
    const localeEnAttente = locale && locale.statutLocal !== "SYNCHRONISE";
    if (localeEnAttente && locale.updatedAt >= s.updatedAt) continue; // travail local plus récent : préservé

    aEcrire.push({
      // Reprend l'identifiant local existant s'il y en a un, pour ne pas créer
      // un doublon dans la base locale à côté de la ligne déjà présente.
      clientId: locale?.clientId ?? s.clientId,
      username,
      periodeId,
      templateCode: s.templateCode,
      famille: s.famille,
      fieldCode: s.fieldCode ?? undefined,
      etablissementId: s.etablissementId ?? undefined,
      valeur: s.valeur ?? null,
      valeurTexte: s.valeurTexte ?? null,
      payload: (s.payload as Record<string, unknown>) ?? undefined,
      nonRenseigne: s.nonRenseigne,
      motifNonRenseigne: s.motifNonRenseigne ?? null,
      statutLocal: "SYNCHRONISE",
      updatedAt: s.updatedAt,
    });
  }

  if (aEcrire.length > 0) await offlineDB.saisies.bulkPut(aEcrire);
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

      // Redescend les saisies du serveur : c'est ce qui permet de retrouver son
      // travail sur un autre appareil, ou après réinstallation.
      if (data.meta.periodeActiveId) {
        await fusionnerSaisiesDuServeur(data.meta.username, data.meta.periodeActiveId, data.saisies ?? []);
      }
    }
  );

  // Les écrans de saisie lisent Dexie UNE FOIS à leur ouverture, alors que ce
  // rafraîchissement tourne en arrière-plan : sans ce signal, un établissement
  // supprimé par le DD restait affiché chez le DA jusqu'à un rechargement
  // manuel tombant après la fin du téléchargement — donc, en pratique,
  // indéfiniment.
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENEMENT_BOOTSTRAP_MAJ));
  }
}

/** Émis après chaque rafraîchissement réussi des données de référence locales. */
export const EVENEMENT_BOOTSTRAP_MAJ = "sid-ddepia:donnees-reference-majournees";

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
const CACHE_NAME = "sid-ddepia-v6";

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
export async function precacherPagesRole(
  role: string,
  surProgression?: (faits: number, total: number) => void
): Promise<void> {
  if (typeof window === "undefined" || !("caches" in window)) return;

  const urls = [...(ROUTES_PAR_ROLE[role] ?? ["/dashboard"])];
  if (role === "DA" || role === "AGENT_SAISIE") {
    const tableaux = await offlineDB.tableaux.toArray();
    for (const t of tableaux) urls.push(`/da/saisie/${t.code}`);
  }

  const cache = await caches.open(CACHE_NAME);
  let faits = 0;
  surProgression?.(0, urls.length);

  await Promise.all(
    urls.map(async (url) => {
      try {
        const res = await fetch(url, { credentials: "same-origin" });
        if (res.ok) {
          await cache.put(url, res.clone());
          await precacherRessourcesDeLaPage(cache, await res.text());
        }
      } catch {
        // Une page non préchargée reste simplement indisponible hors ligne
        // tant qu'elle n'a pas été ouverte au moins une fois en ligne.
      } finally {
        // Comptabilisée même en cas d'échec : la barre doit toujours arriver
        // au bout, sinon elle resterait bloquée et inquiéterait l'utilisateur.
        faits++;
        surProgression?.(faits, urls.length);
      }
    })
  );
}

/**
 * Met aussi en cache les fichiers JavaScript et CSS que la page référence.
 *
 * Sans cela, la page HTML était bien retrouvée hors ligne mais restait
 * INERTE : son écran s'affichait vide car le code qui le remplit
 * (/_next/static/chunks/app/da/saisie/[templateCode]/page.js par exemple)
 * n'avait jamais été téléchargé — il ne l'est qu'à la première ouverture
 * réelle de la page, ce qui ne se produit justement pas pour une page
 * préchargée d'avance.
 */
async function precacherRessourcesDeLaPage(cache: Cache, html: string): Promise<void> {
  const fichiers = new Set<string>();
  const motif = /(?:src|href)="(\/_next\/static\/[^"]+)"/g;
  let trouve: RegExpExecArray | null;
  while ((trouve = motif.exec(html)) !== null) {
    fichiers.add(trouve[1].replace(/&amp;/g, "&"));
  }

  await Promise.all(
    Array.from(fichiers).map(async (fichier) => {
      try {
        if (await cache.match(fichier, { ignoreVary: true })) return; // déjà en cache
        const res = await fetch(fichier, { credentials: "same-origin" });
        if (res.ok) await cache.put(fichier, res.clone());
      } catch {
        // Best-effort : un fichier manquant n'empêche pas de précharger les autres.
      }
    })
  );
}
