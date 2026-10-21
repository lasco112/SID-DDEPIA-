/**
 * etablissementsLocal.ts — couche de données « local d'abord » pour les
 * établissements.
 *
 * PRINCIPE : l'interface n'appelle JAMAIS l'API directement. Elle écrit dans
 * la base locale de l'appareil, qui répond immédiatement, puis l'opération est
 * empilée dans une file rejouée dès le retour du réseau. C'est ce qui permet
 * d'ajouter ou de supprimer un établissement en pleine tournée, sans réseau,
 * exactement comme on remplit un tableau.
 *
 * Avant, la création appelait le serveur PUIS écrivait en local : sans réseau
 * l'appel échouait et rien n'était enregistré.
 *
 * IDEMPOTENCE : l'identifiant est un UUID généré sur l'appareil et utilisé
 * comme clé primaire côté serveur. Rejouer deux fois la même création ne crée
 * donc jamais de doublon (le serveur fait un upsert sur cet identifiant).
 */

import { offlineDB, type EtablissementOffline, type OperationEnAttente } from "@/lib/dexie";
import type { InfosStructurelles } from "@/lib/acteurs";
import type { FicheMarche } from "@/lib/marches";

export interface NouvelEtablissement extends InfosStructurelles {
  typeCode: string;
  nom: string;
  localite: string;
  arrondissementId: string;
  proprietaire?: string | null;
  telephone?: string | null;
  /** La fiche d'un marché. */
  fiche?: FicheMarche | null;
  /** Une photo prise à l'ajout (data URL JPEG). */
  photo?: string | null;
}

function nouvelIdentifiant(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function empiler(op: Omit<OperationEnAttente, "id" | "creeLe" | "tentatives">): Promise<void> {
  await offlineDB.fileAttente.add({ ...op, creeLe: new Date().toISOString(), tentatives: 0 });
}

/** Liste locale d'un type pour un arrondissement, sans les supprimés. */
export async function listerEtablissements(typeCode: string, arrondissementId: string): Promise<EtablissementOffline[]> {
  const tous = await offlineDB.etablissements
    .where("[typeCode+arrondissementId]")
    .equals([typeCode, arrondissementId])
    .toArray();
  return tous.filter((e) => !e.deletedAt).sort((a, b) => Number(b.actif) - Number(a.actif) || a.nom.localeCompare(b.nom));
}

export async function creerEtablissement(data: NouvelEtablissement): Promise<EtablissementOffline> {
  const etablissement: EtablissementOffline = {
    id: nouvelIdentifiant(),
    typeCode: data.typeCode,
    nom: data.nom.trim(),
    localite: data.localite.trim(),
    arrondissementId: data.arrondissementId,
    proprietaire: data.proprietaire?.trim() || null,
    telephone: data.telephone?.trim() || null,
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
    precisionGPS: data.precisionGPS ?? null,
    dateCollecteGPS: data.dateCollecteGPS ?? null,
    especes: data.especes ?? [],
    joursMarche: data.joursMarche ?? [],
    infrastructures: data.infrastructures ?? [],
    observations: data.observations ?? null,
    ...(data.fiche !== undefined ? { fiche: data.fiche } : {}),
    photoLocale: data.photo ?? null,
    actif: true,
    enAttenteSynchro: true,
  };
  await offlineDB.etablissements.put(etablissement);
  const { photoLocale: _photo, ...payload } = etablissement;
  await empiler({ entite: "etablissement", operation: "CREATION", cibleId: etablissement.id, payload: { ...payload } });
  // La photo part APRÈS la création : la file se rejoue dans l'ordre.
  if (data.photo) await empiler({ entite: "etablissement", operation: "PHOTO", cibleId: etablissement.id, payload: { image: data.photo } });
  await envoyerSansBloquer();
  return etablissement;
}

/**
 * La photo d'un établissement : gardée sur l'appareil tout de suite (elle
 * s'affiche même sans réseau), envoyée dès que possible. `null` la retire.
 */
export async function envoyerPhoto(id: string, image: string | null): Promise<void> {
  await offlineDB.etablissements.update(id, { photoLocale: image, ...(image ? {} : { aPhoto: false }) });
  await empiler({ entite: "etablissement", operation: "PHOTO", cibleId: id, payload: { image } });
  await envoyerSansBloquer();
}

export async function modifierEtablissement(id: string, patch: Partial<EtablissementOffline>): Promise<void> {
  await offlineDB.etablissements.update(id, { ...patch, enAttenteSynchro: true });
  await empiler({ entite: "etablissement", operation: "MODIFICATION", cibleId: id, payload: { ...patch } });
  await envoyerSansBloquer();
}

/**
 * Tente l'envoi tout de suite et l'ATTEND, quelques secondes au plus : l'écran
 * dit ensuite la vérité — « ajouté » quand le serveur l'a reçu, « enregistré
 * sur cet appareil » seulement quand il ne l'a pas reçu. Avant, l'envoi partait
 * sans être attendu, et l'écran annonçait « sera transmis » même en ligne.
 * Sans réseau (ou Wi-Fi sans Internet), on n'attend pas plus de 8 secondes :
 * l'opération reste dans la file et repartira seule.
 */
async function envoyerSansBloquer(): Promise<void> {
  await Promise.race([synchroniserEtablissements().catch(() => undefined), new Promise((ok) => setTimeout(ok, 8000))]);
}

/**
 * Suppression hors ligne : on pose une marque (`deletedAt`) au lieu d'effacer.
 * L'établissement disparaît tout de suite des écrans, mais l'opération survit
 * à une fermeture de l'application tant qu'elle n'a pas atteint le serveur.
 */
export async function supprimerEtablissement(id: string): Promise<void> {
  await offlineDB.etablissements.update(id, { deletedAt: new Date().toISOString(), enAttenteSynchro: true });
  await empiler({ entite: "etablissement", operation: "SUPPRESSION", cibleId: id, payload: {} });
  await envoyerSansBloquer();
}

export async function nombreOperationsEnAttente(): Promise<number> {
  return offlineDB.fileAttente.count();
}

let synchroEnCours: Promise<{ envoyees: number; echecs: number }> | null = null;

/**
 * Rejoue la file dans l'ordre. Une opération n'est retirée de la file que si
 * le serveur l'a réellement acceptée — sinon elle est conservée avec le
 * message d'erreur, et repartira à la tentative suivante.
 *
 * Un envoi déjà en cours est ATTENDU, puis la file relue : une opération
 * empilée pendant qu'il tournait n'est pas oubliée jusqu'au prochain passage.
 */
export async function synchroniserEtablissements(): Promise<{ envoyees: number; echecs: number }> {
  if (typeof navigator === "undefined" || !navigator.onLine) return { envoyees: 0, echecs: 0 };
  while (synchroEnCours) await synchroEnCours.catch(() => undefined);
  synchroEnCours = rejouerLaFile();
  try {
    return await synchroEnCours;
  } finally {
    synchroEnCours = null;
  }
}

async function rejouerLaFile(): Promise<{ envoyees: number; echecs: number }> {
  let envoyees = 0;
  let echecs = 0;

  const operations = await offlineDB.fileAttente.orderBy("id").toArray();
  // Une opération qui échoue retient les suivantes sur la MÊME cible : une
  // photo ou une modification envoyée avant la création recevrait « 404 » et
  // serait tenue pour faite — donc perdue.
  const retenues = new Set<string>();
  for (const op of operations) {
    if (retenues.has(op.cibleId)) {
      echecs++;
      continue;
    }
    try {
      const ok = await envoyerOperation(op);
      if (!ok) {
        echecs++;
        continue;
      }
      if (op.id !== undefined) await offlineDB.fileAttente.delete(op.id);

      if (op.operation === "SUPPRESSION") {
        await offlineDB.etablissements.delete(op.cibleId); // confirmé côté serveur : on peut retirer la marque et la ligne
      } else if (op.operation === "PHOTO") {
        const image = (op.payload as { image?: string | null }).image ?? null;
        await offlineDB.etablissements.update(op.cibleId, { photoLocale: null, aPhoto: Boolean(image), photoLe: image ? new Date().toISOString() : null });
      } else {
        await offlineDB.etablissements.update(op.cibleId, { enAttenteSynchro: false });
      }
      envoyees++;
    } catch (e) {
      echecs++;
      retenues.add(op.cibleId);
      if (op.id !== undefined) {
        await offlineDB.fileAttente.update(op.id, {
          tentatives: op.tentatives + 1,
          derniereErreur: e instanceof Error ? e.message : "Erreur inconnue",
        });
      }
    }
  }

  return { envoyees, echecs };
}

async function envoyerOperation(op: OperationEnAttente): Promise<boolean> {
  if (op.operation === "CREATION") {
    const e = op.payload as unknown as EtablissementOffline;
    const res = await fetch("/api/etablissements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: e.id, // identifiant généré sur l'appareil : rend le renvoi idempotent
        typeCode: e.typeCode,
        nom: e.nom,
        localite: e.localite,
        arrondissementId: e.arrondissementId,
        proprietaire: e.proprietaire ?? undefined,
        telephone: e.telephone ?? undefined,
        latitude: e.latitude ?? null,
        longitude: e.longitude ?? null,
        precisionGPS: e.precisionGPS ?? null,
        dateCollecteGPS: e.dateCollecteGPS ?? null,
        especes: e.especes ?? [],
        joursMarche: e.joursMarche ?? [],
        infrastructures: e.infrastructures ?? [],
        observations: e.observations ?? null,
        ...(e.fiche !== undefined ? { fiche: e.fiche } : {}),
      }),
    });
    if (res.ok) return true;
    throw new Error((await res.json().catch(() => ({}))).message ?? `Erreur serveur (${res.status})`);
  }

  if (op.operation === "PHOTO") {
    const image = (op.payload as { image?: string | null }).image ?? null;
    const res = await fetch(`/api/etablissements/${op.cibleId}/photo`, image
      ? { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image }) }
      : { method: "DELETE" });
    // 404 : l'établissement n'existe plus côté serveur — la photo n'a plus d'objet.
    if (res.ok || res.status === 404) return true;
    throw new Error((await res.json().catch(() => ({}))).message ?? `Erreur serveur (${res.status})`);
  }

  if (op.operation === "MODIFICATION") {
    const res = await fetch(`/api/etablissements/${op.cibleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(op.payload),
    });
    if (res.ok) return true;
    // 404 : la cible n'existe plus côté serveur, la modification n'a plus d'objet.
    if (res.status === 404) return true;
    throw new Error((await res.json().catch(() => ({}))).message ?? `Erreur serveur (${res.status})`);
  }

  const res = await fetch(`/api/etablissements/${op.cibleId}`, { method: "DELETE" });
  // 404 : déjà supprimé (renvoi après coupure) — considéré comme un succès.
  if (res.ok || res.status === 404) return true;
  throw new Error((await res.json().catch(() => ({}))).message ?? `Erreur serveur (${res.status})`);
}
