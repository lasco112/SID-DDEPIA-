"use client";

/**
 * « À corriger » à l'écran (demande du Délégué, 1er octobre 2026) :
 *
 *  - le COMPTEUR du bandeau, sur tous les écrans ;
 *  - la LISTE, dans l'ordre du travail, chaque point disant où, quoi, que
 *    faire, avec « Aller corriger → » ;
 *  - le PARCOURS : une barre en bas de l'écran, « Point 2 sur 4 ·
 *    ← précédent · suivant → », tant qu'on corrige.
 *
 * Affichage seulement : voir lib/aCorriger.ts.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronLeft, ChevronRight, List, X, CheckCircle2 } from "lucide-react";
import {
  pointsACorriger, allerAuPoint, demanderAuDD, lireParcours, ecrireParcours, oublierServeur,
  EVENEMENT_PARCOURS, type PointACorriger,
} from "@/lib/aCorriger";
import { EVENEMENT_BOOTSTRAP_MAJ } from "@/lib/offlineStore";

const RAFRAICHIR_MS = 15_000;

/** Les points, recalculés régulièrement et à chaque retour sur l'onglet. */
export function usePointsACorriger(forcerServeur = false) {
  const [points, setPoints] = useState<PointACorriger[] | null>(null);
  const recharger = useCallback(async (forcer = false) => {
    try {
      const p = await pointsACorriger({ forcerServeur: forcer });
      if (p) setPoints(p); // null : appareil pas encore prêt, on garde l'état « recherche »
    } catch {
      setPoints((p) => p ?? []);
    }
  }, []);
  useEffect(() => {
    void recharger(forcerServeur);
    const t = setInterval(() => void recharger(), RAFRAICHIR_MS);
    const auRetour = () => {
      if (document.visibilityState === "visible") void recharger();
    };
    const apresBootstrap = () => void recharger(true);
    document.addEventListener("visibilitychange", auRetour);
    window.addEventListener(EVENEMENT_BOOTSTRAP_MAJ, apresBootstrap);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", auRetour);
      window.removeEventListener(EVENEMENT_BOOTSTRAP_MAJ, apresBootstrap);
    };
  }, [recharger, forcerServeur]);
  return { points, recharger };
}

// --------------------------------------------------------------------------
// Le compteur du bandeau
// --------------------------------------------------------------------------
export function BadgeACorriger() {
  const { points } = usePointsACorriger();
  if (!points || points.length === 0) return null;
  const bloquants = points.filter((p) => p.gravite === "bloquant").length;
  return (
    <Link
      href="/a-corriger"
      title={`${points.length} point${points.length > 1 ? "s" : ""} à corriger`}
      className={`flex h-9 shrink-0 items-center gap-1 rounded-md px-2 text-[13px] font-bold shadow-sm ${
        bloquants > 0 ? "bg-red-600 text-white hover:bg-red-700" : "bg-amber-400 text-amber-950 hover:bg-amber-300"
      }`}
    >
      <AlertTriangle size={16} />
      <span>{points.length}</span>
      <span className="hidden sm:inline">à corriger</span>
    </Link>
  );
}

// --------------------------------------------------------------------------
// La liste
// --------------------------------------------------------------------------
export function ListeACorriger() {
  const { points, recharger } = usePointsACorriger(true);
  const [filtre, setFiltre] = useState<"tous" | "mensuel" | "trimestriel">("tous");
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [erreur, setErreur] = useState<string | null>(null);

  if (!points) return <p className="text-sm text-gray-500">Recherche des points à corriger…</p>;

  const visibles = points.filter((p) => filtre === "tous" || p.rapport === filtre);
  if (points.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-5 text-green-900">
        <CheckCircle2 className="shrink-0" />
        <p className="text-sm font-medium">Rien à corriger pour le moment. Tout ce que vous avez saisi est en ordre.</p>
      </div>
    );
  }

  const aller = async (p: PointACorriger) => {
    setErreur(null);
    try {
      await allerAuPoint(p, visibles);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Ouverture impossible.");
    }
  };
  const demander = async (p: PointACorriger) => {
    if (!p.demande) return;
    const m = await demanderAuDD(p.demande);
    setMessages((x) => ({ ...x, [p.id]: m }));
    oublierServeur();
    void recharger(true);
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(["tous", "mensuel", "trimestriel"] as const).map((f) => {
          const n = f === "tous" ? points.length : points.filter((p) => p.rapport === f).length;
          return (
            <button
              key={f}
              onClick={() => setFiltre(f)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                filtre === f ? "border-primary bg-primary text-white" : "border-gray-300 bg-white text-gray-700"
              }`}
            >
              {f === "tous" ? "Tout" : f === "mensuel" ? "Mensuel" : "Trimestriel"} ({n})
            </button>
          );
        })}
        {visibles.length > 0 && (
          <button
            onClick={() => void aller(visibles[0])}
            className="ml-auto rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            Tout corriger dans l&apos;ordre →
          </button>
        )}
      </div>
      {erreur && <p className="mb-3 rounded bg-red-50 p-3 text-sm text-red-800">{erreur}</p>}

      <ol className="space-y-3">
        {visibles.map((p, i) => (
          <li
            key={p.id}
            className={`rounded-lg border bg-white p-4 shadow-sm ${p.gravite === "bloquant" ? "border-l-4 border-l-red-600" : "border-l-4 border-l-amber-400"}`}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {i + 1}. {p.gravite === "bloquant" ? "🔴 Bloquant" : "🟠 À vérifier"}
            </p>
            <p className="mt-1 font-semibold text-gray-900">{p.ou}</p>
            <p className="mt-1 text-sm text-gray-800">{p.quoi}</p>
            <p className="mt-1 text-sm text-gray-600">
              <span className="font-semibold">Que faire : </span>
              {p.faire}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => void aller(p)}
                className="min-h-[44px] rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover"
              >
                Aller corriger →
              </button>
              {p.demande && (
                <button
                  onClick={() => void demander(p)}
                  className="min-h-[44px] rounded-lg border border-red-600 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                >
                  Demander au DD de me renvoyer ce rapport
                </button>
              )}
            </div>
            {messages[p.id] && <p className="mt-2 text-sm text-gray-700">{messages[p.id]}</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}

// --------------------------------------------------------------------------
// Le parcours, en bas de l'écran
// --------------------------------------------------------------------------
export function ParcoursACorriger() {
  const [parcours, setParcours] = useState<ReturnType<typeof lireParcours>>(null);
  const { points } = usePointsACorriger();
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    const lire = () => setParcours(lireParcours());
    lire();
    window.addEventListener(EVENEMENT_PARCOURS, lire);
    return () => window.removeEventListener(EVENEMENT_PARCOURS, lire);
  }, []);

  if (!parcours || !points) return null;
  // Les points encore à corriger, dans l'ordre du parcours ; ceux apparus
  // depuis viennent à la suite.
  const restants = points.filter((p) => parcours.ids.includes(p.id));
  const nouveaux = points.filter((p) => !parcours.ids.includes(p.id));
  const liste = [...restants.sort((a, b) => parcours.ids.indexOf(a.id) - parcours.ids.indexOf(b.id)), ...nouveaux];
  const iCourant = liste.findIndex((p) => p.id === parcours.courant);
  const corrige = iCourant < 0;
  // Le point courant corrigé : le suivant est celui qui venait après lui dans le parcours.
  const positionDansParcours = parcours.ids.indexOf(parcours.courant);
  const suivant = corrige
    ? liste.find((p) => parcours.ids.indexOf(p.id) > positionDansParcours) ?? liste[0]
    : liste[iCourant + 1];
  const precedent = corrige
    ? [...liste].reverse().find((p) => parcours.ids.indexOf(p.id) >= 0 && parcours.ids.indexOf(p.id) < positionDansParcours)
    : liste[iCourant - 1];

  const aller = async (p?: PointACorriger) => {
    if (!p) return;
    setErreur(null);
    try {
      await allerAuPoint(p, liste);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Ouverture impossible.");
    }
  };
  const fermer = () => ecrireParcours(null);

  if (liste.length === 0) {
    return (
      <div className="fixed inset-x-2 bottom-2 z-40 mx-auto flex max-w-xl items-center gap-3 rounded-xl bg-green-700 px-4 py-3 text-white shadow-lg">
        <CheckCircle2 className="shrink-0" />
        <p className="flex-1 text-sm font-semibold">Tout est corrigé. Bravo !</p>
        <button onClick={fermer} aria-label="Fermer" className="rounded p-2 hover:bg-white/15">
          <X size={18} />
        </button>
      </div>
    );
  }

  const courant = corrige ? null : liste[iCourant];
  return (
    <>
    {/* La barre ne doit pas cacher le bas de la page. */}
    <div className="h-20" aria-hidden="true" />
    <div className="fixed inset-x-2 bottom-2 z-40 mx-auto max-w-2xl rounded-xl bg-gray-900 px-3 py-2 text-white shadow-2xl">
      <div className="flex items-center gap-2">
        <button
          onClick={() => void aller(precedent)}
          disabled={!precedent}
          aria-label="Point précédent"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-white/15 disabled:opacity-30"
        >
          <ChevronLeft />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-white/60">
            {corrige ? (
              <span className="text-green-300">✓ Corrigé — reste {liste.length}</span>
            ) : (
              `Point ${iCourant + 1} sur ${liste.length}`
            )}
          </p>
          <p className="truncate text-sm font-medium">{courant ? courant.quoi : "Passez au point suivant."}</p>
          {erreur && <p className="text-xs text-red-300">{erreur}</p>}
        </div>
        <button
          onClick={() => void aller(suivant)}
          disabled={!suivant}
          className={`flex h-11 shrink-0 items-center gap-1 rounded-lg px-3 text-sm font-semibold disabled:opacity-30 ${
            corrige ? "bg-green-500 text-gray-900 hover:bg-green-400" : "bg-white/15 hover:bg-white/25"
          }`}
        >
          <span className="hidden sm:inline">Suivant</span>
          <ChevronRight />
        </button>
        <Link href="/a-corriger" aria-label="Liste" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-white/15">
          <List size={20} />
        </Link>
        <button onClick={fermer} aria-label="Fermer" className="flex h-11 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-white/15">
          <X size={18} />
        </button>
      </div>
    </div>
    </>
  );
}
