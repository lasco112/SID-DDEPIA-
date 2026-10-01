"use client";

/**
 * Relecture et validation des analyses du rapport trimestriel.
 *
 * Le texte est CALCULÉ par le SID à partir des chiffres de chaque tableau :
 * on ne l'écrit pas, on le relit. Un clic le valide et passe au tableau
 * suivant. On peut aussi le corriger, ou lui ajouter une explication — la
 * cause d'une hausse ou d'une baisse, que les chiffres ne disent pas.
 *
 * Même présentation que la saisie trimestrielle (demande du Délégué) : la
 * liste d'abord, puis un tableau à la fois, avec « précédent » et « suivant ».
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { trimestreARapporter } from "@/lib/trimestreEchu";
import { lireAvecCopie, envoyer as envoyerOuGarder, enAttente } from "@/lib/trimestreHorsLigne";
import HorsLigneTrimestre from "@/components/HorsLigneTrimestre";
import VisiteGuidee from "@/components/VisiteGuidee";

type Statut = "vide" | "a_valider" | "valide" | "a_revoir";

interface Phrase {
  texte: string;
  calcul: string;
}

interface Analyse {
  numero: number;
  titre: string;
  section: string;
  statut: Statut;
  propose: string;
  phrases: Phrase[];
  texteValide: string | null;
  explication: string | null;
  validePar: string | null;
  valideLe: string | null;
  auRapport: string | null;
  sansComparaison: boolean;
  /** Le chiffre de l'an passé qui manque à la comparaison, case par case. */
  anPasse?: CaseAnPasse[];
  /** Validée ou retirée hors ligne : gardée sur le téléphone, pas encore envoyée. */
  surLeTelephone?: boolean;
}

interface CaseAnPasse {
  ligne: string;
  colonne: string;
  territoire: string;
  saisissable: boolean;
}

interface Ecran {
  portee: string;
  analyses: Analyse[];
}

/**
 * « Je n'ai pas ce chiffre » : retenu sur l'appareil, par compte, trimestre et
 * tableau. Rien n'est écrit au serveur — l'analyse dit déjà que la
 * comparaison n'est pas possible ; on cesse seulement de le réclamer.
 */
const cleSansAnPasse = (username: string, annee: number, trimestre: number, numero: number) =>
  `sid-anpasse-absent|${username}|${annee}-${trimestre}|${numero}`;
function lireSansAnPasse(cle: string): boolean {
  try {
    return localStorage.getItem(cle) === "1";
  } catch {
    return false;
  }
}
function ecrireSansAnPasse(cle: string, absent: boolean) {
  try {
    if (absent) localStorage.setItem(cle, "1");
    else localStorage.removeItem(cle);
  } catch {
    // stockage indisponible : la case sera simplement redemandée
  }
}

const LIBELLE: Record<Statut, { texte: string; classe: string }> = {
  a_valider: { texte: "À valider", classe: "bg-amber-100 text-amber-900" },
  valide: { texte: "Validée", classe: "bg-green-100 text-green-800" },
  a_revoir: { texte: "Chiffres modifiés : à revoir", classe: "bg-red-100 text-red-800" },
  vide: { texte: "Tableau vide", classe: "bg-gray-100 text-gray-600" },
};

export default function AnalysesTrimestreClient({
  titre,
  presentation,
  username,
}: {
  /** Le nom de l'étape pour ce rôle, tel que le menu l'écrit. */
  titre: string;
  presentation: string;
  username: string;
}) {
  const [{ annee, trimestre }, setPeriode] = useState(() => trimestreARapporter());
  const [ecran, setEcran] = useState<Ecran | null>(null);
  const [ouvert, setOuvert] = useState<number | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [correction, setCorrection] = useState<string | null>(null);
  const [explication, setExplication] = useState("");
  const [voirCalcul, setVoirCalcul] = useState(false);
  const [copieDu, setCopieDu] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  /** Les chiffres de l'an passé en cours de frappe, par case. */
  const [anPasseSaisi, setAnPasseSaisi] = useState<Record<string, string>>({});
  /** Tableaux pour lesquels la personne a dit ne pas avoir le chiffre de l'an passé. */
  const [sansAnPasse, setSansAnPasse] = useState<Record<number, boolean>>({});

  const charger = useCallback(async () => {
    setErreur(null);
    let e: Ecran;
    try {
      const lu = await lireAvecCopie<Ecran>(username, `/api/trimestre/analyses?annee=${annee}&trimestre=${trimestre}`);
      e = { ...lu.donnees, analyses: lu.donnees.analyses.map((a) => ({ ...a })) };
      setCopieDu(lu.copieDu);
    } catch (x) {
      setErreur(x instanceof Error ? x.message : "Chargement impossible.");
      return;
    }
    // Ce qui a été validé ou retiré hors ligne, et attend le réseau.
    for (const op of await enAttente(username)) {
      const c = op.corps as { annee?: number; trimestre?: number; numeroTableau?: number; texte?: string; explication?: string | null };
      if (op.refusee || !op.cle.startsWith("analyse|") || c.annee !== annee || c.trimestre !== trimestre) continue;
      const a = e.analyses.find((x) => x.numero === c.numeroTableau);
      if (!a) continue;
      a.surLeTelephone = true;
      if (op.methode === "DELETE") {
        a.statut = "a_valider";
        a.texteValide = null;
      } else {
        a.statut = "valide";
        a.texteValide = c.texte ?? a.propose;
        a.explication = c.explication ?? null;
      }
    }
    setEcran(e);
    setSansAnPasse(
      Object.fromEntries(e.analyses.map((a) => [a.numero, lireSansAnPasse(cleSansAnPasse(username, annee, trimestre, a.numero))]))
    );
  }, [annee, trimestre, username]);

  /** Le chiffre de l'an passé reste à saisir pour ce tableau, par cette personne. */
  const anPasseAFaire = (a: Analyse) => !sansAnPasse[a.numero] && (a.anPasse ?? []).some((c) => c.saisissable);

  /** Enregistre le total de l'an passé d'un arrondissement : la case « TOTAL {P-1} » de la saisie. */
  async function enregistrerAnPasse(a: Analyse, c: CaseAnPasse) {
    const k = `${c.ligne}|${c.colonne}`;
    const brut = (anPasseSaisi[k] ?? "").trim();
    if (!brut) return;
    setOccupe(true);
    setErreur(null);
    setInfo(null);
    try {
      const resultat = await envoyerOuGarder(username, {
        cle: `saisie|${annee}|${trimestre}|${a.numero}|${c.ligne}|${c.colonne}`,
        methode: "PUT",
        url: "/api/trimestre/saisie",
        corps: { annee, trimestre, numeroTableau: a.numero, ligne: c.ligne, colonne: c.colonne, valeur: brut },
        libelle: `${a.titre} — ${c.territoire}, ${c.colonne}`,
      });
      if (resultat.statut === "refuse") {
        setErreur(resultat.message);
        return;
      }
      setAnPasseSaisi((x) => ({ ...x, [k]: "" }));
      setInfo(
        resultat.statut === "en_file"
          ? "Pas de réseau : le chiffre est gardé sur ce téléphone et partira seul. L'analyse sera recalculée à ce moment-là."
          : "Chiffre enregistré : l'analyse a été recalculée avec la comparaison sur un an. Relisez-la, puis validez."
      );
      await charger();
    } catch {
      setErreur("Enregistrement impossible sur ce téléphone.");
    } finally {
      setOccupe(false);
    }
  }

  function basculerSansAnPasse(numero: number, absent: boolean) {
    ecrireSansAnPasse(cleSansAnPasse(username, annee, trimestre, numero), absent);
    setSansAnPasse((x) => ({ ...x, [numero]: absent }));
  }

  useEffect(() => {
    setOuvert(null);
    void charger();
  }, [charger]);

  // `?tableau=16` : l'analyse ouverte d'emblée — « À corriger » y emmène.
  const tableauDemande = useRef<number | null>(
    typeof window === "undefined" ? null : Number(new URLSearchParams(window.location.search).get("tableau")) || null
  );
  useEffect(() => {
    const n = tableauDemande.current;
    if (n == null || !ecran?.analyses.some((a) => a.numero === n)) return;
    tableauDemande.current = null;
    setOuvert(n);
  }, [ecran]);

  const courant = ecran?.analyses.find((a) => a.numero === ouvert) ?? null;

  // À l'ouverture d'un tableau : l'explication déjà donnée, pas de correction en cours.
  useEffect(() => {
    setCorrection(null);
    setVoirCalcul(false);
    setExplication(courant?.explication ?? "");
    if (courant) window.scrollTo({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert]);

  const suivant = (numero: number) => {
    const liste = ecran?.analyses ?? [];
    const i = liste.findIndex((a) => a.numero === numero);
    return liste.slice(i + 1).find((a) => a.statut !== "vide")?.numero ?? null;
  };

  async function envoyer(methode: "PUT" | "DELETE", corps: Record<string, unknown>, ensuite: number | null) {
    if (!courant) return;
    setOccupe(true);
    setErreur(null);
    try {
      setInfo(null);
      const resultat = await envoyerOuGarder(username, {
        cle: `analyse|${annee}|${trimestre}|${courant.numero}`,
        methode,
        url: "/api/trimestre/analyses",
        corps: { annee, trimestre, numeroTableau: courant.numero, ...corps },
        libelle: `Analyse — ${courant.titre}`,
      });
      if (resultat.statut === "refuse") {
        setErreur(resultat.message);
        return;
      }
      if (resultat.statut === "en_file") setInfo("Pas de réseau : gardé sur ce téléphone, envoyé seul au retour du réseau.");
      if (resultat.statut === "ignore") setInfo("Une validation plus récente existe sur le serveur : elle est conservée.");
      await charger();
      setOuvert(ensuite);
    } catch {
      setErreur("Enregistrement impossible sur ce téléphone.");
    } finally {
      setOccupe(false);
    }
  }

  if (erreur && !ecran) return <p className="rounded-md bg-red-50 p-4 text-sm text-red-800">{erreur}</p>;
  if (!ecran) return <p className="text-gray-600">Chargement…</p>;

  const aTraiter = ecran.analyses.filter((a) => a.statut === "a_valider" || a.statut === "a_revoir").length;
  const validees = ecran.analyses.filter((a) => a.statut === "valide").length;

  // ------------------------------------------------------------ un tableau
  if (courant) {
    const liste = ecran.analyses;
    const i = liste.findIndex((a) => a.numero === courant.numero);
    const precedent = liste[i - 1]?.numero ?? null;
    const apres = liste[i + 1]?.numero ?? null;
    const texteActuel = courant.statut === "valide" ? courant.texteValide ?? courant.propose : courant.propose;
    return (
      <div className="max-w-3xl">
        <button
          type="button"
          onClick={() => setOuvert(null)}
          className="mb-3 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          ← Tous les tableaux
        </button>
        <VisiteGuidee ecran="analyses-detail" />
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{courant.section}</p>
        <h1 className="mt-1 text-xl font-bold text-primary-dark">{courant.titre}</h1>
        <p className="mt-2">
          <span className={`rounded px-2 py-0.5 text-xs font-semibold ${LIBELLE[courant.statut].classe}`}>
            {LIBELLE[courant.statut].texte}
          </span>
          {courant.validePar && courant.valideLe && (
            <span className="ml-2 text-xs text-gray-500">
              par {courant.validePar}, le {new Date(courant.valideLe).toLocaleDateString("fr-FR")}
            </span>
          )}
        </p>

        {erreur && <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800">{erreur}</p>}
        {info && <p className="mt-3 rounded-md bg-blue-50 p-3 text-sm text-blue-900">{info}</p>}
        {courant.surLeTelephone && (
          <p className="mt-3 rounded-md bg-blue-50 p-3 text-sm text-blue-900">Gardé sur ce téléphone, en attente du réseau.</p>
        )}
        <div className="mt-3">
          <HorsLigneTrimestre username={username} copieDu={copieDu} onEnvoye={() => void charger()} />
        </div>

        {courant.statut === "vide" ? (
          <p className="mt-4 rounded-md border border-gray-200 bg-white p-4 text-sm text-gray-700">
            Ce tableau n&apos;a aucune donnée pour cette période : il n&apos;y a rien à analyser. Remplissez-le d&apos;abord
            (rapports mensuels ou saisie trimestrielle).
          </p>
        ) : (
          <div className="mt-4 space-y-4 rounded-md border border-gray-200 bg-white p-4">
            {courant.statut === "a_revoir" && (
              <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">
                Les chiffres du tableau ont changé depuis la validation : le texte ci-dessous a été recalculé. Relisez-le
                et validez-le à nouveau.
              </p>
            )}

            <div>
              <p className="text-sm font-semibold text-gray-700">Texte qui figurera sous le tableau</p>
              {correction == null ? (
                <p data-visite="texte-analyse" className="mt-1 whitespace-pre-line rounded-md bg-gray-50 p-3 text-gray-900">{texteActuel}</p>
              ) : (
                <textarea
                  value={correction}
                  onChange={(e) => setCorrection(e.target.value)}
                  rows={6}
                  className="mt-1 w-full rounded-md border border-gray-300 p-2 text-gray-900"
                />
              )}
              <button
                type="button"
                data-visite="voir-calcul"
                onClick={() => setVoirCalcul((v) => !v)}
                className="mt-1 text-sm text-primary underline"
              >
                {voirCalcul ? "Masquer le calcul" : "Voir le calcul"}
              </button>
              {voirCalcul && (
                <ul className="mt-2 space-y-2 text-sm text-gray-700">
                  {courant.phrases.map((p, k) => (
                    <li key={k} className="rounded border border-gray-100 p-2">
                      <span className="block">{p.texte}</span>
                      <span className="block text-xs text-gray-500">Calcul : {p.calcul}</span>
                    </li>
                  ))}
                </ul>
              )}
              {courant.sansComparaison && (
                <AnPasse
                  analyse={courant}
                  periodeN1={`T${trimestre} ${annee - 1}`}
                  absent={Boolean(sansAnPasse[courant.numero])}
                  saisi={anPasseSaisi}
                  occupe={occupe}
                  onSaisir={(k, v) => setAnPasseSaisi((x) => ({ ...x, [k]: v }))}
                  onEnregistrer={(c) => void enregistrerAnPasse(courant, c)}
                  onAbsent={(absent) => basculerSansAnPasse(courant.numero, absent)}
                  suivantSansAnPasse={
                    ecran.analyses.slice(i + 1).find((a) => a.numero !== courant.numero && anPasseAFaire(a))?.numero ?? null
                  }
                  onSuivant={(n) => setOuvert(n)}
                />
              )}
            </div>

            <label data-visite="explication" className="block">
              <span className="text-sm font-semibold text-gray-700">Explication (facultatif)</span>
              <span className="block text-xs text-gray-500">
                La cause d&apos;une hausse ou d&apos;une baisse, que les chiffres ne disent pas. Elle s&apos;ajoute à la fin du texte.
              </span>
              <input
                type="text"
                value={explication}
                onChange={(e) => setExplication(e.target.value)}
                placeholder="Ex. : fermeture du marché à bétail en août."
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2"
              />
            </label>

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                disabled={occupe}
                onClick={() =>
                  void envoyer("PUT", { texte: correction ?? texteActuel, explication }, suivant(courant.numero))
                }
                data-visite="valider-analyse"
                className="rounded-md bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
              >
                {occupe ? "Enregistrement…" : "Valider et passer au suivant"}
              </button>
              {correction == null ? (
                <button
                  type="button"
                  data-visite="corriger-texte"
                  onClick={() => setCorrection(texteActuel)}
                  className="rounded-md border border-gray-300 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Corriger le texte
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setCorrection(null)}
                  className="rounded-md border border-gray-300 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Annuler la correction
                </button>
              )}
              {(courant.statut === "valide" || courant.statut === "a_revoir") && (
                <button
                  type="button"
                  disabled={occupe}
                  onClick={() => void envoyer("DELETE", {}, courant.numero)}
                  className="rounded-md border border-gray-300 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Revenir au texte calculé
                </button>
              )}
            </div>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={precedent == null || occupe}
            onClick={() => setOuvert(precedent)}
            className="flex-1 rounded-md border border-gray-300 px-3 py-3 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            ← Tableau précédent
          </button>
          <button
            type="button"
            disabled={apres == null || occupe}
            onClick={() => setOuvert(apres)}
            className="flex-1 rounded-md border border-gray-300 px-3 py-3 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            Tableau suivant →
          </button>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------ la liste
  const sansChiffreAnPasse = ecran.analyses.filter(anPasseAFaire);
  const sections: { titre: string; analyses: Analyse[] }[] = [];
  for (const a of ecran.analyses) {
    const s = sections.find((x) => x.titre === a.section);
    if (s) s.analyses.push(a);
    else sections.push({ titre: a.section, analyses: [a] });
  }
  const premier = ecran.analyses.find((a) => a.statut === "a_valider" || a.statut === "a_revoir");

  return (
    <div className="max-w-3xl">
      <HorsLigneTrimestre username={username} copieDu={copieDu} onEnvoye={() => void charger()} />
      {info && <p className="mb-3 rounded-md bg-blue-50 p-3 text-sm text-blue-900">{info}</p>}
      <VisiteGuidee ecran="analyses-liste" />
      <h1 className="text-2xl font-bold text-primary-dark">{titre}</h1>
      <p className="mt-1 text-gray-600">
        {presentation} Rapport de {ecran.portee}.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="text-sm text-gray-700">
          Année{" "}
          <input
            type="number"
            value={annee}
            onChange={(e) => setPeriode((p) => ({ ...p, annee: Number(e.target.value) }))}
            className="w-24 rounded border border-gray-300 px-2 py-1"
          />
        </label>
        <label className="text-sm text-gray-700">
          Trimestre{" "}
          <select
            value={trimestre}
            onChange={(e) => setPeriode((p) => ({ ...p, trimestre: Number(e.target.value) }))}
            className="rounded border border-gray-300 px-2 py-1"
          >
            {[1, 2, 3, 4].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="mt-4 text-sm text-gray-700">
        <strong>{validees}</strong> analyse(s) validée(s), <strong>{aTraiter}</strong> à relire.
      </p>
      {premier && (
        <button
          type="button"
          data-visite="commencer-relecture"
          onClick={() => setOuvert(premier.numero)}
          className="mt-2 w-full rounded-md bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark sm:w-auto"
        >
          Commencer la relecture
        </button>
      )}

      {/* Le chiffre de l'an passé : sans lui, pas de comparaison sur un an. */}
      {sansChiffreAnPasse.length > 0 && (
        <div data-visite="anpasse-compteur" className="mt-4 rounded-md border-2 border-red-300 bg-red-50 p-3">
          <p className="text-sm font-semibold text-red-900">
            {sansChiffreAnPasse.length} tableau{sansChiffreAnPasse.length > 1 ? "x" : ""} sans le chiffre de l&apos;an passé (
            T{trimestre} {annee - 1})
          </p>
          <p className="mt-1 text-sm text-red-900">
            Le SID n&apos;a pas encore les chiffres de l&apos;année dernière : c&apos;est à vous de les donner, une fois, à partir
            de vos rapports de l&apos;époque. Sans eux, l&apos;analyse ne peut pas dire si l&apos;activité a augmenté ou baissé.
          </p>
          <button
            type="button"
            onClick={() => setOuvert(sansChiffreAnPasse[0].numero)}
            className="mt-2 min-h-[44px] w-full rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 sm:w-auto"
          >
            Les saisir un par un →
          </button>
        </div>
      )}

      {sections.map((s) => (
        <section key={s.titre} className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{s.titre}</h2>
          <ul className="mt-2 divide-y divide-gray-100 rounded-md border border-gray-200 bg-white">
            {s.analyses.map((a) => (
              <li key={a.numero}>
                <button
                  type="button"
                  data-visite="analyse-item"
                  onClick={() => setOuvert(a.numero)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-gray-50"
                >
                  <span className="text-sm text-gray-900">{a.titre}</span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${LIBELLE[a.statut].classe}`}>
                      {LIBELLE[a.statut].texte}
                    </span>
                    {anPasseAFaire(a) && (
                      <span className="rounded bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800">an passé à saisir</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * Le chiffre de l'an passé, saisi SUR PLACE sous l'analyse (décision du
 * Délégué : la mention est capitale, car la personne doit donner la donnée de
 * l'an passé, qui n'est pas encore dans le système). Il s'enregistre dans la
 * case « TOTAL » de l'an passé de la saisie trimestrielle, comme à l'étape 1 ;
 * l'analyse se recalcule aussitôt.
 */
function AnPasse({
  analyse,
  periodeN1,
  absent,
  saisi,
  occupe,
  onSaisir,
  onEnregistrer,
  onAbsent,
  suivantSansAnPasse,
  onSuivant,
}: {
  analyse: Analyse;
  periodeN1: string;
  absent: boolean;
  saisi: Record<string, string>;
  occupe: boolean;
  onSaisir: (cle: string, valeur: string) => void;
  onEnregistrer: (c: CaseAnPasse) => void;
  onAbsent: (absent: boolean) => void;
  suivantSansAnPasse: number | null;
  onSuivant: (numero: number) => void;
}) {
  const cases = analyse.anPasse ?? [];
  const aSaisir = cases.filter((c) => c.saisissable);
  const autres = cases.filter((c) => !c.saisissable);

  // Aucune case à remplir : ne rien réclamer qu'on ne puisse pas faire.
  if (cases.length === 0) {
    return (
      <p className="mt-2 rounded-md bg-gray-50 p-3 text-sm text-gray-700">
        Pas de comparaison avec le {periodeN1} pour ce tableau : le SID n&apos;a pas encore ces chiffres, et ce tableau ne
        prévoit pas de case pour les saisir. Rien à faire de votre part — la comparaison viendra d&apos;elle-même quand les
        données de l&apos;an passé seront dans le système.
      </p>
    );
  }

  if (absent) {
    return (
      <p className="mt-2 rounded-md bg-gray-50 p-3 text-sm text-gray-700">
        Vous avez indiqué ne pas avoir le chiffre de l&apos;an passé : l&apos;analyse dit que la comparaison n&apos;est pas possible.{" "}
        <button type="button" onClick={() => onAbsent(false)} className="font-semibold text-primary underline">
          Je l&apos;ai finalement
        </button>
      </p>
    );
  }

  return (
    <div data-visite="anpasse-case" className="mt-3 rounded-md border-2 border-red-300 bg-red-50 p-3">
      <p className="text-sm font-semibold text-red-900">Il manque le chiffre de l&apos;an passé ({periodeN1})</p>
      <p className="mt-1 text-sm text-red-900">
        Le SID n&apos;a pas encore les chiffres de l&apos;année dernière dans sa base. Sans eux, l&apos;analyse ne peut pas dire si
        l&apos;activité a augmenté ou baissé sur un an.
      </p>

      {aSaisir.length > 0 && (
        <>
          <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-sm text-gray-800">
            <li>Retrouvez votre rapport du {periodeN1} (papier ou fichier).</li>
            <li>Relevez le TOTAL de ce tableau pour l&apos;arrondissement indiqué.</li>
            <li>Tapez-le ci-dessous, puis « Enregistrer » : l&apos;analyse est recalculée aussitôt.</li>
          </ol>
          <div className="mt-3 space-y-2">
            {aSaisir.map((c) => {
              const k = `${c.ligne}|${c.colonne}`;
              return (
                <div key={k} className="flex flex-wrap items-end gap-2">
                  <label className="flex-1 text-sm text-gray-800">
                    <span className="block font-medium">
                      Total de {c.territoire} au {periodeN1}
                    </span>
                    <input
                      inputMode="decimal"
                      value={saisi[k] ?? ""}
                      onChange={(e) => onSaisir(k, e.target.value)}
                      placeholder="ex. 1250"
                      className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-base"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={occupe || !(saisi[k] ?? "").trim()}
                    onClick={() => onEnregistrer(c)}
                    className="min-h-[44px] rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
                  >
                    {occupe ? "Enregistrement…" : "Enregistrer"}
                  </button>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => onAbsent(true)}
            className="mt-3 text-sm font-semibold text-gray-700 underline"
          >
            Je n&apos;ai pas ce chiffre
          </button>
        </>
      )}

      {autres.length > 0 && (
        <p className="mt-2 text-sm text-gray-800">
          Le chiffre manque pour : <strong>{autres.map((c) => c.territoire).join(", ")}</strong>. C&apos;est{" "}
          {autres.length > 1 ? "aux arrondissements concernés" : "à l'arrondissement concerné"} de le saisir (étape « Compléter les
          tableaux du trimestre », case « TOTAL {periodeN1} »).
        </p>
      )}

      {suivantSansAnPasse != null && (
        <button
          type="button"
          onClick={() => onSuivant(suivantSansAnPasse)}
          className="mt-3 block text-sm font-semibold text-red-800 underline"
        >
          Tableau suivant sans chiffre de l&apos;an passé →
        </button>
      )}
    </div>
  );
}
