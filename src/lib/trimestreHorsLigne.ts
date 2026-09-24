/**
 * Le rapport trimestriel SANS RÉSEAU (décision du Délégué, 24 septembre 2026 :
 * le hors-ligne est critique pour le système).
 *
 * Deux choses, sur le modèle du mensuel :
 *
 *  1. LIRE : chaque écran garde sur l'appareil la dernière copie reçue du
 *     serveur. Sans réseau, il s'ouvre sur cette copie, en le disant.
 *  2. ÉCRIRE : une case, une analyse, un texte saisis sans réseau vont dans
 *     une file sur l'appareil, et partent SEULS au retour du réseau — sans
 *     geste de l'agent. Chaque écriture porte l'heure de l'appareil : le
 *     serveur ne l'applique que si rien de plus récent n'a été fait depuis
 *     (la correction du DA n'est jamais écrasée par un agent qui revient).
 *
 * Règles héritées du mensuel, qui ont coûté cher :
 *  - une écriture n'est retirée de la file QUE si le serveur l'a acceptée ;
 *  - une écriture refusée (rapport transmis entre-temps…) reste visible, avec
 *    son motif — jamais jetée en silence ;
 *  - tout est cloisonné par compte (`username`).
 */
import { offlineDB, type OperationTrimestre } from "@/lib/dexie";

/** Une réponse du SERVEUR (droit, verrou, donnée refusée) — à ne pas confondre avec une absence de réseau. */
export class RefusServeur extends Error {}

export const MESSAGE_SANS_COPIE =
  "Pas de réseau, et cet écran n'a pas encore été ouvert sur ce téléphone avec du réseau. " +
  "Ouvrez-le une fois connecté : il restera ensuite disponible hors ligne.";

const cleCopie = (username: string, url: string) => `${username}|${url}`;

/** Garde une copie de ce que le serveur a répondu pour cette adresse. */
export async function garderCopie(username: string, url: string, donnees: unknown): Promise<void> {
  try {
    await offlineDB.copiesTrimestre.put({ cle: cleCopie(username, url), username, donnees, le: new Date().toISOString() });
  } catch {
    // stockage indisponible : l'écran reste utilisable en ligne
  }
}

/**
 * Lit un écran du trimestre : le serveur si le réseau répond, sinon la
 * dernière copie gardée sur l'appareil. `copieDu` dit de quand date la copie
 * (null : réponse fraîche du serveur).
 */
export async function lireAvecCopie<T>(username: string, url: string): Promise<{ donnees: T; copieDu: string | null }> {
  let reponse: Response | null = null;
  try {
    reponse = await fetch(url);
  } catch {
    reponse = null; // pas de réseau
  }
  if (reponse) {
    const d = await reponse.json().catch(() => ({}));
    if (!reponse.ok) throw new RefusServeur((d as { message?: string }).message ?? "Chargement impossible.");
    await garderCopie(username, url, d);
    return { donnees: d as T, copieDu: null };
  }
  const copie = await offlineDB.copiesTrimestre.get(cleCopie(username, url)).catch(() => undefined);
  if (copie) return { donnees: copie.donnees as T, copieDu: copie.le };
  throw new Error(MESSAGE_SANS_COPIE);
}

export type ResultatEnvoi =
  | { statut: "envoye"; reponse: Record<string, unknown> }
  /** Pas de réseau : gardée sur l'appareil, elle partira seule. */
  | { statut: "en_file" }
  /** Le serveur détient une modification plus récente : elle est conservée. */
  | { statut: "ignore" }
  | { statut: "refuse"; message: string };

/**
 * Envoie une écriture ; sans réseau, la met en file. Une nouvelle écriture sur
 * la même cible remplace celle qui attendait encore.
 */
export async function envoyer(
  username: string,
  op: { cle: string; methode: "PUT" | "DELETE"; url: string; corps: Record<string, unknown>; libelle: string }
): Promise<ResultatEnvoi> {
  const corps = { ...op.corps, modifieLe: new Date().toISOString() };
  if (typeof navigator === "undefined" || navigator.onLine) {
    try {
      const r = await fetch(op.url, { method: op.methode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) });
      const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      if (r.ok) {
        // Envoyée : ce qui attendait sur la même cible est dépassé.
        await retirer(username, op.cle);
        return d.ignoree ? { statut: "ignore" } : { statut: "envoye", reponse: d };
      }
      if (r.status < 500) return { statut: "refuse", message: String(d.message ?? "Enregistrement impossible.") };
      // Serveur en difficulté : on garde, on réessaiera.
    } catch {
      // pas de réseau : en file
    }
  }
  await offlineDB.transaction("rw", offlineDB.fileTrimestre, async () => {
    await retirer(username, op.cle);
    await offlineDB.fileTrimestre.add({
      username, cle: op.cle, methode: op.methode, url: op.url, corps, libelle: op.libelle,
      creeLe: new Date().toISOString(), erreur: null, refusee: false,
    });
  });
  return { statut: "en_file" };
}

async function retirer(username: string, cle: string) {
  const anciennes = await offlineDB.fileTrimestre.where("cle").equals(cle).filter((o) => o.username === username).toArray();
  if (anciennes.length) await offlineDB.fileTrimestre.bulkDelete(anciennes.map((o) => o.id!));
}

/** Les écritures de ce compte qui attendent le réseau (ou qui ont été refusées). */
export async function enAttente(username: string): Promise<OperationTrimestre[]> {
  try {
    return await offlineDB.fileTrimestre.where("username").equals(username).sortBy("id");
  } catch {
    return [];
  }
}

/** L'agent renonce à une écriture refusée (après en avoir pris connaissance). */
export async function abandonner(id: number): Promise<void> {
  await offlineDB.fileTrimestre.delete(id);
}

/**
 * TÉLÉCHARGE EN ARRIÈRE-PLAN tout le trimestre de ce compte — liste et grilles
 * de saisie, analyses, textes, circuit — au même moment que les tableaux du
 * mensuel, avec la même barre de progression (demande du Délégué : l'agent ne
 * doit pas avoir à ouvrir chaque écran une fois en ligne pour le retrouver
 * hors ligne). Chaque étape est indépendante : un échec n'arrête pas les
 * autres. Au plus une fois toutes les dix minutes : inutile de recalculer le
 * trimestre à chaque changement de page, ni d'user le forfait des agents.
 */
export const ETAPES_TRIMESTRE = 5;
const CLE_DERNIER_TELECHARGEMENT = "sid-ddepia-trimestre-telecharge-le";

export async function telechargerTrimestre(
  username: string,
  role: string,
  periode: { annee: number; trimestre: number },
  surEtape?: (faites: number) => void
): Promise<void> {
  const cle = `${CLE_DERNIER_TELECHARGEMENT}|${username}|${periode.annee}-${periode.trimestre}`;
  try {
    const dernier = Number(localStorage.getItem(cle) ?? 0);
    if (Date.now() - dernier < 10 * 60_000) {
      surEtape?.(ETAPES_TRIMESTRE);
      return;
    }
  } catch {
    // stockage indisponible : on télécharge
  }

  const q = `annee=${periode.annee}&trimestre=${periode.trimestre}`;
  const saisit = ["DD", "CHEF_BAC", "DA", "AGENT_SAISIE"].includes(role);
  let faites = 0;
  const etape = async (travail: () => Promise<void>) => {
    try {
      await travail();
    } catch {
      // une étape manquée n'empêche pas les autres ; l'écran se chargera en ligne
    } finally {
      surEtape?.(++faites);
    }
  };
  const garder = async (url: string) => {
    const r = await fetch(url);
    if (r.ok) await garderCopie(username, url, await r.json());
  };

  await etape(async () => {
    if (saisit) await garder(`/api/trimestre/saisie?${q}`);
  });
  await etape(async () => {
    if (!saisit) return;
    const r = await fetch(`/api/trimestre/saisie?${q}&toutes=1`);
    if (!r.ok) return;
    const d = (await r.json()) as { periode: string; grilles: { numero: number }[] };
    for (const g of d.grilles) await garderCopie(username, `/api/trimestre/saisie?${q}&tableau=${g.numero}`, { periode: d.periode, grille: g });
  });
  await etape(() => garder(`/api/trimestre/analyses?${q}`));
  await etape(() => garder(`/api/trimestre/rubriques?${q}`));
  await etape(() => garder(`/api/trimestre/circuit?${q}`));

  try {
    localStorage.setItem(cle, String(Date.now()));
  } catch {
    // sans conséquence
  }
}

let rejeuEnCours = false;

/**
 * Rejoue la file dans l'ordre. Retire une écriture SEULEMENT si le serveur l'a
 * acceptée (ou déclarée dépassée par une modification plus récente). Refusée :
 * gardée et marquée, avec le motif. Pas de réseau : on s'arrête, on réessaiera.
 */
export async function rejouer(username: string): Promise<{ envoyees: number; refusees: number }> {
  if (rejeuEnCours || (typeof navigator !== "undefined" && !navigator.onLine)) return { envoyees: 0, refusees: 0 };
  rejeuEnCours = true;
  let envoyees = 0;
  let refusees = 0;
  try {
    for (const op of await enAttente(username)) {
      if (op.refusee) continue;
      let r: Response;
      try {
        r = await fetch(op.url, { method: op.methode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(op.corps) });
      } catch {
        break; // le réseau est retombé
      }
      if (r.ok) {
        await offlineDB.fileTrimestre.delete(op.id!);
        envoyees++;
      } else if (r.status >= 500) {
        break; // serveur en difficulté : plus tard
      } else {
        const d = (await r.json().catch(() => ({}))) as { message?: string };
        await offlineDB.fileTrimestre.update(op.id!, { refusee: true, erreur: d.message ?? "Refusée par le serveur." });
        refusees++;
      }
    }
  } finally {
    rejeuEnCours = false;
  }
  return { envoyees, refusees };
}
