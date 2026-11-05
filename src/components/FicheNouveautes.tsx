"use client";

/**
 * La fiche « Nouveautés » (ordre du Délégué, 4 novembre 2026) : après une mise
 * à jour, une seule fois par compte et par appareil, ce qui change POUR CE
 * RÔLE — une capture, « Ce que vous faites », « Ce que vous obtenez ». Se
 * revoit dans le menu, « Nouveautés ».
 *
 * Elle attend que l'écran soit libre : jamais par-dessus une visite guidée,
 * l'écran de passage ni le premier téléchargement hors ligne.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { EDITIONS, cleNouveautesVues, nouveautesPour, type Nouveaute } from "@/lib/nouveautes";

export function EtapesNouveaute({ n }: { n: Nouveaute }) {
  return (
    <div className="space-y-4">
      {n.etapes.map((e, i) => (
        <figure key={i} className="overflow-hidden rounded-card border border-line bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={e.image} alt={e.faire} className="block max-h-[52vh] w-full bg-gray-100 object-contain" loading="lazy" />
          <figcaption className="space-y-1.5 p-3 text-[14px] leading-snug">
            <p>
              <span className="font-bold text-primary-dark">Ce que vous faites : </span>
              {e.faire}
            </p>
            <p>
              <span className="font-bold text-green-800">Ce que vous obtenez : </span>
              {e.obtenir}
            </p>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

export default function FicheNouveautes({ username, role, adminSysteme }: { username: string; role: string; adminSysteme: boolean }) {
  const edition = EDITIONS[0];
  const [liste, setListe] = useState<Nouveaute[] | null>(null);
  const [rang, setRang] = useState(0);

  useEffect(() => {
    if (!edition) return;
    let deja = false;
    try {
      deja = localStorage.getItem(cleNouveautesVues(username)) === edition.id;
    } catch {
      deja = true; // stockage indisponible : on ne la montre pas sans fin
    }
    const pour = nouveautesPour(edition, role, adminSysteme);
    if (deja || pour.length === 0) return;
    // Attendre un écran libre : ni visite guidée, ni écran de passage.
    let essais = 0;
    const t = window.setInterval(() => {
      const occupe =
        /Passer la visite|Touchez l'écran pour continuer|Préparation de l'utilisation hors ligne/.test(document.body.innerText) ||
        Boolean(document.querySelector("[data-ecran-passage]"));
      if (!occupe || ++essais > 90) {
        window.clearInterval(t);
        setListe(pour);
      }
    }, 1000);
    return () => window.clearInterval(t);
  }, [edition, username, role, adminSysteme]);

  if (!liste || !edition) return null;
  const n = liste[rang];

  function fermer() {
    try {
      localStorage.setItem(cleNouveautesVues(username), edition.id);
    } catch {
      // sans conséquence
    }
    setListe(null);
  }

  return (
    <div className="fixed inset-0 z-[180] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Nouveautés">
      <div className="flex max-h-[96vh] w-full max-w-[560px] flex-col rounded-t-xl bg-surface shadow-xl sm:rounded-xl">
        <div className="border-b border-line px-4 py-3">
          <p className="text-[12px] font-bold uppercase tracking-wide text-cuivre">Nouveautés · {edition.titre}</p>
          <h2 className="text-[18px] font-bold leading-tight text-primary-dark">{n.titre}</h2>
          {liste.length > 1 && <p className="text-[12.5px] text-ink-muted">{rang + 1} sur {liste.length}</p>}
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <EtapesNouveaute n={n} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3">
          <Link href="/nouveautes" onClick={fermer} className="text-[13px] font-semibold text-primary underline">
            Tout revoir plus tard
          </Link>
          <div className="flex gap-2">
            {rang > 0 && (
              <button type="button" onClick={() => setRang(rang - 1)} className="min-h-[44px] rounded-btn border border-line px-4 text-[14px] font-semibold text-ink-muted">
                Précédent
              </button>
            )}
            {rang < liste.length - 1 ? (
              <button type="button" onClick={() => setRang(rang + 1)} className="min-h-[44px] rounded-btn bg-primary px-5 text-[14px] font-bold text-white">
                Suivant
              </button>
            ) : (
              <button type="button" onClick={fermer} className="min-h-[44px] rounded-btn bg-primary px-5 text-[14px] font-bold text-white">
                J&apos;ai compris
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
