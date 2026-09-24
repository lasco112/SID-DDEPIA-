"use client";

/**
 * Le bandeau hors ligne des écrans du trimestre.
 *
 * Il dit trois choses, sans jamais rien demander : on est hors ligne ; l'écran
 * montre la copie gardée sur le téléphone (et de quand) ; tant d'écritures
 * attendent le réseau. Au retour du réseau, il envoie la file SEUL — l'agent
 * n'a rien à faire. Une écriture refusée par le serveur reste affichée, avec
 * son motif, jusqu'à ce que l'agent l'ait vue.
 */

import { useCallback, useEffect, useState } from "react";
import { enAttente, rejouer, abandonner } from "@/lib/trimestreHorsLigne";
import type { OperationTrimestre } from "@/lib/dexie";

const le = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function HorsLigneTrimestre({
  username,
  copieDu,
  onEnvoye,
}: {
  username: string;
  /** La date de la copie affichée, si l'écran n'a pas pu joindre le serveur. */
  copieDu: string | null;
  /** Appelé quand des écritures en attente viennent de partir : l'écran se recharge. */
  onEnvoye?: () => void;
}) {
  const [enLigne, setEnLigne] = useState(true);
  const [file, setFile] = useState<OperationTrimestre[]>([]);
  const [voir, setVoir] = useState(false);

  const compter = useCallback(async () => setFile(await enAttente(username)), [username]);

  const envoyer = useCallback(async () => {
    const { envoyees } = await rejouer(username);
    await compter();
    if (envoyees > 0) onEnvoye?.();
  }, [username, compter, onEnvoye]);

  useEffect(() => {
    const maj = () => setEnLigne(navigator.onLine);
    maj();
    const retour = () => {
      maj();
      void envoyer();
    };
    window.addEventListener("online", retour);
    window.addEventListener("offline", maj);
    void compter();
    // Tant qu'il reste quelque chose, on retente régulièrement — le réseau
    // revient souvent sans que le navigateur le signale.
    const t = setInterval(() => {
      void compter();
      if (navigator.onLine) void envoyer();
    }, 15_000);
    return () => {
      window.removeEventListener("online", retour);
      window.removeEventListener("offline", maj);
      clearInterval(t);
    };
  }, [compter, envoyer]);

  const refusees = file.filter((o) => o.refusee);
  const attente = file.filter((o) => !o.refusee);
  if (enLigne && !copieDu && file.length === 0) return null;

  return (
    <div className="mb-3 space-y-2">
      {(!enLigne || copieDu) && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          {!enLigne ? "Hors ligne. " : "Serveur injoignable. "}
          {copieDu ? `Vous voyez la copie gardée sur ce téléphone (${le(copieDu)}). ` : ""}
          Vous pouvez continuer : ce que vous saisissez est gardé sur le téléphone et partira seul au retour du réseau.
        </p>
      )}
      {attente.length > 0 && (
        <p className="rounded-md bg-blue-50 p-3 text-sm text-blue-900">
          {attente.length} modification(s) gardée(s) sur ce téléphone, en attente du réseau.
        </p>
      )}
      {refusees.length > 0 && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-900">
          <button type="button" onClick={() => setVoir((v) => !v)} className="text-left font-semibold underline">
            {refusees.length} modification(s) faite(s) hors ligne refusée(s) par le serveur — voir
          </button>
          {voir && (
            <ul className="mt-2 space-y-2">
              {refusees.map((o) => (
                <li key={o.id} className="rounded border border-red-200 bg-white p-2">
                  <span className="block font-medium">{o.libelle}</span>
                  <span className="block text-xs">{o.erreur}</span>
                  <button
                    type="button"
                    onClick={async () => {
                      await abandonner(o.id!);
                      await compter();
                    }}
                    className="mt-1 rounded border border-gray-300 px-2 py-1 text-xs"
                  >
                    J&apos;ai compris, retirer
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
