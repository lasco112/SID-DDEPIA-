"use client";

/**
 * SynchronisationClient.tsx — écran qui rend la synchronisation VISIBLE.
 *
 * Dans les zones à réseau instable, l'agent doit pouvoir vérifier lui-même que
 * son travail est bien parti, sans dépendre d'un message fugace. Il voit donc
 * ici : l'état de la connexion, la date du dernier envoi réussi, ce qui reste
 * en attente, les erreurs éventuelles, et un bouton pour réessayer.
 */

import { useCallback, useEffect, useState } from "react";
import { offlineDB } from "@/lib/dexie";
import { etatSynchronisation, envoyerSaisiesEnAttente, type EtatSynchronisation } from "@/lib/synchronisation";
import { synchroniserEtablissements } from "@/lib/etablissementsLocal";

export default function SynchronisationClient({ username }: { username: string }) {
  const [etat, setEtat] = useState<EtatSynchronisation | null>(null);
  const [enLigne, setEnLigne] = useState(true);
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const rafraichir = useCallback(async () => {
    setEtat(await etatSynchronisation(username));
  }, [username]);

  useEffect(() => {
    const majReseau = () => setEnLigne(navigator.onLine);
    majReseau();
    window.addEventListener("online", majReseau);
    window.addEventListener("offline", majReseau);
    return () => {
      window.removeEventListener("online", majReseau);
      window.removeEventListener("offline", majReseau);
    };
  }, []);

  useEffect(() => {
    void rafraichir();
    const t = setInterval(rafraichir, 4000);
    return () => clearInterval(t);
  }, [rafraichir]);

  async function synchroniserMaintenant() {
    if (!navigator.onLine) {
      setMessage("Pas de connexion pour le moment. Vos données restent enregistrées sur cet appareil.");
      return;
    }
    setEnCours(true);
    setMessage(null);
    try {
      const meta = await offlineDB.meta.get("bootstrap");
      if (!meta?.periodeActiveId) throw new Error("Période active inconnue sur cet appareil.");

      const saisies = await envoyerSaisiesEnAttente(username, meta.periodeActiveId);
      const { envoyees, echecs } = await synchroniserEtablissements();

      setMessage(
        echecs > 0
          ? `${saisies} saisie(s) et ${envoyees} opération(s) envoyées, mais ${echecs} n'ont pas abouti. Elles seront réessayées.`
          : `Envoi terminé : ${saisies} saisie(s) et ${envoyees} opération(s) transmises.`
      );
    } catch (e) {
      setMessage(
        e instanceof Error
          ? `Échec de l'envoi : ${e.message}. Vos données restent sur cet appareil.`
          : "Échec de l'envoi. Vos données restent sur cet appareil."
      );
    } finally {
      setEnCours(false);
      await rafraichir();
    }
  }

  const totalEnAttente = (etat?.saisiesEnAttente ?? 0) + (etat?.operationsEnAttente ?? 0);

  return (
    <div className="max-w-xl">
      <div className="rounded-card border border-line bg-surface p-5 shadow-card">
        <Ligne
          libelle="Connexion"
          valeur={enLigne ? "Disponible" : "Indisponible"}
          couleur={enLigne ? "text-statut-soumisText" : "text-statut-retardText"}
        />
        <Ligne
          libelle="Dernier envoi réussi"
          valeur={
            etat?.derniereSynchro
              ? new Date(etat.derniereSynchro).toLocaleString("fr-FR")
              : "Aucun envoi depuis cet appareil"
          }
        />
        <Ligne
          libelle="Cases remplies sur cet appareil"
          valeur={String(etat?.saisiesSurCetAppareil ?? "…")}
        />
        <Ligne
          libelle="Saisies en attente"
          valeur={String(etat?.saisiesEnAttente ?? "…")}
          couleur={(etat?.saisiesEnAttente ?? 0) > 0 ? "text-statut-retardText" : undefined}
        />
        <Ligne
          libelle="Établissements en attente"
          valeur={String(etat?.operationsEnAttente ?? "…")}
          couleur={(etat?.operationsEnAttente ?? 0) > 0 ? "text-statut-retardText" : undefined}
        />
        <Ligne
          libelle="En erreur"
          valeur={String(etat?.saisiesEnErreur ?? "…")}
          couleur={(etat?.saisiesEnErreur ?? 0) > 0 ? "text-statut-rejeteText" : undefined}
        />

        <button
          type="button"
          onClick={synchroniserMaintenant}
          disabled={enCours}
          className="mt-5 w-full rounded-btn bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
        >
          {enCours ? "Envoi en cours…" : "Synchroniser maintenant"}
        </button>

        {message && <p className="mt-3 text-sm text-ink-muted">{message}</p>}
      </div>

      <p className="mt-4 text-[13px] leading-relaxed text-ink-muted">
        {totalEnAttente > 0
          ? "Les éléments en attente sont conservés sur cet appareil et repartent tout seuls dès que le réseau revient. Vous pouvez fermer l'application sans rien perdre."
          : "Tout votre travail est enregistré sur le serveur."}
        <br />
        Cet envoi met vos données à l'abri ; il ne remplace pas le bouton
        « Envoyer au Délégué Départemental », qui transmet officiellement le rapport.
      </p>
    </div>
  );
}

function Ligne({ libelle, valeur, couleur }: { libelle: string; valeur: string; couleur?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-line py-2.5 last:border-b-0">
      <span className="text-sm text-ink-muted">{libelle}</span>
      <span className={`text-sm font-semibold ${couleur ?? "text-ink"}`}>{valeur}</span>
    </div>
  );
}
