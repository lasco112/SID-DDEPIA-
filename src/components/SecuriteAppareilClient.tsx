"use client";

/**
 * SecuriteAppareilClient.tsx — définir/retirer le PIN local d'appareil
 * partagé (voir lib/pinLocal.ts, components/PinGate.tsx). Action purement
 * locale : aucun appel réseau, tout se passe dans Dexie sur cet appareil.
 */

import { useEffect, useState } from "react";
import { definirPin, pinConfigure, supprimerPin } from "@/lib/pinLocal";

export default function SecuriteAppareilClient() {
  const [configure, setConfigure] = useState<boolean | null>(null);
  const [pin, setPin] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    pinConfigure().then(setConfigure);
  }, []);

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setMessage(null);
    if (!/^\d{4,6}$/.test(pin)) {
      setErreur("Le code doit comporter 4 à 6 chiffres.");
      return;
    }
    if (pin !== confirmation) {
      setErreur("Les deux codes ne correspondent pas.");
      return;
    }
    await definirPin(pin);
    setConfigure(true);
    setPin("");
    setConfirmation("");
    setMessage("Code PIN activé sur cet appareil.");
  }

  async function retirer() {
    await supprimerPin();
    setConfigure(false);
    setMessage("Code PIN retiré de cet appareil.");
  }

  if (configure === null) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      {configure ? (
        <>
          <p className="text-sm text-gray-700">Un code PIN est actuellement actif sur cet appareil.</p>
          <button
            onClick={retirer}
            className="mt-3 rounded-md border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
          >
            Retirer le code PIN
          </button>
        </>
      ) : (
        <form onSubmit={enregistrer} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Nouveau code PIN (4 à 6 chiffres)</label>
            <input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Confirmer le code</label>
            <input
              type="password"
              inputMode="numeric"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark">
            Activer le code PIN
          </button>
        </form>
      )}
      {erreur && <p className="mt-3 text-sm text-red-700">{erreur}</p>}
      {message && <p className="mt-3 text-sm text-green-700">{message}</p>}
    </div>
  );
}
