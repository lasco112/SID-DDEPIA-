"use client";

/**
 * SyncButton.tsx — Synchronisation offline-first des saisies DA (CDC §11).
 * Pousse la file d'attente Dexie vers POST /api/sync par lots ; le serveur
 * upserte par clientId (idempotent), donc un renvoi après coupure ne
 * duplique jamais rien. Rien n'est supprimé localement avant confirmation.
 */

import { useState, useEffect, useCallback } from "react";
import { offlineDB } from "@/lib/dexie";

type SyncState = "idle" | "offline" | "syncing" | "done" | "error";

const BATCH_SIZE = 200;

export default function SyncButton({ periodeId, username, onSynced }: { periodeId: string; username: string; onSynced?: () => void }) {
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
      .anyOf([username, "BROUILLON_LOCAL"], [username, "SYNCHRO_EN_ATTENTE"])
      .count();
    setPending(n);
  }, [username]);

  useEffect(() => {
    refreshPending();
    const t = setInterval(refreshPending, 4000);
    return () => clearInterval(t);
  }, [refreshPending]);

  const handleSync = useCallback(async () => {
    if (!navigator.onLine) {
      setState("offline");
      setMessage("Hors connexion : les données restent sauvegardées localement.");
      return;
    }
    setState("syncing");
    setMessage("Synchronisation en cours…");

    try {
      const queue = await offlineDB.saisies
        .where("[username+statutLocal]")
        .anyOf([username, "BROUILLON_LOCAL"], [username, "SYNCHRO_EN_ATTENTE"])
        .toArray();
      if (queue.length === 0) {
        setState("done");
        setMessage("Aucune donnée à synchroniser.");
        return;
      }

      await offlineDB.saisies.bulkPut(queue.map((s) => ({ ...s, statutLocal: "SYNCHRO_EN_ATTENTE" as const })));

      let confirmed = 0;
      for (let i = 0; i < queue.length; i += BATCH_SIZE) {
        const batch = queue.slice(i, i + BATCH_SIZE);
        const res = await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ periodeId, saisies: batch }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          if (res.status === 423) {
            throw new Error(err.message ?? "Période verrouillée. Contactez le Délégué Départemental.");
          }
          throw new Error(err.message ?? `Erreur serveur (${res.status})`);
        }

        const { confirmedIds } = (await res.json()) as { confirmedIds: string[] };
        await offlineDB.transaction("rw", offlineDB.saisies, async () => {
          for (const id of confirmedIds) {
            await offlineDB.saisies.update(id, { statutLocal: "SYNCHRONISE" });
          }
        });
        confirmed += confirmedIds.length;
      }

      setState("done");
      setMessage(`${confirmed} donnée(s) synchronisée(s) avec le serveur.`);
      onSynced?.();
    } catch (e) {
      setState("error");
      setMessage(e instanceof Error ? e.message : "Échec de synchronisation. Vos données restent sauvegardées sur cet appareil.");
    } finally {
      await refreshPending();
      setTimeout(() => setState("idle"), 5000);
    }
  }, [periodeId, username, refreshPending, onSynced]);

  useEffect(() => {
    if (online && pending > 0 && state === "idle") {
      void handleSync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  return (
    <div className="flex items-center gap-3">
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
        disabled={state === "syncing" || pending === 0}
        className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-gray-300"
      >
        {state === "syncing" ? "Synchronisation…" : `Synchroniser (${pending})`}
      </button>

      {message && (
        <p className={`text-sm ${state === "error" ? "text-red-700" : "text-gray-600"}`} role="status">
          {message}
        </p>
      )}
    </div>
  );
}
