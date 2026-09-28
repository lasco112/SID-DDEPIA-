"use client";

/**
 * Ouvre un écran sur un MOIS précis — le rapport mensuel à vérifier depuis un
 * refus du trimestre (demande du Délégué, 28 septembre 2026).
 *
 * Même geste que le sélecteur de période du bandeau (SelecteurPeriode.tsx),
 * volontairement recopié plutôt que modifié : le mensuel est en service. Les
 * écrans de saisie mensuelle lisent la période dans la base locale, renseignée
 * par /api/bootstrap : on écrit le cookie, on retélécharge le socle de ce mois,
 * PUIS on ouvre l'écran — sinon l'en-tête dirait septembre pendant que les
 * saisies partiraient dans un autre mois.
 */
import { telechargerBootstrap } from "@/lib/offlineStore";

export async function allerAuMois(periodeId: string, chemin: string): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("Pas de réseau : changer de mois demande une connexion.");
  }
  const avant = document.cookie.match(/(?:^|; )sid_periode=([^;]*)/)?.[1] ?? null;
  document.cookie = `sid_periode=${periodeId}; path=/; max-age=${365 * 24 * 3600}; SameSite=Lax`;
  try {
    await telechargerBootstrap();
  } catch {
    // Réseau perdu : on revient au mois d'avant plutôt que de laisser l'appareil incohérent.
    document.cookie = avant
      ? `sid_periode=${avant}; path=/; max-age=${365 * 24 * 3600}; SameSite=Lax`
      : "sid_periode=; path=/; max-age=0; SameSite=Lax";
    throw new Error("La connexion a été perdue : vous restez sur le mois précédent.");
  }
  window.location.href = chemin;
}
