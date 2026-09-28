"use client";

/**
 * Le refus « catégories ≠ total mensuel », rendu COMPRÉHENSIBLE et SOIGNABLE
 * (demande du Délégué, 28 septembre 2026) : trois chiffres, d'où vient celui
 * des rapports mensuels mois par mois, et un bouton qui ouvre directement le
 * rapport mensuel à vérifier.
 *
 * Un cheptel est un effectif à date : c'est le mois le plus récent qui fait le
 * trimestre, pas la somme des mois. Des abattages s'additionnent. L'encadré le
 * dit, pour que personne ne cherche l'erreur au mauvais endroit.
 */
import { useState } from "react";
import { allerAuMois } from "@/lib/allerAuMois";

export interface ControleCategories {
  tableau: number;
  titreTableau: string;
  arrondissement: string;
  nature: string;
  categories: { libelle: string; valeur: number }[];
  somme: number;
  total: number;
  ecart: number;
  regle: "DERNIERE_VALEUR" | "SOMME";
  mois: { periodeId: string | null; libelle: string; valeur: number | null; retenu: boolean; statutRapport: string | null }[];
  mensuel: { code: string; numero: string; titre: string } | null;
}

const f = (n: number) => n.toLocaleString("fr-FR");

const STATUT_RAPPORT: Record<string, string> = {
  EN_SAISIE: "en saisie",
  REJETE: "renvoyé pour correction",
  SOUMIS: "transmis au DD",
  CLOTURE: "clôturé",
};

export default function ComparaisonMensuel({
  controle: c,
  /** Vrai pour un DA ou un agent : il ouvre SON rapport mensuel ; le DD, ses données par arrondissement. */
  arrondissement,
  onFermer,
}: {
  controle: ControleCategories;
  arrondissement: boolean;
  onFermer: () => void;
}) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [ouverture, setOuverture] = useState<string | null>(null);
  const stock = c.regle === "DERNIERE_VALEUR";
  const retenus = c.mois.filter((m) => m.retenu);
  const origine = stock
    ? `le chiffre de ${retenus[0]?.libelle.toLowerCase() ?? "du dernier mois"}, le plus récent`
    : `la somme des mois`;
  const trop = c.somme > c.total;

  async function ouvrir(periodeId: string) {
    setErreur(null);
    setOuverture(periodeId);
    try {
      await allerAuMois(periodeId, arrondissement && c.mensuel ? `/da/saisie/${c.mensuel.code}` : "/dd/donnees");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Ouverture impossible.");
      setOuverture(null);
    }
  }

  return (
    <section role="alert" className="mb-4 overflow-hidden rounded-lg border border-red-300 bg-white">
      <div className="bg-red-50 px-4 py-3">
        <p className="text-sm font-bold text-red-900">
          Le {c.nature} de {c.arrondissement} ne concorde pas — la case n&apos;est pas enregistrée.
        </p>
      </div>

      {/* Les trois chiffres */}
      <dl className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100 text-center">
        <div className="px-2 py-3">
          <dt className="text-[11px] uppercase tracking-wide text-ink-faint">Vos catégories</dt>
          <dd className="mt-0.5 text-lg font-bold text-gray-900">{f(c.somme)}</dd>
        </div>
        <div className="px-2 py-3">
          <dt className="text-[11px] uppercase tracking-wide text-ink-faint">Rapports mensuels</dt>
          <dd className="mt-0.5 text-lg font-bold text-gray-900">{f(c.total)}</dd>
        </div>
        <div className="px-2 py-3">
          <dt className="text-[11px] uppercase tracking-wide text-ink-faint">Écart</dt>
          <dd className="mt-0.5 text-lg font-bold text-red-700">
            {trop ? "+" : "−"}
            {f(c.ecart)}
          </dd>
        </div>
      </dl>

      <div className="px-4 py-3">
        <p className="text-sm text-gray-800">
          Le chiffre des rapports mensuels est <strong>{origine}</strong>
          {stock ? " : un cheptel est un effectif à date, on ne l'additionne pas." : "."}
        </p>

        {/* D'où vient le chiffre, mois par mois */}
        <ul className="mt-2 divide-y divide-gray-100 rounded-md border border-gray-200">
          {c.mois.map((m) => (
            <li key={m.libelle} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm ${m.retenu ? "bg-amber-50" : ""}`}>
              <span className={`w-28 ${m.retenu ? "font-semibold text-gray-900" : "text-gray-600"}`}>{m.libelle}</span>
              <span className={`w-16 text-right tabular-nums ${m.retenu ? "font-bold text-gray-900" : "text-gray-600"}`}>
                {m.valeur == null ? "—" : f(m.valeur)}
              </span>
              {m.retenu && stock && <span className="text-xs font-semibold text-amber-800">← c&apos;est lui qui compte</span>}
              <span className="flex w-full items-center justify-between gap-2 sm:ml-auto sm:w-auto">
                {m.statutRapport && <span className="text-xs text-ink-faint">rapport {STATUT_RAPPORT[m.statutRapport] ?? m.statutRapport}</span>}
                {m.periodeId && (m.retenu || !stock) && (
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

        {/* Ce qu'il a saisi */}
        <p className="mt-3 text-xs text-ink-muted">
          <span className="font-semibold text-gray-700">Vos catégories : </span>
          {c.categories.map((k) => `${k.libelle} ${f(k.valeur)}`).join(" · ")}
        </p>

        {/* Que faire */}
        <div className="mt-3 rounded-md bg-appbg p-3 text-sm text-gray-800">
          <p className="font-semibold">Que faire ?</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>
              Si <strong>vos catégories sont justes</strong>, c&apos;est le rapport mensuel qui est à corriger
              {stock && retenus[0] ? ` (${retenus[0].libelle.toLowerCase()})` : ""}. Ouvrez-le avec le bouton ci-dessus
              {retenus.some((m) => m.statutRapport === "SOUMIS" || m.statutRapport === "CLOTURE")
                ? " — il est déjà transmis : demandez au DD de vous le renvoyer pour le corriger."
                : "."}
            </li>
            <li>
              Sinon, <strong>corrigez une catégorie</strong> dans le tableau ci-dessous : il faut {trop ? "retirer" : "ajouter"}{" "}
              {f(c.ecart)} au total de vos catégories.
            </li>
          </ul>
        </div>

        {erreur && <p className="mt-2 text-sm text-red-800">{erreur}</p>}
        <button type="button" onClick={onFermer} className="mt-3 text-xs text-ink-muted underline">
          Masquer ce détail
        </button>
      </div>
    </section>
  );
}
