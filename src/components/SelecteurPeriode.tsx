"use client";

/**
 * Sélecteur de période de travail (CDC §1 et §15.1).
 *
 * Visible en permanence dans le bandeau : l'utilisateur doit toujours savoir
 * sur quel mois il travaille. Le choix est écrit dans un cookie lu côté
 * serveur, puis la page est rechargée pour que toutes les données affichées
 * correspondent au mois choisi.
 */

import { useEffect, useState } from "react";
import { telechargerBootstrap } from "@/lib/offlineStore";

export interface PeriodeOption {
  id: string;
  libelle: string;
  cloturee: boolean;
}

export default function SelecteurPeriode({
  periodes,
  couranteId,
}: {
  periodes: PeriodeOption[];
  couranteId: string | null;
}) {
  const [enCours, setEnCours] = useState(false);
  const [horsLigne, setHorsLigne] = useState(false);

  // Changer de mois exige de retélécharger les données de référence de ce
  // mois : c'est impossible sans réseau. Plutôt que de laisser croire au
  // changement, on désactive le sélecteur hors ligne.
  useEffect(() => {
    const majEtat = () => setHorsLigne(!navigator.onLine);
    majEtat();
    window.addEventListener("online", majEtat);
    window.addEventListener("offline", majEtat);
    return () => {
      window.removeEventListener("online", majEtat);
      window.removeEventListener("offline", majEtat);
    };
  }, []);

  if (periodes.length === 0) return null;

  async function changer(id: string) {
    setEnCours(true);
    // Un an de validité : le choix doit survivre à la fermeture du navigateur,
    // sans quoi un agent qui reprend une saisie rétroactive le lendemain
    // repartirait sur le mois courant sans s'en apercevoir.
    document.cookie = `sid_periode=${id}; path=/; max-age=${365 * 24 * 3600}; SameSite=Lax`;

    // Le point critique. Les écrans de saisie ne lisent PAS le cookie : ils
    // prennent la période dans la base locale (Dexie), renseignée par
    // /api/bootstrap. Un simple router.refresh() rafraîchissait l'affichage
    // sans toucher à cette base : l'en-tête annonçait juin pendant que les
    // saisies continuaient de partir dans juillet — exactement le mélange de
    // mois que le cahier des charges interdit.
    //
    // On retélécharge donc le socle AVANT de recharger la page, puis on force
    // un chargement complet pour que chaque écran reparte du bon mois.
    try {
      await telechargerBootstrap();
    } catch {
      // Réseau perdu entre-temps : on annule le changement plutôt que de
      // laisser l'appareil dans un état incohérent.
      document.cookie = `sid_periode=; path=/; max-age=0; SameSite=Lax`;
      setEnCours(false);
      alert(
        "Changement de période impossible : la connexion a été perdue. Vous restez sur le mois précédent."
      );
      return;
    }
    window.location.reload();
  }

  const courante = periodes.find((p) => p.id === couranteId);

  return (
    <label
      className="flex items-center gap-1.5"
      title={
        horsLigne
          ? "Hors ligne : le changement de mois est indisponible tant que la connexion n'est pas revenue."
          : "Période de travail : toutes les données affichées et saisies concernent ce mois."
      }
    >
      <span className="hidden text-[11px] uppercase tracking-wide text-white/70 sm:inline">Période</span>
      <select
        value={couranteId ?? ""}
        disabled={enCours || horsLigne}
        onChange={(e) => changer(e.target.value)}
        className="max-w-[9.5rem] truncate rounded-md border border-white/30 bg-white/10 px-2 py-1 text-xs font-semibold text-white outline-none focus:border-white/70 disabled:opacity-60"
      >
        {periodes.map((p) => (
          <option key={p.id} value={p.id} className="text-gray-900">
            {p.libelle}
            {p.cloturee ? " — clôturée" : ""}
          </option>
        ))}
      </select>
      {courante?.cloturee && (
        <span title="Période clôturée : consultation seule." className="text-xs">
          🔒
        </span>
      )}
    </label>
  );
}
