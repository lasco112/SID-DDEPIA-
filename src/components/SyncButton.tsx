"use client";

/**
 * SyncButton.tsx — Synchronisation offline-first des saisies DA (CDC §11)
 * ET, pour qui a le droit de soumettre (le DA, jamais l'agent de saisie),
 * finalisation du rapport en un seul geste : « Envoyer au {destinataire} »
 * pousse la file d'attente Dexie vers POST /api/sync PUIS appelle
 * POST /api/rapports/submit. Un bouton « Soumettre » séparé existait avant
 * mais faisait doublon avec l'envoi — supprimé à la demande du DD pour ne
 * garder qu'un seul geste, sans étape de vérification supplémentaire.
 * Le serveur upserte par clientId (idempotent), donc un renvoi après
 * coupure ne duplique jamais rien. Rien n'est supprimé localement avant
 * confirmation.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { offlineDB } from "@/lib/dexie";
import { envoyerSaisiesEnAttente } from "@/lib/synchronisation";
import { synchroniserEtablissements } from "@/lib/etablissementsLocal";

type SyncState = "idle" | "offline" | "syncing" | "done" | "error";

const BATCH_SIZE = 200;
/**
 * Délai minimal entre deux sauvegardes automatiques ratées, pour ne pas
 * marteler le serveur quand la cause est durable (période verrouillée,
 * réseau instable). Une saisie en échec reste sur l'appareil et repart au
 * prochain essai — rien n'est jamais perdu.
 */
const DELAI_NOUVEL_ESSAI_MS = 60_000;

export default function SyncButton({
  periodeId,
  username,
  destinataire,
  peutSoumettre = false,
  onSynced,
}: {
  periodeId: string;
  username: string;
  /** Libellé du destinataire hiérarchique direct, ex. "Délégué Départemental" — affiché "Envoyer au {destinataire}". */
  destinataire: string;
  /** DA uniquement : ce clic finalise aussi le rapport (POST /api/rapports/submit), pas juste la synchronisation. */
  peutSoumettre?: boolean;
  onSynced?: () => void;
}) {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [state, setState] = useState<SyncState>("idle");
  const [message, setMessage] = useState("");
  /** Horodatage du dernier échec, pour espacer les nouvelles tentatives automatiques. */
  const dernierEchecRef = useRef(0);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const refreshPending = useCallback(async () => {
    const n = await offlineDB.saisies
      .where("[username+statutLocal]")
      .anyOf([username, "BROUILLON_LOCAL"], [username, "SYNCHRO_EN_ATTENTE"], [username, "ERREUR_SYNCHRO"])
      .count();
    setPending(n);
  }, [username]);

  useEffect(() => {
    refreshPending();
    const t = setInterval(refreshPending, 4000);
    return () => clearInterval(t);
  }, [refreshPending]);

  const soumettreRapport = useCallback(async () => {
    const res = await fetch("/api/rapports/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodeId }),
    });
    if (res.ok) return { deja: false };
    const err = await res.json().catch(() => ({}));
    if (res.status === 423 && err.message === "Rapport déjà soumis") return { deja: true };
    throw new Error(err.message ?? "Échec de la finalisation du rapport.");
  }, [periodeId]);

  /**
   * Pousse la file locale vers le serveur. Ne soumet JAMAIS le rapport :
   * mettre les données à l'abri sur le serveur et déclarer officiellement le
   * rapport sont deux décisions distinctes.
   */
  const envoyerFile = useCallback(async (): Promise<number> => {
    // Implémentation partagée avec l'écran de synchronisation (lib/synchronisation)
    // pour que les deux ne puissent jamais diverger.
    const confirmees = await envoyerSaisiesEnAttente(username, periodeId);
    // Les établissements créés/supprimés hors ligne partent dans le même geste.
    await synchroniserEtablissements();
    return confirmees;
  }, [periodeId, username]);

  /**
   * Filet de sécurité : dès qu'il y a du réseau, les saisies partent vers le
   * serveur toutes seules, SANS soumettre le rapport. Sans cela, des données
   * pouvaient rester des jours sur un seul téléphone — perdues avec lui en
   * cas de panne, de perte ou de vol.
   */
  const sauvegardeAutomatique = useCallback(async () => {
    setState("syncing");
    setMessage("Sauvegarde de vos saisies sur le serveur…");
    try {
      const confirmed = await envoyerFile();
      setState("done");
      setMessage(confirmed > 0 ? `${confirmed} saisie(s) mise(s) à l'abri sur le serveur.` : "");
      onSynced?.();
    } catch (e) {
      dernierEchecRef.current = Date.now();
      setState("error");
      setMessage(
        e instanceof Error
          ? `Sauvegarde automatique impossible (${e.message}). Vos données restent sur cet appareil.`
          : "Sauvegarde automatique impossible. Vos données restent sur cet appareil."
      );
    } finally {
      await refreshPending();
      setTimeout(() => setState("idle"), 5000);
    }
  }, [envoyerFile, refreshPending, onSynced]);

  const handleSync = useCallback(async () => {
    if (!navigator.onLine) {
      setState("offline");
      setMessage("Hors connexion : les données restent sauvegardées localement.");
      return;
    }
    setState("syncing");
    setMessage(`Envoi au ${destinataire} en cours…`);

    try {
      const confirmed = await envoyerFile();

      if (peutSoumettre) {
        const { deja } = await soumettreRapport();
        setState("done");
        setMessage(
          deja
            ? "Rapport déjà transmis."
            : confirmed > 0
              ? `${confirmed} donnée(s) envoyée(s) et rapport transmis au ${destinataire}.`
              : `Rapport transmis au ${destinataire}.`
        );
      } else if (confirmed > 0) {
        setState("done");
        setMessage(`${confirmed} donnée(s) envoyée(s) au ${destinataire}.`);
      } else {
        setState("done");
        setMessage("Aucune donnée à envoyer.");
      }
      onSynced?.();
    } catch (e) {
      dernierEchecRef.current = Date.now();
      setState("error");
      setMessage(e instanceof Error ? e.message : "Échec de l'envoi. Vos données restent sauvegardées sur cet appareil.");
    } finally {
      await refreshPending();
      setTimeout(() => setState("idle"), 5000);
    }
  }, [destinataire, peutSoumettre, envoyerFile, soumettreRapport, refreshPending, onSynced]);

  // `pending` DOIT figurer dans les dépendances : il vaut encore 0 au premier
  // rendu (son comptage est asynchrone). L'ancienne version ne dépendait que
  // de `online`, donc l'effet ne se relançait jamais une fois le comptage
  // terminé — les saisies restaient indéfiniment sur l'appareil alors même
  // que la connexion était bonne.
  useEffect(() => {
    if (!online || pending === 0 || state !== "idle") return;
    if (Date.now() - dernierEchecRef.current < DELAI_NOUVEL_ESSAI_MS) return;
    const t = setTimeout(() => void sauvegardeAutomatique(), 1200);
    return () => clearTimeout(t);
  }, [online, pending, state, sauvegardeAutomatique]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
          online ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
        }`}
      >
        <span className={`h-2 w-2 rounded-full ${online ? "bg-green-600" : "bg-amber-500"}`} />
        {online ? "En ligne" : "Hors ligne"}
      </span>

      <button
        onClick={handleSync}
        disabled={state === "syncing" || (pending === 0 && !peutSoumettre)}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-gray-300"
      >
        {state === "syncing" ? "Synchronisation en cours…" : `Envoyer au ${destinataire}`}
      </button>

      {pending > 0 && state !== "syncing" && (
        <span className="text-xs font-medium text-amber-700">
          {pending} saisie{pending > 1 ? "s" : ""} en attente de synchronisation
        </span>
      )}

      {message && (
        <p className={`text-sm ${state === "error" ? "text-red-700" : "text-gray-600"}`} role="status">
          {message}
        </p>
      )}
    </div>
  );
}
