"use client";

/**
 * FilEtapes.tsx — « Rapport trimestriel · étape 2 sur 5 », en haut de chaque
 * écran qui est une étape, et « Étape suivante → » en bas.
 *
 * Demande du Délégué (27 septembre 2026) : ses collègues ne savaient pas dans
 * quel ordre franchir les écrans du trimestre ni à quoi chacun servait. Le fil
 * se déduit du menu (navItems.ts) : un écran qui n'y est pas une étape n'en
 * affiche aucun. Posé une fois dans AppShellClient, pour tous les écrans.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { entreeCourante, etapesDu } from "@/lib/navItems";

export default function FilEtapes({ role, position }: { role: string; position: "haut" | "bas" }) {
  const courante = entreeCourante(role, usePathname());
  if (!courante || courante.item.etape == null) return null;

  const etapes = etapesDu(courante.groupe);
  const rang = etapes.findIndex((e) => e.href === courante.item.href);
  const suivante = etapes[rang + 1];

  if (position === "bas") {
    if (!suivante) return null;
    return (
      <div className="mt-8 flex justify-end border-t border-line pt-4">
        <Link
          href={suivante.href}
          className="w-full rounded-md bg-primary px-4 py-3 text-center text-sm font-semibold text-white hover:bg-primary-dark sm:w-auto"
        >
          Étape suivante : {suivante.label} →
        </Link>
      </div>
    );
  }

  return (
    <nav aria-label="Étapes" className="mb-5 rounded-lg border border-line bg-white px-3 py-2.5">
      <div className="text-xs text-ink-faint">
        <strong className="text-ink-muted">{courante.groupe.titre}</strong> · étape {rang + 1} sur {etapes.length}
      </div>
      <ol className="mt-2 flex flex-wrap gap-1.5">
        {etapes.map((e, i) => {
          const ici = i === rang;
          return (
            <li key={e.href}>
              <Link
                href={e.href}
                aria-current={ici ? "step" : undefined}
                title={`Étape ${e.etape} : ${e.label}`}
                aria-label={`Étape ${e.etape} : ${e.label}`}
                className={`flex items-center gap-1.5 rounded-full border px-1.5 py-1 text-xs sm:px-2.5 ${
                  ici
                    ? "border-primary bg-primary-light font-semibold text-primary-dark"
                    : "border-line text-ink-muted hover:border-primary hover:text-primary-dark"
                }`}
              >
                <span
                  className={`flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10.5px] font-bold ${
                    ici ? "bg-primary text-white" : "bg-appbg"
                  }`}
                >
                  {e.etape}
                </span>
                {/* Sur téléphone, les numéros seuls, sur une ligne : le titre de l'écran dit déjà l'étape en cours. */}
                <span className="hidden sm:inline">{e.label}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
