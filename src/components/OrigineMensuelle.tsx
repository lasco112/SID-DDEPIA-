"use client";

/**
 * « D'OÙ VIENT CE CHIFFRE ? » — une case grise du trimestre, détaillée mois
 * par mois (demande du Délégué, 20 octobre 2026 : un chef qui voit une erreur
 * au trimestre doit pouvoir vérifier le mensuel, d'où elle vient forcément).
 *
 * Lecture seule. Le bouton « Ouvrir ce mois » mène à l'écran mensuel de chacun
 * — le contrôle des chiffres pour un chef, les données par arrondissement pour
 * le DD, le rapport mensuel pour un DA ou un agent — où la correction se fait
 * par le circuit du mensuel, inchangé. Le trimestre se recalcule ensuite seul.
 */
import { useState } from "react";
import { allerAuMois } from "@/lib/allerAuMois";
import { useUtilisateur } from "@/components/UtilisateurContexte";
import type { ControleCategories } from "@/components/ComparaisonMensuel";

export type Origine = ControleCategories & { explication: string; periodeLue: string };

const f = (n: number) => n.toLocaleString("fr-FR");
const STATUT_RAPPORT: Record<string, string> = {
  EN_SAISIE: "en saisie",
  REJETE: "renvoyé pour correction",
  SOUMIS: "transmis au DD",
  CLOTURE: "clôturé",
};

export default function OrigineMensuelle({ origine: o, onFermer }: { origine: Origine; onFermer: () => void }) {
  const moi = useUtilisateur();
  const role = moi?.role ?? "";
  const [erreur, setErreur] = useState<string | null>(null);
  const [ouverture, setOuverture] = useState<string | null>(null);
  const stock = o.regle === "DERNIERE_VALEUR";

  const chemin =
    role === "DA" || role === "AGENT_SAISIE"
      ? o.mensuel ? `/da/saisie/${o.mensuel.code}` : "/da/saisie"
      : role === "DD"
        ? "/dd/donnees"
        : "/section/controle";

  const queFaire =
    role === "DA" || role === "AGENT_SAISIE"
      ? "Si un mois est faux, corrigez-le dans votre rapport mensuel ; s'il est déjà transmis, demandez au DD de vous le renvoyer."
      : role === "DD"
        ? "Si un mois est faux, corrigez-le dans les données de l'arrondissement ou renvoyez son rapport ; s'il est clôturé, rouvrez d'abord le mois dans « Ouvrir et clôturer les mois »."
        : "Si un mois est faux, ouvrez-le : dans « Contrôler les chiffres des arrondissements », vous corrigez la case de votre section (correction tracée, motif obligatoire). Si le mois est clôturé, demandez au DD de le rouvrir.";

  async function ouvrir(periodeId: string) {
    setErreur(null);
    setOuverture(periodeId);
    try {
      await allerAuMois(periodeId, chemin);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Ouverture impossible.");
      setOuverture(null);
    }
  }

  return (
    <section className="mb-4 overflow-hidden rounded-card border border-primary/40 bg-white shadow-card">
      <div className="bg-primary-light px-4 py-3">
        <p className="text-sm font-bold text-primary-dark">
          D&apos;où vient ce chiffre ? — {o.arrondissement}, « {o.nature} » ({o.periodeLue})
        </p>
        <p className="mt-0.5 text-xs text-ink-muted">{o.explication}</p>
      </div>
      <div className="px-4 py-3">
        <p className="text-sm text-gray-800">
          Il se calcule à partir des rapports mensuels :{" "}
          <strong>{stock ? "le chiffre du mois le plus récent (un effectif à date ne s'additionne pas)" : "la somme des mois"}</strong>.
        </p>
        <ul className="mt-2 divide-y divide-gray-100 rounded-md border border-gray-200">
          {o.mois.map((m) => (
            <li key={m.libelle} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm ${m.retenu ? "bg-amber-50" : ""}`}>
              <span className={`w-28 ${m.retenu ? "font-semibold text-gray-900" : "text-gray-600"}`}>{m.libelle}</span>
              <span className={`w-20 text-right tabular-nums ${m.retenu ? "font-bold text-gray-900" : "text-gray-600"}`}>{m.valeur == null ? "—" : f(m.valeur)}</span>
              {m.retenu && stock && <span className="text-xs font-semibold text-amber-800">← c&apos;est lui qui compte</span>}
              <span className="flex w-full items-center justify-between gap-2 sm:ml-auto sm:w-auto">
                {m.statutRapport && <span className="text-xs text-ink-faint">rapport {STATUT_RAPPORT[m.statutRapport] ?? m.statutRapport}</span>}
                {m.periodeId && (
                  <button
                    type="button"
                    disabled={ouverture != null}
                    onClick={() => void ouvrir(m.periodeId!)}
                    className="rounded border border-primary px-2 py-1 text-xs font-semibold text-primary hover:bg-primary-light disabled:opacity-50"
                  >
                    {ouverture === m.periodeId ? "Ouverture…" : "Ouvrir ce mois →"}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 rounded-md bg-appbg p-3 text-sm text-gray-800">
          <span className="font-semibold">Que faire ?</span> {queFaire} Le trimestre se recalcule ensuite tout seul : ce chiffre ne se tape jamais au trimestre.
        </p>
        {erreur && <p className="mt-2 text-sm text-red-800">{erreur}</p>}
        <button type="button" onClick={onFermer} className="mt-3 text-xs text-ink-muted underline">
          Fermer
        </button>
      </div>
    </section>
  );
}
