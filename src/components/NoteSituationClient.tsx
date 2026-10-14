"use client";

/**
 * La note de situation du DD : choisir les mois, relire à l'écran, retoucher
 * les faits saillants, ajouter ses remarques, télécharger (PowerPoint, Word,
 * PDF). Les chiffres viennent du serveur et ne se retouchent pas.
 */
import { useEffect, useState } from "react";
import VisiteGuidee from "@/components/VisiteGuidee";
import type { FaitSaillant, Indicateur, NoteSituation } from "@/server/note/noteSituation";

interface MoisDispo {
  annee: number;
  mois: number;
  libelle: string;
}

const cle = (m: { annee: number; mois: number }) => `${m.annee}-${String(m.mois).padStart(2, "0")}`;
const nb = (v: number, d = 0) => v.toLocaleString("fr-FR", { maximumFractionDigits: d });

const COULEUR_FAIT: Record<string, string> = {
  hausse: "bg-green-600",
  baisse: "bg-red-600",
  alerte: "bg-red-600",
  fiabilite: "bg-amber-500",
  info: "bg-primary",
};

function evolution(i: Indicateur) {
  if (i.evolution == null) return { texte: "—", classe: "text-gray-400" };
  if (Math.abs(i.evolution) < 0.05) return { texte: "= stable", classe: "text-gray-500" };
  const hausse = i.evolution > 0;
  const bon = hausse === i.hausseFavorable;
  return { texte: `${hausse ? "▲ +" : "▼ −"}${nb(Math.abs(i.evolution), 1)} %`, classe: bon ? "text-green-700" : "text-red-700" };
}

export default function NoteSituationClient() {
  const [mois, setMois] = useState<MoisDispo[] | null>(null);
  const [debut, setDebut] = useState("");
  const [fin, setFin] = useState("");
  const [note, setNote] = useState<NoteSituation | null>(null);
  const [faits, setFaits] = useState<(FaitSaillant & { garde: boolean })[]>([]);
  const [remarques, setRemarques] = useState("");
  /** Les événements ponctuels du Délégué ; gardés sur l'appareil, période par période. */
  const [evenements, setEvenements] = useState<{ titre: string; texte: string }[]>([]);
  const cleEvenements = `sid-note-evenements|${debut}|${fin}`;
  useEffect(() => {
    try {
      const brut = localStorage.getItem(cleEvenements);
      setEvenements(brut ? (JSON.parse(brut) as { titre: string; texte: string }[]) : []);
    } catch {
      setEvenements([]);
    }
  }, [cleEvenements]);
  const changerEvenements = (liste: { titre: string; texte: string }[]) => {
    setEvenements(liste);
    try {
      localStorage.setItem(cleEvenements, JSON.stringify(liste));
    } catch {
      // stockage indisponible : la liste vit le temps de la page
    }
  };
  const [chargement, setChargement] = useState(false);
  const [telechargement, setTelechargement] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dd/note-situation")
      .then((r) => r.json())
      .then((d: { mois?: MoisDispo[]; message?: string }) => {
        const liste = d.mois ?? [];
        setMois(liste);
        if (liste.length) {
          // Par défaut : le dernier trimestre qui a des chiffres.
          const dernier = liste[0];
          const premierDuTrimestre = Math.floor((dernier.mois - 1) / 3) * 3 + 1;
          const d0 = liste.find((m) => m.annee === dernier.annee && m.mois === premierDuTrimestre) ?? dernier;
          setDebut(cle(d0));
          setFin(cle(dernier));
        }
      })
      .catch(() => setErreur("Impossible de lire les mois disponibles."));
  }, []);

  /** Les raccourcis : à partir du dernier mois qui a des chiffres. */
  function raccourci(type: "mois" | "trimestre" | "trois" | "annee") {
    if (!mois?.length) return;
    const dernier = mois[0];
    let d = dernier;
    if (type === "trimestre") d = { ...dernier, mois: Math.floor((dernier.mois - 1) / 3) * 3 + 1, libelle: "" };
    if (type === "trois") {
      const r = dernier.annee * 12 + dernier.mois - 1 - 2;
      d = { annee: Math.floor(r / 12), mois: (r % 12) + 1, libelle: "" };
    }
    if (type === "annee") d = { ...dernier, mois: 1, libelle: "" };
    setDebut(cle(d));
    setFin(cle(dernier));
    setNote(null);
  }

  async function preparer() {
    setChargement(true);
    setErreur(null);
    setNote(null);
    try {
      const r = await fetch(`/api/dd/note-situation?debut=${debut}&fin=${fin}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.message ?? "La note n'a pas pu être préparée.");
      setNote(d as NoteSituation);
      setFaits((d as NoteSituation).faits.map((f) => ({ ...f, garde: true })));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "La note n'a pas pu être préparée.");
    } finally {
      setChargement(false);
    }
  }

  async function telecharger(format: "pptx" | "docx" | "pdf") {
    setTelechargement(format);
    setErreur(null);
    try {
      const r = await fetch("/api/dd/note-situation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          debut,
          fin,
          format,
          faits: faits.filter((f) => f.garde && f.texte.trim()).map(({ texte, genre }) => ({ texte, genre })),
          remarques,
          evenements: evenements.filter((e) => e.titre.trim() || e.texte.trim()),
        }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? "Le fichier n'a pas pu être produit.");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ?? `note_de_situation.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Le fichier n'a pas pu être produit.");
    } finally {
      setTelechargement(null);
    }
  }

  if (!mois) return <p className="text-gray-600">Chargement…</p>;
  if (mois.length === 0) return <p className="rounded-md bg-amber-50 p-4 text-sm text-amber-900">Aucun rapport mensuel transmis : il n&apos;y a encore rien à présenter.</p>;

  // Les mois du plus ancien au plus récent, pour les listes.
  const chrono = [...mois].reverse();
  const indicateurs = note?.indicateurs.filter((i) => i.valeur != null) ?? [];
  const provisoire = note && note.couverture.recus < note.couverture.attendus;

  return (
    <div>
      <VisiteGuidee ecran="note-situation" />

      {/* La période */}
      <div data-visite="periode-note" className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-gray-700">
            Du mois
            <select value={debut} onChange={(e) => { setDebut(e.target.value); setNote(null); }} className="mt-1 block min-h-[44px] rounded-md border border-gray-300 px-2">
              {chrono.map((m) => <option key={cle(m)} value={cle(m)}>{m.libelle}</option>)}
            </select>
          </label>
          <label className="text-sm text-gray-700">
            au mois
            <select value={fin} onChange={(e) => { setFin(e.target.value); setNote(null); }} className="mt-1 block min-h-[44px] rounded-md border border-gray-300 px-2">
              {chrono.map((m) => <option key={cle(m)} value={cle(m)}>{m.libelle}</option>)}
            </select>
          </label>
          <button
            type="button"
            data-visite="preparer-note"
            onClick={() => void preparer()}
            disabled={chargement || !debut || !fin || debut > fin}
            className="min-h-[44px] rounded-md bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
          >
            {chargement ? "Préparation…" : "Préparer la note"}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <span className="text-gray-500">Raccourcis :</span>
          {([["mois", "Dernier mois"], ["trimestre", "Trimestre en cours"], ["trois", "Trois derniers mois"], ["annee", "Depuis janvier"]] as const).map(([t, l]) => (
            <button key={t} type="button" onClick={() => raccourci(t)} className="rounded-full border border-gray-300 px-3 py-1 text-gray-700 hover:bg-gray-50">
              {l}
            </button>
          ))}
        </div>
        {debut > fin && <p className="mt-2 text-sm text-red-700">Le mois de fin précède le mois de début.</p>}
      </div>

      {erreur && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">{erreur}</p>}

      {note && (
        <div className="mt-6 space-y-6">
          {/* En-tête de la note */}
          <div className="rounded-lg bg-primary p-5 text-white">
            <p className="text-xs uppercase tracking-wide text-white/80">Note de situation · {note.departement.sigle}</p>
            <p className="mt-1 text-xl font-bold">Département {note.departement.nomAvecArticle} — {note.periode.libelle}</p>
            <p className="mt-1 text-sm text-white/90">
              {note.comparaison
                ? `Comparé ${note.comparaison.nature === "an_passe" ? "à la même période l'an passé" : "à la période précédente"} : ${note.comparaison.libelle}.`
                : "Sans comparaison : pas de période de référence dans le SID."}
            </p>
          </div>
          <p className={`rounded-md p-3 text-sm ${provisoire ? "bg-amber-50 text-amber-900" : "bg-green-50 text-green-900"}`}>
            {provisoire ? "Chiffres provisoires" : "Chiffres complets"} : {note.couverture.recus} rapports mensuels transmis sur {note.couverture.attendus}.
            {note.couverture.manquants.length > 0 && ` Manquent : ${note.couverture.manquants.map((m) => `${m.arrondissement} (${m.mois.join(", ")})`).join(" ; ")}.`}
          </p>

          {/* Les chiffres clés */}
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">L&apos;essentiel en chiffres</h2>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {indicateurs.map((i) => {
                const e = evolution(i);
                return (
                  <div key={i.cle} className="rounded-lg bg-primary-light p-3">
                    <p className="text-xs text-gray-600">{i.libelle}</p>
                    <p className="text-2xl font-bold text-primary-dark">{nb(i.valeur!, i.decimales)}</p>
                    <p className="text-xs text-gray-700">{i.unite}</p>
                    <p className={`mt-1 text-sm font-semibold ${e.classe}`}>{e.texte}</p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Les faits saillants, retouchables */}
          <section data-visite="faits-note">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Faits saillants</h2>
            <p className="text-xs text-gray-500">Décochez ce que vous ne présentez pas ; reformulez si besoin. Les chiffres du reste de la note ne changent pas.</p>
            <ul className="mt-2 space-y-2">
              {faits.map((f, k) => (
                <li key={k} className={`flex items-start gap-2 rounded-md border p-2 ${f.garde ? "border-gray-200 bg-white" : "border-dashed border-gray-200 bg-gray-50 opacity-60"}`}>
                  <input
                    type="checkbox"
                    checked={f.garde}
                    onChange={(e) => setFaits((x) => x.map((y, i) => (i === k ? { ...y, garde: e.target.checked } : y)))}
                    className="mt-2 h-5 w-5"
                    aria-label="Retenir ce fait"
                  />
                  <span className={`mt-2.5 h-2.5 w-2.5 shrink-0 ${COULEUR_FAIT[f.genre] ?? "bg-primary"}`} />
                  <textarea
                    value={f.texte}
                    rows={Math.max(1, Math.ceil(f.texte.length / 95))}
                    onChange={(e) => setFaits((x) => x.map((y, i) => (i === k ? { ...y, texte: e.target.value } : y)))}
                    className="w-full resize-y rounded border border-transparent p-1 text-sm text-gray-900 focus:border-gray-300"
                  />
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setFaits((x) => [...x, { texte: "", genre: "info", garde: true }])}
              className="mt-2 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              + Ajouter un fait
            </button>
          </section>

          {/* Ce que la note dit en plus des chiffres de l'élevage */}
          <section className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Épisodes épidémiques et leur gestion</h2>
              {note.episodes.length ? (
                <ul className="mt-1 space-y-1 text-sm text-gray-800">
                  {note.episodes.slice(0, 5).map((e, k) => (
                    <li key={k}>
                      <strong>{e.maladie}</strong> — {e.arrondissement} : {nb(e.foyers)} foyer{e.foyers > 1 ? "s" : ""}
                      {e.morts ? `, ${nb(e.morts)} morts` : ""}
                      {e.mesures.length ? <span className="text-gray-600"> · {e.mesures.join(" ; ")}</span> : <span className="text-gray-400"> · mesures non précisées</span>}
                    </li>
                  ))}
                  {note.episodes.length > 5 && <li className="text-gray-500">… et {note.episodes.length - 5} autre(s), dans la présentation.</li>}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-gray-600">Aucun foyer déclaré dans les rapports mensuels de la période.</p>
              )}
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Budget : recettes, crédits, marchés</h2>
              {note.budget.recettes || note.budget.credits || note.budget.marches ? (
                <ul className="mt-1 space-y-1 text-sm text-gray-800">
                  {note.budget.recettes && <li>Recettes encaissées : <strong>{nb(note.budget.recettes.total ?? 0)} FCFA</strong></li>}
                  {note.budget.credits?.fonctionnement != null && <li>Crédits de fonctionnement ({note.budget.credits.trimestre}) : {nb(note.budget.credits.fonctionnement)} FCFA</li>}
                  {note.budget.credits?.investissement != null && <li>Crédits d&apos;investissement ({note.budget.credits.trimestre}) : {nb(note.budget.credits.investissement)} FCFA</li>}
                  {note.budget.marches && (
                    <li>
                      {note.budget.marches.lignes.length} marché(s) du BIP : {note.budget.marches.parNiveau.map((p) => `${p.nombre} ${p.niveau.toLowerCase()}`).join(", ")}
                    </li>
                  )}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-gray-600">
                  Rien n&apos;est encore saisi par le BAC pour ce trimestre (recettes, crédits, marchés du BIP) : cette page ne sera pas présentée.
                </p>
              )}
            </div>
          </section>

          {/* Les événements particuliers, écrits par le Délégué */}
          <section data-visite="evenements-note">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Événements particuliers (facultatif)</h2>
            <p className="text-xs text-gray-500">
              Ce que les rapports mensuels ne disent pas : une visite officielle, une campagne, une inondation, un conflit agropastoral… Chacun aura sa place
              dans la présentation. Gardés sur cet appareil pour cette période.
            </p>
            <div className="mt-2 space-y-2">
              {evenements.map((e, k) => (
                <div key={k} className="rounded-md border-l-4 border-amber-500 bg-white p-2 shadow-sm">
                  <div className="flex gap-2">
                    <input
                      value={e.titre}
                      onChange={(x) => changerEvenements(evenements.map((y, i) => (i === k ? { ...y, titre: x.target.value } : y)))}
                      placeholder="Titre — ex. : Foyer de PPR maîtrisé à Santchou"
                      className="min-h-[40px] flex-1 rounded border border-gray-300 px-2 text-sm font-semibold"
                    />
                    <button
                      type="button"
                      onClick={() => changerEvenements(evenements.filter((_, i) => i !== k))}
                      className="rounded border border-gray-300 px-3 text-sm text-gray-600 hover:bg-gray-50"
                      aria-label="Retirer cet événement"
                    >
                      Retirer
                    </button>
                  </div>
                  <textarea
                    value={e.texte}
                    onChange={(x) => changerEvenements(evenements.map((y, i) => (i === k ? { ...y, texte: x.target.value } : y)))}
                    rows={2}
                    placeholder="Ce qui s'est passé, ce qui a été fait, ce qui reste à faire."
                    className="mt-2 w-full rounded border border-gray-300 p-2 text-sm"
                  />
                </div>
              ))}
            </div>
            {evenements.length < 6 && (
              <button
                type="button"
                onClick={() => changerEvenements([...evenements, { titre: "", texte: "" }])}
                className="mt-2 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                + Ajouter un événement
              </button>
            )}
          </section>

          {/* Les remarques du Délégué */}
          <label data-visite="remarques-note" className="block">
            <span className="text-sm font-semibold uppercase tracking-wide text-gray-500">Mes remarques (facultatif)</span>
            <textarea
              value={remarques}
              onChange={(e) => setRemarques(e.target.value)}
              rows={3}
              placeholder="Ex. : campagne de vaccination contre la PPR prévue en novembre ; tension sur le prix du maïs."
              className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm"
            />
          </label>

          {/* Télécharger */}
          <div data-visite="telecharger-note" className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => void telecharger("pptx")}
              disabled={telechargement != null}
              className="min-h-[48px] rounded-md bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {telechargement === "pptx" ? "Production…" : "Télécharger la présentation PowerPoint"}
            </button>
            <button
              type="button"
              onClick={() => void telecharger("docx")}
              disabled={telechargement != null}
              className="min-h-[48px] rounded-md border border-primary px-5 py-2 text-sm font-semibold text-primary hover:bg-primary-light disabled:opacity-50"
            >
              {telechargement === "docx" ? "Production…" : "Word"}
            </button>
            <button
              type="button"
              onClick={() => void telecharger("pdf")}
              disabled={telechargement != null}
              className="min-h-[48px] rounded-md border border-primary px-5 py-2 text-sm font-semibold text-primary hover:bg-primary-light disabled:opacity-50"
            >
              {telechargement === "pdf" ? "Production…" : "PDF"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
