"use client";

/**
 * PinGate.tsx — verrou d'écran optionnel pour appareil partagé (spécification
 * hors-ligne, sécurité). Si un PIN a été défini (voir /mon-compte et
 * lib/pinLocal.ts), l'application reste masquée tant qu'il n'est pas saisi
 * correctement — utile si plusieurs personnes se relaient sur le même
 * appareil déjà connecté. Le déverrouillage ne vaut que pour cet onglet/cette
 * session d'ouverture (sessionStorage) : fermer puis rouvrir l'appli reverrouille.
 */

import { useEffect, useState } from "react";
import { pinConfigure, verifierPin } from "@/lib/pinLocal";

const CLE_SESSION = "sid_pin_deverrouille";

export default function PinGate({ children }: { children: React.ReactNode }) {
  const [etat, setEtat] = useState<"verification" | "verrouille" | "ouvert">("verification");
  const [saisie, setSaisie] = useState("");
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    (async () => {
      const configure = await pinConfigure();
      if (!configure || sessionStorage.getItem(CLE_SESSION) === "1") {
        setEtat("ouvert");
      } else {
        setEtat("verrouille");
      }
    })();
  }, []);

  async function valider(e: React.FormEvent) {
    e.preventDefault();
    if (await verifierPin(saisie)) {
      sessionStorage.setItem(CLE_SESSION, "1");
      setEtat("ouvert");
      setErreur(false);
      setSaisie("");
    } else {
      setErreur(true);
    }
  }

  if (etat === "verification") return null;

  if (etat === "verrouille") {
    return (
      <div className="fixed inset-0 z-[250] flex items-center justify-center bg-primary-dark p-4">
        <form onSubmit={valider} className="w-full max-w-xs rounded-lg bg-white p-6 shadow-xl">
          <p className="text-center text-sm font-semibold text-gray-800">Appareil verrouillé</p>
          <p className="mt-1 text-center text-xs text-gray-500">Saisissez le code PIN de cet appareil.</p>
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            value={saisie}
            onChange={(e) => {
              setSaisie(e.target.value);
              setErreur(false);
            }}
            className="mt-4 w-full rounded-md border border-gray-300 px-3 py-2 text-center text-lg tracking-widest"
          />
          {erreur && <p className="mt-2 text-center text-xs text-red-700">Code incorrect.</p>}
          <button type="submit" className="mt-4 w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark">
            Déverrouiller
          </button>
        </form>
      </div>
    );
  }

  return <>{children}</>;
}
