"use client";

/**
 * Saisie trimestrielle des tableaux du canevas (décision D9 du Délégué).
 *
 * La grille n'est pas décrite ici : elle vient du canevas, servie par
 * `/api/trimestre/saisie`, avec l'état de chaque case pour la personne
 * connectée. L'écran et le document imprimé ne peuvent donc pas diverger.
 *
 *  - case blanche : à saisir ;
 *  - case grise : calculée — à partir des rapports mensuels, ou total ;
 *  - case sans cadre : d'un autre ressort, en lecture.
 *
 * Chaque case s'enregistre en la quittant, une par une : un tableau se remplit
 * souvent en plusieurs fois, et perdre une demi-heure de saisie parce qu'on a
 * fermé l'onglet serait inacceptable. Après chaque enregistrement, la grille
 * est relue : les totaux se recalculent sous les yeux.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { trimestreARapporter } from "@/lib/trimestreEchu";
import { lireAvecCopie, garderCopie, envoyer, enAttente } from "@/lib/trimestreHorsLigne";
import HorsLigneTrimestre from "@/components/HorsLigneTrimestre";

type EtatCase = "saisie" | "calculee" | "total" | "lecture";

interface CaseGrille {
  colonne: string;
  etat: EtatCase;
  affiche: string | null;
  saisi: string | null;
  /** La case attend du texte ; sinon, un nombre. */
  texte: boolean;
  /** Valeur reprise d'un autre tableau, proposée tant que rien n'est saisi. */
  propose: string | null;
}

interface Grille {
  numero: number;
  titre: string;
  section: string;
  enteteLigne: string;
  lignes: { cle: string; libelle: string; cases: CaseGrille[] }[];
  avertissements: string[];
  aide: string;
}

interface ResumeTableau {
  numero: number;
  titre: string;
  section: string;
  saisissables: number;
  renseignees: number;
  automatique: boolean;
}

interface LigneNonClassee {
  tableau: string;
  arrondissement: string;
  ligne: string;
  quantite: number | null;
}

interface Liste {
  periode: string;
  arrondissement: string | null;
  tableaux: ResumeTableau[];
  nonClassees: LigneNonClassee[];
}

const cleCase = (ligne: string, colonne: string) => `${ligne} | ${colonne}`;

export default function SaisieTrimestrielleClient({
  username,
  titre = "Saisie trimestrielle",
  presentation,
  seulement,
}: {
  /** Le compte : la copie des écrans et la file hors ligne lui sont propres. */
  username: string;
  titre?: string;
  presentation?: string;
  /** Limite l'écran à certains tableaux — ceux du BAC, pour le chef BAC. */
  seulement?: number[];
}) {
  const [{ annee, trimestre }, setPeriode] = useState(() => trimestreARapporter());
  const [liste, setListe] = useState<Liste | null>(null);
  const [grille, setGrille] = useState<Grille | null>(null);
  const [ouvert, setOuvert] = useState<number | null>(null);
  const [valeurs, setValeurs] = useState<Record<string, string>>({});
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [chargementGrille, setChargementGrille] = useState(false);
  const [voirNonClassees, setVoirNonClassees] = useState(false);
  /** Le refus d'une saisie, affiché AU-DESSUS DU TABLEAU, là où l'on saisit. */
  const [refus, setRefus] = useState<string | null>(null);
  /** Ce qui s'est passé à l'enregistrement, quand ce n'est pas une erreur : gardé hors ligne, dépassé… */
  const [info, setInfo] = useState<string | null>(null);
  /** L'écran montre la copie du téléphone (pas de réseau) : de quand elle date. */
  const [copieDu, setCopieDu] = useState<string | null>(null);
  /** Les grilles ne sont gardées pour le hors-ligne qu'une fois par période et par ouverture. */
  const grillesGardees = useRef<string | null>(null);
  /**
   * Les cases tapées et pas encore enregistrées. Le rechargement du tableau,
   * après chaque enregistrement, ne doit pas les écraser : un agent rapide
   * tape déjà dans la case suivante pendant que la précédente s'enregistre.
   */
  const enCoursDeFrappe = useRef(new Set<string>());

  const urlGrille = useCallback(
    (numero: number) => `/api/trimestre/saisie?annee=${annee}&trimestre=${trimestre}&tableau=${numero}`,
    [annee, trimestre]
  );

  const chargerListe = useCallback(async () => {
    setErreur(null);
    let j: Liste;
    try {
      const lu = await lireAvecCopie<Liste>(username, `/api/trimestre/saisie?annee=${annee}&trimestre=${trimestre}`);
      j = { ...lu.donnees };
      setCopieDu(lu.copieDu);
      // En ligne : toutes les grilles sont gardées sur le téléphone, d'un coup,
      // pour que l'agent puisse ensuite saisir n'importe quel tableau sans réseau.
      const periode = `${annee}-${trimestre}`;
      if (!lu.copieDu && grillesGardees.current !== periode) {
        grillesGardees.current = periode;
        void fetch(`/api/trimestre/saisie?annee=${annee}&trimestre=${trimestre}&toutes=1`)
          .then((r) => (r.ok ? r.json() : null))
          .then(async (d: { periode: string; grilles: Grille[] } | null) => {
            for (const g of d?.grilles ?? []) await garderCopie(username, urlGrille(g.numero), { periode: d!.periode, grille: g });
          })
          .catch(() => {
            grillesGardees.current = null;
          });
      }
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Chargement impossible.");
      return;
    }
    if (seulement) j.tableaux = j.tableaux.filter((t) => seulement.includes(t.numero));
    setListe(j);
  }, [annee, trimestre, seulement, username, urlGrille]);

  const chargerGrille = useCallback(
    async (numero: number) => {
      setChargementGrille(true);
      try {
        let g: Grille;
        try {
          const lu = await lireAvecCopie<{ grille: Grille }>(username, urlGrille(numero));
          g = lu.donnees.grille;
          if (lu.copieDu) setCopieDu(lu.copieDu);
        } catch (e) {
          setErreur(e instanceof Error ? e.message : "Chargement impossible.");
          return;
        }
        const v: Record<string, string> = {};
        for (const l of g.lignes) for (const c of l.cases) if (c.etat === "saisie") v[cleCase(l.cle, c.colonne)] = c.saisi ?? "";
        // Ce qui a été saisi hors ligne et attend le réseau : c'est ce que
        // l'agent a tapé en dernier, c'est donc ce qu'il doit revoir.
        for (const op of await enAttente(username)) {
          const c = op.corps as { annee?: number; trimestre?: number; numeroTableau?: number; ligne?: string; colonne?: string; valeur?: unknown };
          if (op.refusee || !op.cle.startsWith("saisie|") || c.numeroTableau !== numero || c.annee !== annee || c.trimestre !== trimestre) continue;
          v[cleCase(c.ligne!, c.colonne!)] = c.valeur == null ? "" : String(c.valeur);
        }
        setGrille(g);
        // Ce qui est enregistré vient du serveur — y compris ce qu'un collègue
        // vient de saisir ; ce qu'on est en train de taper reste à l'écran.
        setValeurs((avant) => {
          const fusion = { ...v };
          enCoursDeFrappe.current.forEach((k) => {
            if (k in avant) fusion[k] = avant[k];
          });
          return fusion;
        });
      } finally {
        setChargementGrille(false);
      }
    },
    [annee, trimestre, username, urlGrille]
  );

  useEffect(() => {
    setGrille(null);
    setOuvert(null);
    void chargerListe();
  }, [chargerListe]);

  function ouvrir(numero: number, forcer = false) {
    setRefus(null);
    enCoursDeFrappe.current.clear();
    if (forcer && ouvert !== numero) {
      setOuvert(numero);
      setGrille(null);
      void chargerGrille(numero);
      return;
    }
    if (ouvert === numero) {
      setOuvert(null);
      setGrille(null);
      return;
    }
    setOuvert(numero);
    setGrille(null);
    void chargerGrille(numero);
  }

  async function enregistrer(ligne: string, colonne: string, avant: string | null) {
    if (!grille) return;
    const k = cleCase(ligne, colonne);
    const valeur = valeurs[k] ?? "";
    // La case quitte la frappe : c'est désormais le serveur qui fait foi.
    enCoursDeFrappe.current.delete(k);
    // Rien n'a changé : pas d'aller-retour inutile, précieux sur une connexion lente.
    if ((avant ?? "") === valeur.trim()) return;
    setEnCours(k);
    setErreur(null);
    setRefus(null);
    // Refusée, la case reprend sa valeur enregistrée : un chiffre resté à
    // l'écran laisserait croire qu'il est enregistré.
    const annuler = (message: string) => {
      setRefus(message);
      setValeurs((x) => ({ ...x, [k]: avant ?? "" }));
    };
    setInfo(null);
    try {
      const resultat = await envoyer(username, {
        cle: `saisie|${annee}|${trimestre}|${grille.numero}|${ligne}|${colonne}`,
        methode: "PUT",
        url: "/api/trimestre/saisie",
        corps: { annee, trimestre, numeroTableau: grille.numero, ligne, colonne, valeur },
        libelle: `${grille.titre} — ${ligne} / ${colonne} : ${valeur || "(effacé)"}`,
      });
      if (resultat.statut === "refuse") {
        annuler(resultat.message);
        return;
      }
      if (resultat.statut === "en_file") {
        // Gardée sur le téléphone : la valeur reste à l'écran, elle partira seule.
        setInfo("Pas de réseau : la case est gardée sur ce téléphone et partira seule au retour du réseau.");
        return;
      }
      if (resultat.statut === "ignore") {
        setInfo("Une modification plus récente existe sur le serveur : elle est conservée.");
      }
      await Promise.all([chargerGrille(grille.numero), chargerListe()]);
    } catch {
      annuler("Enregistrement impossible sur ce téléphone.");
    } finally {
      setEnCours(null);
    }
  }

  /**
   * Deux écrans, jamais mêlés (demande du Délégué) : la LISTE des tableaux,
   * puis UN tableau seul, avec « précédent » et « suivant » à son pied. Sur un
   * téléphone, voir plusieurs tableaux ouverts à la fois égarait les agents.
   */
  const dernierOuvert = useRef<number | null>(null);
  useEffect(() => {
    if (ouvert != null) {
      dernierOuvert.current = ouvert;
      window.scrollTo({ top: 0 });
    } else if (dernierOuvert.current != null) {
      // De retour à la liste : on la retrouve là où l'on avait quitté.
      document.getElementById(`tableau-${dernierOuvert.current}`)?.scrollIntoView({ block: "center" });
    }
  }, [ouvert]);

  function retourALaListe() {
    setOuvert(null);
    setGrille(null);
    setRefus(null);
    enCoursDeFrappe.current.clear();
  }

  if (erreur && !liste) return <p className="rounded-md bg-red-50 p-4 text-sm text-red-800">{erreur}</p>;
  if (!liste) return <p className="text-gray-600">Chargement…</p>;

  // Regroupement par section du canevas, dans l'ordre.
  const sections: { titre: string; tableaux: ResumeTableau[] }[] = [];
  for (const t of liste.tableaux) {
    const s = sections.find((x) => x.titre === t.section);
    if (s) s.tableaux.push(t);
    else sections.push({ titre: t.section, tableaux: [t] });
  }
  const total = liste.tableaux.reduce((n, t) => n + t.saisissables, 0);
  const faites = liste.tableaux.reduce((n, t) => n + t.renseignees, 0);

  // ------------------------------------------------------------ un tableau seul
  const courant = ouvert == null ? null : liste.tableaux.find((t) => t.numero === ouvert) ?? null;
  if (courant) {
    const rang = liste.tableaux.findIndex((t) => t.numero === courant.numero) + 1;
    return (
      <div className="max-w-full">
        <button
          type="button"
          onClick={retourALaListe}
          className="mb-3 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          ← Tous les tableaux
        </button>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {courant.section} · {liste.periode}
        </p>
        <h1 className="mt-1 text-xl font-bold text-primary-dark">{courant.titre}</h1>
        <p className="mt-1 text-sm text-gray-600">
          Tableau {rang} sur {liste.tableaux.length} ·{" "}
          <span className={courant.renseignees === courant.saisissables ? "text-green-700" : ""}>
            {courant.renseignees}/{courant.saisissables} case(s) renseignée(s)
          </span>
        </p>

        {erreur && <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800">{erreur}</p>}
        {info && <p className="mt-3 rounded-md bg-blue-50 p-3 text-sm text-blue-900">{info}</p>}
        <div className="mt-3">
          <HorsLigneTrimestre
            username={username}
            copieDu={copieDu}
            onEnvoye={() => void Promise.all([chargerListe(), chargerGrille(courant.numero)])}
          />
        </div>

        <div className="mt-4 rounded-md border border-gray-200 bg-white p-3">
          {chargementGrille && !grille && <p className="text-sm text-gray-600">Chargement…</p>}
          {grille && grille.numero === courant.numero && (
            <TableauSaisie
              refus={refus}
              grille={grille}
              valeurs={valeurs}
              enCours={enCours}
              onChange={(k, v) => {
                enCoursDeFrappe.current.add(k);
                setValeurs((x) => ({ ...x, [k]: v }));
              }}
              onQuitter={enregistrer}
            />
          )}
          <Enchainement
            liste={liste.tableaux}
            numero={courant.numero}
            occupe={chargementGrille}
            onAller={(n) => ouvrir(n, true)}
          />
        </div>

        <button
          type="button"
          onClick={retourALaListe}
          className="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 sm:w-auto"
        >
          ← Retour à la liste des tableaux
        </button>
      </div>
    );
  }

  // ------------------------------------------------------------ la liste
  return (
    <div className="max-w-full">
      <HorsLigneTrimestre username={username} copieDu={copieDu} onEnvoye={() => void chargerListe()} />
      <h1 className="text-2xl font-bold text-primary-dark">{titre}</h1>
      <p className="mt-1 max-w-3xl text-gray-600">
        {presentation ??
          (liste.arrondissement
            ? `Ce que les rapports mensuels ne collectent pas, pour l'arrondissement de ${liste.arrondissement}. Vous ne remplissez que sa ligne ; les cases grises se calculent seules.`
            : "Ce que les rapports mensuels ne collectent pas. Les cases grises se calculent seules : à partir du mensuel, ou comme totaux.")}{" "}
        Touchez un tableau pour le remplir ; chaque case s&apos;enregistre dès que vous la quittez.
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
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <span className="text-sm font-medium text-gray-800">{liste.periode}</span>
        <span className="text-sm text-gray-600">
          {faites} case(s) renseignée(s) sur {total}
        </span>
      </div>

      {erreur && <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800">{erreur}</p>}

      {liste.nonClassees.length > 0 && (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
          <button type="button" onClick={() => setVoirNonClassees((v) => !v)} className="font-medium text-amber-900">
            {liste.nonClassees.length} ligne(s) des rapports mensuels ne correspondent à aucune case du canevas
            {voirNonClassees ? " ▲" : " ▼"}
          </button>
          <p className="mt-1 text-amber-900">
            Elles comptent dans les totaux, mais dans aucune colonne. À vous de décider : corriger la saisie
            mensuelle, ou les citer dans le texte du rapport.
          </p>
          {voirNonClassees && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-950">
              {liste.nonClassees.map((l, i) => (
                <li key={i}>
                  {l.arrondissement} · {l.ligne} · {l.quantite ?? "—"} — <span className="italic">{l.tableau}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {sections.length === 0 && (
        <p className="mt-6 text-gray-600">Aucun tableau à saisir pour ce trimestre.</p>
      )}

      <div className="mt-6 space-y-6">
        {sections.map((s) => (
          <div key={s.titre}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">{s.titre}</h2>
            <div className="space-y-2">
              {s.tableaux.map((t) => (
                <button
                  key={t.numero}
                  id={`tableau-${t.numero}`}
                  type="button"
                  onClick={() => ouvrir(t.numero, true)}
                  className="flex w-full items-center justify-between gap-3 rounded-md border border-gray-200 bg-white px-4 py-3 text-left hover:bg-gray-50"
                >
                  <span className="font-medium text-gray-900">
                    {t.titre}
                    {t.automatique && (
                      <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-normal text-gray-600">
                        en partie calculé
                      </span>
                    )}
                  </span>
                  <span
                    className={`shrink-0 text-sm ${t.renseignees === t.saisissables ? "text-green-700" : "text-gray-600"}`}
                  >
                    {t.renseignees}/{t.saisissables}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Au bas de chaque tableau, le suivant est annoncé : on remplit les tableaux
 * l'un après l'autre sans remonter chercher dans la liste. Le précédent aussi,
 * pour revenir corriger.
 */
function Enchainement({
  liste,
  numero,
  occupe,
  onAller,
}: {
  liste: ResumeTableau[];
  numero: number;
  /** Pendant le chargement, les boutons attendent : un double appui sauterait un tableau. */
  occupe: boolean;
  onAller: (numero: number) => void;
}) {
  const i = liste.findIndex((t) => t.numero === numero);
  const precedent = i > 0 ? liste[i - 1] : null;
  const suivant = i >= 0 && i < liste.length - 1 ? liste[i + 1] : null;
  return (
    <div className="mt-4 flex flex-col gap-2 border-t border-gray-200 pt-3 sm:flex-row sm:justify-between">
      {precedent ? (
        <button
          type="button"
          onClick={() => onAller(precedent.numero)}
          disabled={occupe}
          className="rounded-md border disabled:opacity-50 border-gray-300 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
        >
          ← Précédent : {precedent.titre}
        </button>
      ) : (
        <span />
      )}
      {suivant ? (
        <button
          type="button"
          onClick={() => onAller(suivant.numero)}
          disabled={occupe}
          className="rounded-md bg-primary disabled:opacity-50 px-3 py-2 text-left text-sm font-semibold text-white hover:bg-primary-hover"
        >
          Tableau suivant : {suivant.titre} →
          <span className="block text-xs font-normal opacity-90">
            {suivant.renseignees}/{suivant.saisissables} case(s) déjà renseignée(s)
          </span>
        </button>
      ) : (
        <p className="text-sm text-green-700">C&apos;était le dernier tableau à remplir.</p>
      )}
    </div>
  );
}

function TableauSaisie({
  refus,
  grille,
  valeurs,
  enCours,
  onChange,
  onQuitter,
}: {
  refus: string | null;
  grille: Grille;
  valeurs: Record<string, string>;
  enCours: string | null;
  onChange: (cle: string, valeur: string) => void;
  onQuitter: (ligne: string, colonne: string, avant: string | null) => void;
}) {
  const colonnes = grille.lignes[0]?.cases.map((c) => c.colonne) ?? [];
  const lignesSaisies = grille.lignes.filter((l) => l.cases.some((c) => c.etat === "saisie"));
  // Les colonnes où ce profil saisit : une seule pour un DA quand les
  // arrondissements sont en colonnes (personnel, infrastructures…).
  const colonnesSaisies = Array.from(
    new Set(grille.lignes.flatMap((l) => l.cases.filter((c) => c.etat === "saisie").map((c) => c.colonne)))
  );

  const champ = (l: Grille["lignes"][number], c: CaseGrille, large = false) => {
    const k = cleCase(l.cle, c.colonne);
    if (c.etat === "saisie") {
      return (
        <input
          value={valeurs[k] ?? ""}
          // Un nombre : le clavier numérique du téléphone s'ouvre directement.
          inputMode={c.texte ? "text" : "decimal"}
          placeholder={c.propose ?? (c.texte ? "texte" : "")}
          title={c.propose ? "Valeur reprise du tableau du BAC : saisissez-en une autre si elle est fausse." : undefined}
          onChange={(e) => onChange(k, e.target.value)}
          onBlur={() => onQuitter(l.cle, c.colonne, c.saisi)}
          className={`${large ? "w-full" : c.texte ? "w-48" : "w-28"} ${c.propose ? "placeholder:text-gray-500" : "placeholder:text-gray-300"} rounded-sm border border-gray-300 bg-white px-2 py-1 outline-none focus:border-primary focus:bg-amber-50 ${
            enCours === k ? "bg-amber-100" : ""
          }`}
          aria-label={`${l.libelle}, ${c.colonne}`}
        />
      );
    }
    const titre =
      c.etat === "calculee"
        ? "Calculé à partir des rapports mensuels"
        : c.etat === "total"
          ? "Total calculé"
          : "Hors de votre ressort";
    return (
      <span
        title={titre}
        className={`block px-2 py-1 ${c.etat === "lecture" ? "text-gray-700" : "bg-gray-100 text-gray-600"} ${
          c.etat === "total" ? "italic" : ""
        }`}
      >
        {c.affiche ?? "—"}
      </span>
    );
  };

  return (
    <div>
      <p className="mb-3 text-sm text-gray-700">{grille.aide}</p>
      {refus && (
        <p role="alert" className="mb-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-800">
          {refus}
        </p>
      )}
      {grille.avertissements.length > 0 && (
        <ul className="mb-3 list-disc rounded-md bg-amber-50 p-3 pl-7 text-sm text-amber-900">
          {grille.avertissements.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      )}

      {/*
        Une seule ligne à remplir — le cas du DA, qui ne saisit que son
        arrondissement : un formulaire vertical se lit mieux sur un téléphone
        qu'un tableau de dix colonnes.
      */}
      {lignesSaisies.length > 1 && colonnesSaisies.length === 1 ? (
        // Une seule colonne à remplir : chaque ligne du tableau devient une
        // question, et les totaux de la colonne s'affichent en fin de liste.
        <div className="grid max-w-xl gap-2">
          <p className="text-sm font-semibold text-gray-800">{colonnesSaisies[0]}</p>
          {grille.lignes.map((l) => {
            const c = l.cases.find((x) => x.colonne === colonnesSaisies[0]);
            if (!c) return null;
            return (
              <label key={l.cle} className="grid grid-cols-[1fr,8rem] items-center gap-3 text-sm">
                <span className={c.etat === "saisie" ? "text-gray-800" : "font-medium text-gray-600"}>{l.libelle || l.cle}</span>
                {champ(l, c, true)}
              </label>
            );
          })}
        </div>
      ) : lignesSaisies.length === 1 ? (
        <div className="grid max-w-xl gap-2">
          {lignesSaisies[0].cases.map((c) => (
            <label key={c.colonne} className="grid grid-cols-[1fr,10rem] items-center gap-3 text-sm">
              <span className="text-gray-800">{c.colonne}</span>
              {champ(lignesSaisies[0], c, true)}
            </label>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="sticky left-0 z-10 border border-gray-200 bg-gray-50 px-2 py-1 text-left">
                  {grille.enteteLigne}
                </th>
                {colonnes.map((c) => (
                  <th key={c} className="border border-gray-200 px-2 py-1 text-left font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grille.lignes.map((l) => (
                <tr key={l.cle}>
                  <th className="sticky left-0 z-10 border border-gray-200 bg-white px-2 py-1 text-left font-normal text-gray-800">
                    {l.libelle || l.cle}
                  </th>
                  {l.cases.map((c) => (
                    <td key={c.colonne} className="border border-gray-200 p-0">
                      {champ(l, c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-gray-500">
        Cases grises : calculées automatiquement — à partir des rapports mensuels, ou comme totaux. Elles ne se saisissent pas.
        Une valeur pâle dans une case vide est reprise d&apos;un autre tableau : elle compte telle quelle tant que vous ne la changez pas.
      </p>
    </div>
  );
}
