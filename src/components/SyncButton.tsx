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

import { useState, useEffect, useCallback } from "react";
import { offlineDB } from "@/lib/dexie";

type SyncState = "idle" | "offline" | "syncing" | "done" | "error";

const BATCH_SIZE = 200;

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

  const handleSync = useCallback(async () => {
    if (!navigator.onLine) {
      setState("offline");
      setMessage("Hors connexion : les données restent sauvegardées localement.");
      return;
    }
    setState("syncing");
    setMessage(`Envoi au ${destinataire} en cours…`);

    try {
      const queue = await offlineDB.saisies
        .where("[username+statutLocal]")
        .anyOf([username, "BROUILLON_LOCAL"], [username, "SYNCHRO_EN_ATTENTE"], [username, "ERREUR_SYNCHRO"])
        .toArray();

      let confirmed = 0;
      if (queue.length > 0) {
        await offlineDB.saisies.bulkPut(queue.map((s) => ({ ...s, statutLocal: "SYNCHRO_EN_ATTENTE" as const })));

        for (let i = 0; i < queue.length; i += BATCH_SIZE) {
          const batch = queue.slice(i, i + BATCH_SIZE);
          const res = await fetch("/api/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ periodeId, saisies: batch }),
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            const erreurMsg =
              res.status === 423
                ? err.message ?? "Période verrouillée. Contactez le Délégué Départemental."
                : err.message ?? `Erreur serveur (${res.status})`;
            // Le lot en échec passe visiblement en erreur (jamais un échec
            // silencieux) : la saisie reste sur l'appareil, rien n'est perdu,
            // et un nouvel essai la reprendra normalement (statut réévalué à
            // chaque tentative, jamais bloqué en erreur définitive).
            await offlineDB.transaction("rw", offlineDB.saisies, async () => {
              for (const s of batch) {
                await offlineDB.saisies.update(s.clientId, { statutLocal: "ERREUR_SYNCHRO", erreurSynchro: erreurMsg });
              }
            });
            throw new Error(erreurMsg);
          }

          const { confirmedIds } = (await res.json()) as { confirmedIds: string[] };
          await offlineDB.transaction("rw", offlineDB.saisies, async () => {
            for (const id of confirmedIds) {
              await offlineDB.saisies.update(id, { statutLocal: "SYNCHRONISE" });
            }
          });
          confirmed += confirmedIds.length;
        }
      }

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
      setState("error");
      setMessage(e instanceof Error ? e.message : "Échec de l'envoi. Vos données restent sauvegardées sur cet appareil.");
    } finally {
      await refreshPending();
      setTimeout(() => setState("idle"), 5000);
    }
  }, [periodeId, username, destinataire, peutSoumettre, soumettreRapport, refreshPending, onSynced]);

  useEffect(() => {
    if (online && pending > 0 && state === "idle") {
      void handleSync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

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
