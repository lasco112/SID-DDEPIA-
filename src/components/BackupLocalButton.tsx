"use client";

/**
 * BackupLocalButton.tsx — filet de sécurité supplémentaire pour la saisie
 * offline (au-delà de l'IndexedDB du navigateur) : permet au DA de
 * télécharger un fichier de secours de ses brouillons non (ou déjà)
 * synchronisés, et de le recharger — utile si son appareil change ou si le
 * navigateur perd son stockage local (cache vidé, réinstallation…).
 *
 * L'import est filtré strictement sur `username` : on ne restaure jamais les
 * brouillons d'un autre compte dans la session courante (même principe que
 * le cloisonnement Dexie par utilisateur, cf. lib/dexie.ts).
 */

import { useRef, useState } from "react";
import { offlineDB, type SaisieOffline } from "@/lib/dexie";

export default function BackupLocalButton({ username }: { username: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function exporter() {
    setBusy(true);
    setMessage(null);
    try {
      const saisies = await offlineDB.saisies.where("username").equals(username).toArray();
      const blob = new Blob([JSON.stringify(saisies, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `sauvegarde_${username}_${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage(`${saisies.length} saisie(s) exportée(s).`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Échec de l'export.");
    } finally {
      setBusy(false);
    }
  }

  async function restaurer(fichier: File) {
    setBusy(true);
    setMessage(null);
    try {
      const texte = await fichier.text();
      const donnees = JSON.parse(texte) as SaisieOffline[];
      if (!Array.isArray(donnees)) throw new Error("Fichier de sauvegarde invalide.");

      const aRestaurer = donnees.filter((s) => s && s.username === username && s.clientId);
      if (aRestaurer.length === 0) {
        setMessage("Aucune saisie de ce compte trouvée dans ce fichier.");
        return;
      }
      if (!window.confirm(`Restaurer ${aRestaurer.length} saisie(s) depuis cette sauvegarde ? Les brouillons locaux existants portant les mêmes cases seront remplacés.`)) {
        return;
      }
      await offlineDB.saisies.bulkPut(aRestaurer);
      setMessage(`${aRestaurer.length} saisie(s) restaurée(s). Pensez à les envoyer.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Échec de la restauration.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={exporter}
        disabled={busy}
        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Exporter une sauvegarde (.json)
      </button>
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={busy}
        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Restaurer depuis une sauvegarde
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => {
          const fichier = e.target.files?.[0];
          e.target.value = "";
          if (fichier) restaurer(fichier);
        }}
      />
      {message && <p className="w-full text-xs text-gray-500">{message}</p>}
    </div>
  );
}
