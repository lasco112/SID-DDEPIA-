/**
 * derivationLocale.ts — recalcul des cases dérivées SUR L'APPAREIL.
 *
 * L'agent de saisie travaille sans réseau : le calcul ne peut donc pas
 * attendre le serveur. Dès qu'une ligne de 1.4 ou 1.5 est enregistrée dans la
 * base locale, la case correspondante de 1.2 est recalculée localement et
 * mise en file de synchronisation comme n'importe quelle autre saisie.
 *
 * Le résultat n'écrase jamais rien d'utile : ces cases sont en lecture seule
 * dans le formulaire 1.2 (voir FormMatrice), précisément parce qu'elles sont
 * calculées.
 */

import { offlineDB, trouverSaisieMatrice } from "@/lib/dexie";
import { reglesAlimenteesPar, type RegleChampDerive } from "@/lib/champsDerives";

/**
 * Recalcule toutes les cases alimentées par `templateCodeSource`.
 * Sans effet si ce tableau n'alimente aucune case dérivée.
 */
export async function recalculerDerivesLocaux(
  username: string,
  periodeId: string,
  templateCodeSource: string
): Promise<void> {
  const regles = reglesAlimenteesPar(templateCodeSource);
  if (regles.length === 0) return;
  for (const regle of regles) await appliquer(username, periodeId, regle);
}

/** Recalcule toutes les cases dérivées, quel que soit leur tableau source. */
export async function recalculerTousLesDerives(username: string, periodeId: string): Promise<void> {
  const { CHAMPS_DERIVES } = await import("@/lib/champsDerives");
  for (const regle of CHAMPS_DERIVES) await appliquer(username, periodeId, regle);
}

async function appliquer(username: string, periodeId: string, regle: RegleChampDerive): Promise<void> {
  const lignes = await offlineDB.saisies
    .where("[username+periodeId+templateCode]")
    .equals([username, periodeId, regle.templateSource])
    .toArray();

  // Une ligne « non renseignée » n'est pas un zéro : elle ne participe pas à
  // la somme (règle 0 ≠ non renseigné du cahier des charges).
  const retenues = lignes.filter(
    (l) => l.fieldCode === regle.champSource && !l.nonRenseigne && l.valeur != null
  );

  // Dédoublonnage par établissement — l'identité réelle d'une ligne de tableau
  // nominatif est (établissement, champ), pas son clientId. La base locale peut
  // contenir deux enregistrements pour la même ferme (identifiants d'appareil
  // distincts) ; le serveur les fusionne à la synchronisation, mais une somme
  // lue localement les compterait deux fois et doublerait l'effectif. On garde
  // la version la plus récente de chaque établissement.
  const parEtablissement = new Map<string, (typeof retenues)[number]>();
  for (const l of retenues) {
    const cle = l.etablissementId ?? l.clientId;
    const dejaLa = parEtablissement.get(cle);
    if (!dejaLa || l.updatedAt > dejaLa.updatedAt) parEtablissement.set(cle, l);
  }
  const contributions = Array.from(parEtablissement.values());

  // Aucune donnée source : on laisse la case vide plutôt que d'écrire un 0,
  // qui se lirait comme « aucune pondeuse dans l'arrondissement ».
  if (contributions.length === 0) return;

  const total = contributions.reduce((s, l) => s + Number(l.valeur ?? 0), 0);

  const existante = await trouverSaisieMatrice(username, periodeId, regle.templateCible, regle.champCible);
  if (existante && Number(existante.valeur ?? NaN) === total && !existante.nonRenseigne) {
    return; // déjà à jour : ne pas remettre inutilement la ligne en file d'envoi
  }

  await offlineDB.saisies.put({
    clientId: existante?.clientId ?? crypto.randomUUID(),
    username,
    periodeId,
    templateCode: regle.templateCible,
    famille: "MATRICE",
    fieldCode: regle.champCible,
    valeur: total,
    valeurTexte: null,
    nonRenseigne: false,
    motifNonRenseigne: null,
    statutLocal: "BROUILLON_LOCAL",
    updatedAt: new Date().toISOString(),
  });
}
