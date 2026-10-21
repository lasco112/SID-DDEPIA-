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
import ComparaisonMensuel, { type ControleCategories } from "@/components/ComparaisonMensuel";
import OrigineMensuelle, { type Origine, type InfoCorrection } from "@/components/OrigineMensuelle";

/**
 * LE BANDEAU DE LA RÉVISION, en tête d'un tableau d'une section technique (21
 * octobre 2026) : le DD y ouvre ou ferme la révision de la section — sans
 * attendre de demande —, accepte ou refuse une demande ; le chef y voit si elle
 * est ouverte et la demande. Rien ne s'ouvre avant le dépôt de tous les DA.
 */
function BandeauOrdre({
  ordre,
  role,
  periode,
  titre,
  onFait,
}: {
  ordre: NonNullable<Grille["ordreSection"]>;
  role: string;
  periode: { annee: number; trimestre: number };
  titre: string;
  onFait: () => void;
}) {
  const [motif, setMotif] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fait, setFait] = useState<string | null>(null);
  const dd = role === "DD";
  const depuis = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });

  async function agir(action: string, texte?: string, apres?: string) {
    setErreur(null);
    setOccupe(true);
    try {
      const r = await fetch("/api/trimestre/circuit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annee: periode.annee, trimestre: periode.trimestre, action, section: ordre.section, motif: texte }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message ?? "Impossible pour le moment.");
      setMotif(null);
      setFait(apres ?? null);
      onFait();
    } catch (e) {
      setErreur(typeof navigator !== "undefined" && !navigator.onLine ? "Il faut du réseau pour cela." : e instanceof Error ? e.message : "Impossible pour le moment.");
    } finally {
      setOccupe(false);
    }
  }

  // Le mot qui accompagne une décision est facultatif : il ne doit jamais bloquer.
  const formulaire = (envoyer: string, action: string, apres: string, couleur = "bg-green-700") => (
    <div className="mt-2 space-y-2">
      <textarea
        rows={2}
        value={motif ?? ""}
        placeholder="Un mot (facultatif)"
        onChange={(e) => setMotif(e.target.value)}
        className="block w-full rounded-input border border-gray-300 bg-white px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={occupe}
          onClick={() => void agir(action, motif ?? "", apres)}
          className={`min-h-[44px] flex-1 rounded-btn px-3 text-sm font-semibold text-white disabled:opacity-50 ${couleur}`}
        >
          {occupe ? "Envoi…" : envoyer}
        </button>
        <button type="button" onClick={() => setMotif(null)} className="min-h-[44px] flex-1 rounded-btn border border-gray-300 bg-white px-3 text-sm">
          Annuler
        </button>
      </div>
    </div>
  );
  const [refus, setRefus] = useState(false);
  const manquants = ordre.depotsManquants ?? [];

  return (
    <div
      data-visite="bandeau-ordre"
      className={`mb-3 rounded-md border p-3 text-sm ${
        ordre.enCours ? "border-green-300 bg-green-50 text-green-950" : manquants.length ? "border-gray-300 bg-gray-50 text-gray-800" : "border-amber-300 bg-amber-50 text-amber-950"
      }`}
    >
      {ordre.enCours ? (
        <>
          <p>
            <b>{dd ? `Révision ouverte au chef ${ordre.section}` : "Révision ouverte : vous corrigez ce tableau"}</b> depuis le {depuis(ordre.enCours.le)} — {ordre.enCours.motif}
          </p>
          {!dd && (
            <p className="mt-1">
              Écrivez directement dans les cases des arrondissements. Une case grise (venue du mensuel) : touchez-la pour corriger son chiffre.
              Une fois fini, validez votre section : la révision se fermera et chaque DA recevra le bilan.
            </p>
          )}
          {dd && (
            <button
              type="button"
              disabled={occupe}
              onClick={() => {
                if (window.confirm(`Fermer la révision du chef ${ordre.section} ? Ses corrections déjà faites restent, et chaque DA reçoit le bilan.`)) {
                  void agir("revoquerOrdre", undefined, "Révision fermée.");
                }
              }}
              className="mt-2 min-h-[40px] rounded-btn border border-gray-600 bg-white px-3 font-semibold text-gray-800"
            >
              Fermer la révision
            </button>
          )}
        </>
      ) : manquants.length ? (
        <p>
          <b>Révision fermée.</b> Elle s&apos;ouvre après le dépôt des rapports de tous les DA — pas encore déposé : {manquants.join(", ")}.
          {!dd && " En attendant, touchez une case pour la signaler à son arrondissement."}
        </p>
      ) : dd ? (
        <>
          <p>
            {ordre.demande ? (
              <>
                <b>Le chef {ordre.section} vous demande d&apos;ouvrir la révision</b> depuis le {depuis(ordre.demande.le)} — {ordre.demande.motif}
              </>
            ) : (
              <>
                <b>Révision fermée pour la section {ordre.section}.</b> Ouvrez-la pour que le chef corrige ce tableau et les autres de sa section.
              </>
            )}
          </p>
          {motif == null ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setRefus(false);
                  setMotif(ordre.demande?.motif ?? "");
                }}
                className="min-h-[44px] rounded-btn bg-green-700 px-4 font-semibold text-white hover:bg-green-800"
              >
                {ordre.demande ? "Accepter et ouvrir la révision" : `Ouvrir la révision au chef ${ordre.section}`}
              </button>
              {ordre.demande && (
                <button
                  type="button"
                  onClick={() => {
                    setRefus(true);
                    setMotif("");
                  }}
                  className="min-h-[44px] rounded-btn border border-red-700 bg-white px-4 font-semibold text-red-800"
                >
                  Refuser
                </button>
              )}
            </div>
          ) : refus ? (
            formulaire("Refuser la demande", "refuserDemande", `Demande refusée : le chef ${ordre.section} est prévenu.`, "bg-red-700")
          ) : (
            formulaire("Ouvrir la révision", "ordonnerCorrection", `Révision ouverte : le chef ${ordre.section} est prévenu.`)
          )}
        </>
      ) : ordre.demande ? (
        <p>
          <b>Votre demande de révision est chez le DD</b> depuis le {depuis(ordre.demande.le)} — vous serez prévenu de sa réponse. En attendant, touchez une case pour la
          signaler à son arrondissement.
        </p>
      ) : (
        <>
          <p>
            <b>Révision fermée.</b> Vous lisez ce tableau et signalez à l&apos;arrondissement ce qui ne va pas (touchez la case). Pour corriger vous-même,
            demandez au DD d&apos;ouvrir la révision.
          </p>
          {motif == null ? (
            <button
              type="button"
              onClick={() => setMotif(`Réviser le tableau « ${titre} ».`)}
              className="mt-2 min-h-[44px] rounded-btn bg-primary px-4 font-semibold text-white"
            >
              Demander au DD d&apos;ouvrir la révision
            </button>
          ) : (
            formulaire("Envoyer la demande", "demanderOrdre", "Demande envoyée au DD.", "bg-primary")
          )}
        </>
      )}
      {fait && <p className="mt-2 font-semibold text-green-800">{fait}</p>}
      {erreur && <p className="mt-2 font-semibold text-red-800">{erreur}</p>}
    </div>
  );
}

const estRepereCalcule = (x: string) => /^(TOTAL|ÉCART|ECART)/i.test(x.trim());

/**
 * UN ARRONDISSEMENT À LA FOIS (21 octobre 2026) : sur un téléphone, le tableau
 * des six arrondissements se lit mal et se corrige plus mal encore. Le chef (ou
 * le DD) en choisit un : sa ligne ou sa colonne devient un formulaire. Pour un
 * tableau en liste, c'est la liste de l'arrondissement, lue au serveur.
 */
function ChoixArrondissement({
  grille,
  actif,
  version,
  focus,
  onVersion,
  onFocus,
}: {
  grille: Grille;
  actif: boolean;
  version: string | null;
  focus: string | null;
  onVersion: (v: string | null) => void;
  onFocus: (v: string | null) => void;
}) {
  if (!actif) return null;
  if (grille.versions?.length) {
    return (
      <label data-visite="choix-arrondissement" className="mb-3 flex flex-wrap items-center gap-2 text-sm text-gray-800">
        <span className="font-semibold">Liste de :</span>
        <select
          value={version ?? ""}
          onChange={(e) => onVersion(e.target.value || null)}
          className="min-h-[44px] flex-1 rounded-input border border-gray-300 bg-white px-3 text-sm sm:flex-none"
        >
          <option value="">Département</option>
          {grille.versions.map((v) => (
            <option key={v} value={v}>
              {v} (liste du DA)
            </option>
          ))}
        </select>
      </label>
    );
  }
  const colonnes = grille.lignes[0]?.cases.map((c) => c.colonne) ?? [];
  const territoires =
    grille.axe === "lignes"
      ? grille.lignes.map((l) => l.cle).filter((x) => !estRepereCalcule(x))
      : grille.axe === "colonnes"
        ? colonnes.filter((x) => !estRepereCalcule(x))
        : [];
  if (territoires.length < 2) return null;
  return (
    <label data-visite="choix-arrondissement" className="mb-3 flex flex-wrap items-center gap-2 text-sm text-gray-800">
      <span className="font-semibold">Afficher :</span>
      <select
        value={focus ?? ""}
        onChange={(e) => onFocus(e.target.value || null)}
        className="min-h-[44px] flex-1 rounded-input border border-gray-300 bg-white px-3 text-sm sm:flex-none"
      >
        <option value="">Tout le tableau</option>
        {territoires.map((t) => (
          <option key={t} value={t}>
            {t} seulement
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * LA CASE D'UN ARRONDISSEMENT, touchée par le chef hors révision (21 octobre
 * 2026) : ce qu'il peut en faire, d'ici — la signaler à l'arrondissement, ou
 * demander au DD d'ouvrir la révision. Fenêtre par-dessus l'écran : sur un
 * téléphone, elle ne peut pas passer hors de vue.
 */
function FenetreCaseArrondissement({
  cellule,
  grille,
  periode,
  onSignaler,
  onDemande,
  onFermer,
}: {
  cellule: { ligne: string; colonne: string; libelle: string; valeur: string | null; territoire: string | null };
  grille: Grille;
  periode: { annee: number; trimestre: number };
  onSignaler: () => void;
  onDemande: () => void;
  onFermer: () => void;
}) {
  const [occupe, setOccupe] = useState(false);
  const [fait, setFait] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const o = grille.ordreSection;
  const manquants = o?.depotsManquants ?? [];

  async function demander() {
    setOccupe(true);
    setErreur(null);
    try {
      const r = await fetch("/api/trimestre/circuit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          annee: periode.annee,
          trimestre: periode.trimestre,
          action: "demanderOrdre",
          motif:
            `Corriger le tableau n° ${grille.numero}` +
            `${cellule.territoire && !cellule.libelle.includes(cellule.territoire) ? ` — ${cellule.territoire}` : ""}, ` +
            `${cellule.libelle} (inscrit : ${cellule.valeur ?? "vide"}).`,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message ?? "Demande impossible pour le moment.");
      setFait("Demande envoyée au DD : vous serez prévenu de sa réponse.");
      onDemande();
    } catch (e) {
      setErreur(typeof navigator !== "undefined" && !navigator.onLine ? "Il faut du réseau pour cela." : e instanceof Error ? e.message : "Demande impossible.");
    } finally {
      setOccupe(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[195] flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" onClick={onFermer}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Tableau n° {grille.numero}</p>
        <p className="mt-1 font-semibold text-gray-900">{cellule.libelle}</p>
        <p className="mt-2 text-2xl font-bold text-blue-900">{cellule.valeur ?? "—"}</p>
        <p className="mt-2 text-sm text-gray-700">
          Cette case est le travail du DA{cellule.territoire ? ` de ${cellule.territoire}` : ""}. Vous la corrigez vous-même pendant la révision
          ouverte par le DD.
        </p>
        <p className="mt-2 rounded-md bg-gray-50 p-2 text-sm text-gray-800">
          {manquants.length
            ? `La révision s'ouvrira après le dépôt des rapports de tous les DA — pas encore déposé : ${manquants.join(", ")}.`
            : o?.demande
              ? "Votre demande de révision est chez le DD : vous serez prévenu de sa réponse."
              : "La révision de votre section est fermée."}
        </p>
        <div className="mt-3 grid gap-2">
          <button
            type="button"
            onClick={onSignaler}
            className="min-h-[48px] rounded-btn bg-amber-600 px-4 text-sm font-semibold text-white hover:bg-amber-700"
          >
            Signaler cette case {cellule.territoire ? `à ${cellule.territoire}` : "à l'arrondissement"}
          </button>
          {!manquants.length && !o?.demande && !o?.enCours && !fait && (
            <button
              type="button"
              disabled={occupe}
              onClick={() => void demander()}
              className="min-h-[48px] rounded-btn bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {occupe ? "Envoi…" : "Demander au DD d'ouvrir la révision"}
            </button>
          )}
          {fait && <p className="font-semibold text-green-800">{fait}</p>}
          {erreur && <p className="font-semibold text-red-800">{erreur}</p>}
          <button type="button" onClick={onFermer} className="min-h-[44px] rounded-btn border border-gray-300 px-4 text-sm">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

/** « D'où vient ce chiffre ? » : la case touchée, son détail, et ce qu'on peut en faire au trimestre. */
type EtatOrigine = {
  chargement: boolean;
  cellule?: { numero: number; ligne: string; colonne: string };
  donnees?: Origine;
  message?: string;
  correction?: InfoCorrection | null;
};
import { cibles, cibleTrimestrielle } from "@/lib/surlignage";
import VisiteGuidee from "@/components/VisiteGuidee";
import SignalerPanneau, { envoyerObservation } from "@/components/SignalerPanneau";
import { useUtilisateur } from "@/components/UtilisateurContexte";

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
  /** Chef de section : case remplie par l'arrondissement — elle se signale, elle ne se modifie pas. */
  reservee?: boolean;
  /** Le chiffre de l'an passé que le SID n'a pas encore : OBLIGATOIRE avant de transmettre. */
  anPasse?: boolean;
  /** Case calculée, corrigée au trimestre par le chef de section sur ordre du DD (21 octobre 2026). */
  corrigee?: { valeur: number; conflit: boolean; motif: string };
}

interface Grille {
  /** Un chef : la révision de sa section est ouverte par le DD — il corrige les cases des arrondissements. */
  ordreCorrection?: boolean;
  /** La révision de la section de ce tableau, vue par le DD et par le chef concerné (21 octobre 2026). */
  ordreSection?: {
    chef: string;
    section: string;
    enCours: { motif: string; le: string } | null;
    demande: { motif: string; le: string } | null;
    depotsManquants?: string[];
  };
  /** Où sont les arrondissements : de quoi n'en montrer qu'un à la fois. */
  axe?: "lignes" | "colonnes" | null;
  /** Un tableau en liste de la section du chef : les listes des arrondissements, et celle ouverte (null : le département). */
  versions?: string[];
  version?: string | null;
  numero: number;
  titre: string;
  section: string;
  enteteLigne: string;
  lignes: { cle: string; libelle: string; cases: CaseGrille[] }[];
  avertissements: string[];
  /** Les mêmes, avec la case visée ; `confirmable` : le BAC peut confirmer son chiffre. */
  alertes?: { texte: string; confirmable?: ConfirmationReprise }[];
  aide: string;
}

interface ConfirmationReprise {
  ligne: string;
  arrondissement: string;
  ici: number;
  la: number;
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
  titre = "Compléter les tableaux du trimestre",
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
  /** Le détail d'un refus « catégories ≠ total mensuel » : de quoi comparer et aller voir. */
  const [controle, setControle] = useState<ControleCategories | null>(null);
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
  // Signaler une case à l'arrondissement qu'elle concerne (DD, chefs de section).
  const moi = useUtilisateur();
  const peutSignaler = moi?.role === "DD" || Boolean(moi?.role.startsWith("CHEF_"));
  /** Chef d'une section technique : il complète ce qui manque, et signale le reste. */
  const chefTechnique = ["CHEF_PSA", "CHEF_SPAIH", "CHEF_SSV"].includes(moi?.role ?? "");
  /** On saisit l'an passé d'un tableau : la période d'où l'on vient, pour y revenir. */
  const [retourVers, setRetourVers] = useState<{ annee: number; trimestre: number } | null>(null);
  const [modeSignaler, setModeSignaler] = useState(false);
  /**
   * Corriger un chiffre déjà validé (décision du Délégué, 15 octobre 2026) :
   * le chiffre de l'an passé, ou une case d'un trimestre d'une année passée —
   * même rapport transmis. DA, chefs de section et DD ; jamais l'agent.
   */
  /** « D'où vient ce chiffre ? » d'une case grise (20 octobre 2026). */
  const [origine, setOrigine] = useState<EtatOrigine | null>(null);
  const peutCorriger = ["DD", "DA", "CHEF_BAC", "CHEF_PSA", "CHEF_SPAIH", "CHEF_SSV"].includes(moi?.role ?? "");
  const [corriger, setCorriger] = useState(false);
  const [aSignaler, setASignaler] = useState<{ ligne: string; colonne: string; libelle: string; valeur: string | null } | null>(null);
  /**
   * Le chef (ou le DD) devant un tableau des six arrondissements : un seul à la
   * fois, en formulaire, se lit et se corrige mieux sur un téléphone (21 octobre
   * 2026). `version` : la liste d'un arrondissement (tableau sans maille, lue au
   * serveur) ; `focus` : sa ligne ou sa colonne (tableau à maille, à l'écran).
   */
  const [version, setVersion] = useState<string | null>(null);
  const versionRef = useRef<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  /** La case d'un arrondissement touchée par le chef, hors révision : que peut-il en faire ? */
  const [caseArr, setCaseArr] = useState<{ ligne: string; colonne: string; libelle: string; valeur: string | null; territoire: string | null } | null>(null);

  const urlGrille = useCallback(
    (numero: number, liste?: string | null) =>
      `/api/trimestre/saisie?annee=${annee}&trimestre=${trimestre}&tableau=${numero}${liste ? `&version=${encodeURIComponent(liste)}` : ""}`,
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
          const lu = await lireAvecCopie<{ grille: Grille }>(username, urlGrille(numero, versionRef.current));
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

  // `?tableau=16` : ouvert d'emblée — le lien « voir le tableau » de l'étape
  // de rédaction mène droit aux chiffres que la rubrique commente.
  const tableauDemande = useRef<number | null>(
    typeof window === "undefined" ? null : Number(new URLSearchParams(window.location.search).get("tableau")) || null
  );
  useEffect(() => {
    const n = tableauDemande.current;
    if (n == null || !liste?.tableaux.some((t) => t.numero === n)) return;
    tableauDemande.current = null;
    setOuvert(n);
    setGrille(null);
    void chargerGrille(n);
  }, [liste, chargerGrille]);

  /** Changer de liste (tableau sans maille) : la grille se relit au serveur. */
  function choisirVersion(numero: number, liste: string | null) {
    enCoursDeFrappe.current.clear();
    versionRef.current = liste;
    setVersion(liste);
    setRefus(null);
    void chargerGrille(numero);
  }

  function ouvrir(numero: number, forcer = false) {
    setModeSignaler(false);
    setASignaler(null);
    setCaseArr(null);
    setRefus(null);
    setControle(null);
    enCoursDeFrappe.current.clear();
    // Chaque tableau s'ouvre en entier, sur la liste du département.
    if (ouvert !== numero) {
      versionRef.current = null;
      setVersion(null);
      setFocus(null);
    }
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

  /**
   * Les enregistrements partent L'UN APRÈS L'AUTRE. Tapés vite, deux cases
   * partaient ensemble : chacune était contrôlée sans voir l'autre, et la
   * somme des catégories pouvait s'écarter du mensuel sans être refusée
   * (constaté le 28 septembre 2026 sur le cheptel ovin).
   */
  const fileEnregistrements = useRef<Promise<void>>(Promise.resolve());
  function enregistrer(ligne: string, colonne: string, avant: string | null) {
    const suite = fileEnregistrements.current.then(() => enregistrerMaintenant(ligne, colonne, avant));
    fileEnregistrements.current = suite.catch(() => {});
    return suite;
  }

  async function enregistrerMaintenant(ligne: string, colonne: string, avant: string | null) {
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
    setControle(null);
    // Refusée, la case reprend sa valeur enregistrée : un chiffre resté à
    // l'écran laisserait croire qu'il est enregistré.
    const annuler = (message: string) => {
      setRefus(message);
      setValeurs((x) => ({ ...x, [k]: avant ?? "" }));
    };
    setInfo(null);
    try {
      // La liste d'un arrondissement, révisée par le chef : elle part avec la case.
      const liste = versionRef.current;
      const resultat = await envoyer(username, {
        cle: `saisie|${annee}|${trimestre}|${grille.numero}|${ligne}|${colonne}${liste ? `|${liste}` : ""}`,
        methode: "PUT",
        url: "/api/trimestre/saisie",
        corps: { annee, trimestre, numeroTableau: grille.numero, ligne, colonne, valeur, ...(liste ? { version: liste } : {}) },
        libelle: `${grille.titre}${liste ? ` (liste de ${liste})` : ""} — ${ligne} / ${colonne} : ${valeur || "(effacé)"}`,
      });
      if (resultat.statut === "refuse") {
        annuler(resultat.message);
        setControle((resultat.details?.controle as ControleCategories | undefined) ?? null);
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

  // « Reprendre là où je me suis arrêté » : le dernier tableau ouvert, retenu
  // sur l'appareil, par compte et par trimestre (demande du Délégué).
  const cleDernier = `sid-trim-dernier|${username}|${annee}-${trimestre}`;
  const [dernierTableau, setDernierTableau] = useState<number | null>(null);
  useEffect(() => {
    try {
      setDernierTableau(Number(localStorage.getItem(cleDernier)) || null);
    } catch {
      setDernierTableau(null);
    }
  }, [cleDernier]);
  /** Sections dépliées ; null tant que la liste n'a pas choisi celle où l'on travaille. */
  const [sectionsOuvertes, setSectionsOuvertes] = useState<Set<string> | null>(null);
  const [filtre, setFiltre] = useState<"tous" | "a_completer">("tous");

  useEffect(() => {
    if (ouvert != null) {
      dernierOuvert.current = ouvert;
      try {
        localStorage.setItem(cleDernier, String(ouvert));
      } catch {
        // sans conséquence : « Reprendre » proposera le prochain tableau à compléter
      }
      setDernierTableau(ouvert);
      // De retour à la liste, la section de ce tableau doit être dépliée.
      const section = liste?.tableaux.find((t) => t.numero === ouvert)?.section;
      if (section) setSectionsOuvertes((s) => new Set([...Array.from(s ?? []), section]));
      window.scrollTo({ top: 0 });
    } else if (dernierOuvert.current != null) {
      // De retour à la liste : on la retrouve là où l'on avait quitté.
      document.getElementById(`tableau-${dernierOuvert.current}`)?.scrollIntoView({ block: "center" });
    }
  }, [ouvert]);

  /** Le BAC confirme son chiffre : l'avertissement disparaît (rien n'est modifié). */
  async function confirmerReprise(c: ConfirmationReprise) {
    setInfo(null);
    try {
      const r = await fetch("/api/trimestre/reprises", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annee, trimestre, ...c }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErreur(d.message ?? "Confirmation impossible.");
        return;
      }
      setInfo(`Votre chiffre est confirmé face à celui de ${c.arrondissement}.`);
      if (grille) await Promise.all([chargerGrille(grille.numero), chargerListe()]);
    } catch {
      setErreur("Pas de réseau : la confirmation n'est pas partie.");
    }
  }

  function retourALaListe() {
    setOuvert(null);
    setGrille(null);
    setRefus(null);
    enCoursDeFrappe.current.clear();
  }

  /**
   * L'an passé d'un tableau dont les arrondissements sont en COLONNES (bandes,
   * produits connexes, infrastructures…) : il n'y a pas de case « an passé »
   * par arrondissement. Ses chiffres se donnent en remplissant le même tableau
   * pour le trimestre de l'an passé ; la colonne « TOTAL {an passé} » s'en
   * déduit. On y va, et on en revient, d'un bouton (décision du Délégué,
   * 13 octobre 2026 : l'an passé se saisit tant que le SID ne l'a pas).
   */
  function allerALAnPasse(numero: number) {
    setRetourVers({ annee, trimestre });
    tableauDemande.current = numero;
    setPeriode({ annee: annee - 1, trimestre });
  }
  function revenirDeLAnPasse() {
    if (!retourVers) return;
    tableauDemande.current = ouvert;
    setPeriode(retourVers);
    setRetourVers(null);
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
  const estComplet = (t: ResumeTableau) => t.renseignees >= t.saisissables;
  const aCompleter = liste.tableaux.filter((t) => !estComplet(t));
  const reprendre = dernierTableau != null ? liste.tableaux.find((t) => t.numero === dernierTableau) : undefined;
  // Le prochain tableau à compléter : après celui où l'on s'est arrêté, sinon depuis le début.
  const rangReprise = reprendre ? liste.tableaux.indexOf(reprendre) : -1;
  const prochain = aCompleter.find((t) => liste.tableaux.indexOf(t) > rangReprise) ?? aCompleter[0];
  // Par défaut, seule la section où l'on travaille est dépliée.
  const ouvertes =
    sectionsOuvertes ?? new Set([(reprendre ?? prochain ?? liste.tableaux[0])?.section].filter((x): x is string => Boolean(x)));
  const basculerSection = (titreSection: string) => {
    const s = new Set(ouvertes);
    if (s.has(titreSection)) s.delete(titreSection);
    else s.add(titreSection);
    setSectionsOuvertes(s);
  };

  // ------------------------------------------------------------ un tableau seul
  const courant = ouvert == null ? null : liste.tableaux.find((t) => t.numero === ouvert) ?? null;
  if (courant) {
    const rang = liste.tableaux.findIndex((t) => t.numero === courant.numero) + 1;
    // La colonne « TOTAL {an passé} », quand elle ne se saisit pas sur place :
    // combien de lignes que l'on remplit ici n'ont pas leur chiffre de l'an passé.
    const colonneAnPasse = `TOTAL T${trimestre} ${annee - 1}`;
    const lignesSansAnPasse = (() => {
      if (retourVers || !grille || grille.numero !== courant.numero) return 0;
      const paires = grille.lignes.flatMap((l) => {
        const c = l.cases.find((x) => x.colonne === colonneAnPasse);
        return c ? [{ l, c }] : [];
      });
      // Saisissable sur place — ou case d'un arrondissement, révision fermée : pas de détour par l'an passé.
      if (paires.length === 0 || paires.some((p) => p.c.etat === "saisie" || p.c.reservee)) return 0;
      return paires.filter((p) => p.c.affiche == null && p.l.cases.some((x) => x.etat === "saisie" || x.reservee)).length;
    })();
    return (
      <div className="max-w-full">
        {retourVers && (
          <div data-visite="bandeau-an-passe" className="mb-3 rounded-md border-2 border-amber-500 bg-amber-50 p-3">
            <p className="text-sm font-semibold text-amber-900">
              Vous saisissez le T{trimestre} {annee} : les chiffres de l&apos;an passé.
            </p>
            <p className="mt-1 text-sm text-amber-900">
              Remplissez ce que vous aviez à l&apos;époque, à partir de vos rapports. Ces chiffres alimentent la colonne « TOTAL T
              {trimestre} {annee} » du rapport du T{retourVers.trimestre} {retourVers.annee}.
            </p>
            <button
              type="button"
              onClick={revenirDeLAnPasse}
              className="mt-2 min-h-[44px] rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
            >
              ← Revenir au T{retourVers.trimestre} {retourVers.annee}
            </button>
          </div>
        )}
        <button
          type="button"
          data-visite="retour-liste-trimestre"
          onClick={retourALaListe}
          className="mb-3 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          ← Tous les tableaux
        </button>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {courant.section} · {liste.periode}
        </p>
        <h1 className="mt-1 text-xl font-bold text-primary-dark">{courant.titre}</h1>
        <VisiteGuidee ecran="trimestre-saisie-tableau" pret={Boolean(grille && grille.numero === courant.numero)} />
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
          {grille && grille.numero === courant.numero && grille.ordreSection && (
            <BandeauOrdre
              ordre={grille.ordreSection}
              role={moi?.role ?? ""}
              periode={{ annee, trimestre }}
              titre={grille.titre}
              onFait={() => void chargerGrille(grille.numero)}
            />
          )}
          {grille && grille.numero === courant.numero && (
            <ChoixArrondissement
              grille={grille}
              actif={chefTechnique || moi?.role === "DD"}
              version={version}
              focus={focus}
              onVersion={(v) => choisirVersion(grille.numero, v)}
              onFocus={setFocus}
            />
          )}
          {caseArr && grille && (
            <FenetreCaseArrondissement
              cellule={caseArr}
              grille={grille}
              periode={{ annee, trimestre }}
              onSignaler={() => {
                setASignaler({ ligne: caseArr.ligne, colonne: caseArr.colonne, libelle: caseArr.libelle, valeur: caseArr.valeur });
                setCaseArr(null);
              }}
              onDemande={() => void chargerGrille(grille.numero)}
              onFermer={() => setCaseArr(null)}
            />
          )}
          {peutSignaler && grille && grille.numero === courant.numero && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-visite="mode-signaler"
                onClick={() => {
                  setModeSignaler((v) => !v);
                  setASignaler(null);
                }}
                className={`min-h-[44px] rounded-md border px-3 py-2 text-sm font-semibold ${
                  modeSignaler ? "border-amber-600 bg-amber-600 text-white" : "border-amber-600 bg-white text-amber-800"
                }`}
              >
                {modeSignaler ? "Terminer le signalement" : "Signaler une case à l'arrondissement"}
              </button>
              {modeSignaler && <span className="text-sm text-amber-900">Touchez la case qui ne va pas.</span>}
            </div>
          )}
          {peutCorriger && grille && grille.numero === courant.numero && casesCorrigeables(grille, annee).length > 0 &&
            // Un chef de section technique corrige seulement sur ordre du DD (20 octobre 2026) ; le chef BAC, librement.
            (!["CHEF_PSA", "CHEF_SSV", "CHEF_SPAIH"].includes(moi?.role ?? "") || grille.ordreCorrection) && (
            <div className="mb-3">
              {!corriger ? (
                <button
                  type="button"
                  data-visite="corriger-chiffre"
                  onClick={() => setCorriger(true)}
                  className="min-h-[44px] rounded-md border border-primary bg-white px-3 py-2 text-sm font-semibold text-primary hover:bg-primary-light"
                >
                  {annee < new Date().getFullYear() ? `Corriger un chiffre du T${trimestre} ${annee}` : `Corriger un chiffre de ${annee - 1}`}
                </button>
              ) : (
                <CorrigerChiffrePanneau
                  cases={casesCorrigeables(grille, annee)}
                  onFermer={() => setCorriger(false)}
                  onEnvoyer={async (ligne, colonne, valeur, motif) => {
                    if (typeof navigator !== "undefined" && !navigator.onLine) {
                      return "Une correction demande du réseau : elle est tracée et notifiée. Réessayez une fois connecté.";
                    }
                    const r = await fetch("/api/trimestre/an-passe", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ annee, trimestre, numeroTableau: grille.numero, ligne, colonne, valeur, motif }),
                    }).catch(() => null);
                    if (!r) return "Pas de connexion : rien n'a été enregistré.";
                    const j = await r.json().catch(() => ({}));
                    if (!r.ok) return j.message ?? "La correction n'a pas abouti.";
                    setCorriger(false);
                    setInfo("Correction enregistrée : le Délégué départemental en est informé, et elle figure au journal d'activité.");
                    ouvrir(grille.numero, true);
                    return null;
                  }}
                />
              )}
            </div>
          )}
          {aSignaler && grille && (
            <SignalerPanneau
              titre={`Tableau ${grille.numero} · ${aSignaler.libelle}`}
              valeur={aSignaler.valeur}
              destinataire="l'arrondissement concerné"
              onFermer={() => setASignaler(null)}
              onEnvoyer={async (texte) => {
                const { erreur: e, donnees } = await envoyerObservation({
                  action: "signaler_t", type: "case", annee, trimestre, numero: grille.numero, ligne: aSignaler.ligne, colonne: aSignaler.colonne, texte,
                  ...(versionRef.current ? { version: versionRef.current } : {}),
                });
                if (e) return e;
                setASignaler(null);
                setModeSignaler(false);
                setInfo(donnees.rouvert ? "Observation envoyée. Le rapport de l'arrondissement était transmis : il lui est renvoyé." : "Observation envoyée à l'arrondissement.");
                return null;
              }}
            />
          )}
          {grille && grille.numero === courant.numero && (
            <TableauSaisie
              refus={refus}
              controle={controle}
              arrondissement={Boolean(liste.arrondissement)}
              onFermerControle={() => setControle(null)}
              grille={grille}
              valeurs={valeurs}
              enCours={enCours}
              onChange={(k, v) => {
                enCoursDeFrappe.current.add(k);
                setValeurs((x) => ({ ...x, [k]: v }));
              }}
              onQuitter={enregistrer}
              onConfirmerReprise={(c) => void confirmerReprise(c)}
              entier={chefTechnique}
              focus={grille.versions ? null : focus}
              onCaseArrondissement={(l, c) =>
                setCaseArr({
                  ligne: l.cle,
                  colonne: c.colonne,
                  libelle: `${l.libelle || l.cle} · ${c.colonne}`,
                  valeur: c.saisi ?? c.affiche,
                  territoire: version ?? (grille.axe === "lignes" ? l.cle : grille.axe === "colonnes" ? c.colonne : null),
                })
              }
              signalement={modeSignaler}
              onSignaler={(l, c) => setASignaler({ ligne: l.cle, colonne: c.colonne, libelle: `${l.libelle || l.cle} · ${c.colonne}`, valeur: c.saisi ?? c.affiche })}
              onOrigine={async (l, c) => {
                const cellule = { numero: grille.numero, ligne: l.cle, colonne: c.colonne };
                setOrigine({ chargement: true, cellule });
                try {
                  const q = new URLSearchParams({ annee: String(annee), trimestre: String(trimestre), tableau: String(grille.numero), origine: "1", ligne: l.cle, colonne: c.colonne });
                  const j = await (await fetch(`/api/trimestre/saisie?${q}`, { cache: "no-store" })).json();
                  setOrigine({ chargement: false, cellule, donnees: j.origine, message: j.origine ? undefined : j.message ?? "Détail indisponible.", correction: j.correction ?? null });
                } catch {
                  setOrigine({ chargement: false, cellule, message: "Le détail demande du réseau : réessayez une fois connecté." });
                }
              }}
              origine={origine}
              onFermerOrigine={() => setOrigine(null)}
              periode={{ annee, trimestre }}
              onCorrige={() => {
                setOrigine(null);
                void chargerGrille(grille.numero);
              }}
            />
          )}
          {lignesSansAnPasse > 0 && (
            <div data-visite="an-passe-colonne" className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3">
              <p className="text-sm font-semibold text-amber-900">
                « {colonneAnPasse} » est vide pour {lignesSansAnPasse} ligne{lignesSansAnPasse > 1 ? "s" : ""}
              </p>
              <p className="mt-1 text-sm text-amber-900">
                Le SID n&apos;a pas encore les chiffres de l&apos;an passé de ce tableau. Pour les donner, remplissez ce même tableau
                pour le T{trimestre} {annee - 1}, à partir de vos rapports de l&apos;époque : la colonne se calculera seule.
              </p>
              <button
                type="button"
                onClick={() => allerALAnPasse(courant.numero)}
                className="mt-2 min-h-[44px] rounded-md border border-amber-600 bg-white px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100"
              >
                Saisir les chiffres du T{trimestre} {annee - 1} →
              </button>
            </div>
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
      <VisiteGuidee ecran="trimestre-saisie-liste" />
      {retourVers && (
        <div className="mb-3 rounded-md border-2 border-amber-500 bg-amber-50 p-3">
          <p className="text-sm font-semibold text-amber-900">
            Vous êtes sur le T{trimestre} {annee} : les chiffres de l&apos;an passé.
          </p>
          <button
            type="button"
            onClick={revenirDeLAnPasse}
            className="mt-2 min-h-[44px] rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
          >
            ← Revenir au T{retourVers.trimestre} {retourVers.annee}
          </button>
        </div>
      )}
      <h1 className="text-2xl font-bold text-primary-dark">{chefTechnique ? "Compléter ou faire corriger un tableau de ma section" : titre}</h1>
      <p className="mt-1 max-w-3xl text-gray-600">
        {presentation ??
          (chefTechnique
            ? "Les tableaux de votre section, pour tous les arrondissements. Les cases des arrondissements sont le travail des DA : vous les corrigez pendant la révision que le DD ouvre après le dépôt de tous les rapports (demandez-la en tête d'un tableau). D'ici là, touchez une case pour la signaler à son arrondissement."
            : liste.arrondissement
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

      {/* Reprendre : le dernier tableau ouvert, et le prochain qui reste à compléter. */}
      {(reprendre || prochain) && (
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {reprendre && (
            <button
              type="button"
              data-visite="reprendre"
              onClick={() => ouvrir(reprendre.numero, true)}
              className="rounded-lg bg-primary px-4 py-3 text-left text-white hover:bg-primary-hover"
            >
              <span className="block text-sm font-semibold">Reprendre là où je me suis arrêté →</span>
              <span className="block text-xs opacity-90">
                {reprendre.titre} · {reprendre.renseignees}/{reprendre.saisissables} case(s)
              </span>
            </button>
          )}
          {prochain && prochain !== reprendre && (
            <button
              type="button"
              data-visite="prochain"
              onClick={() => ouvrir(prochain.numero, true)}
              className="rounded-lg border-2 border-primary bg-white px-4 py-3 text-left text-primary-dark hover:bg-green-50"
            >
              <span className="block text-sm font-semibold">Prochain tableau à compléter →</span>
              <span className="block text-xs text-gray-600">
                {prochain.titre} · {prochain.renseignees}/{prochain.saisissables} case(s)
              </span>
            </button>
          )}
        </div>
      )}
      {aCompleter.length === 0 && liste.tableaux.length > 0 && (
        <p className="mt-5 rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-medium text-green-900">
          ✓ Tous les tableaux sont complets. Passez à l&apos;étape suivante.
        </p>
      )}

      {/* Filtre et dépliage */}
      {liste.tableaux.length > 0 && (
        <div data-visite="filtres-trimestre" className="mt-5 flex flex-wrap items-center gap-2">
          {(["tous", "a_completer"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFiltre(f)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                filtre === f ? "border-primary bg-primary text-white" : "border-gray-300 bg-white text-gray-700"
              }`}
            >
              {f === "tous" ? `Tous (${liste.tableaux.length})` : `À compléter (${aCompleter.length})`}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSectionsOuvertes(ouvertes.size === sections.length ? new Set() : new Set(sections.map((s) => s.titre)))}
            className="ml-auto text-sm font-semibold text-primary underline"
          >
            {ouvertes.size === sections.length ? "Tout replier" : "Tout déplier"}
          </button>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {sections.map((s) => {
          const visibles = s.tableaux.filter((t) => filtre === "tous" || !estComplet(t));
          if (visibles.length === 0) return null;
          const complets = s.tableaux.filter(estComplet).length;
          const deplie = ouvertes.has(s.titre);
          return (
          <div key={s.titre} className="rounded-lg border border-gray-200 bg-gray-50">
            <button
              type="button"
              data-visite="section-trimestre"
              onClick={() => basculerSection(s.titre)}
              aria-expanded={deplie}
              className="flex min-h-[48px] w-full items-center justify-between gap-3 px-3 py-2 text-left"
            >
              <span className="text-sm font-semibold uppercase tracking-wide text-gray-700">{s.titre}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    complets === s.tableaux.length ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900"
                  }`}
                >
                  {complets}/{s.tableaux.length} complet{s.tableaux.length > 1 ? "s" : ""}
                </span>
                <span className="text-gray-500">{deplie ? "▲" : "▼"}</span>
              </span>
            </button>
            {deplie && (
            <div className="space-y-2 px-2 pb-2">
              {visibles.map((t) => (
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
                    {estComplet(t) ? "✓ " : ""}
                    {t.renseignees}/{t.saisissables}
                  </span>
                </button>
              ))}
            </div>
            )}
          </div>
          );
        })}
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
          data-visite="tableau-suivant-trimestre"
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
  controle,
  arrondissement,
  onFermerControle,
  grille,
  valeurs,
  enCours,
  onChange,
  onQuitter,
  onConfirmerReprise,
  signalement = false,
  onSignaler,
  onOrigine,
  origine,
  onFermerOrigine,
  periode,
  onCorrige,
  entier = false,
  focus = null,
  onCaseArrondissement,
}: {
  /** Un seul arrondissement à l'écran (sa ligne, ou sa colonne), en formulaire. */
  focus?: string | null;
  /** Le chef touche la case d'un arrondissement hors révision : signaler, demander la révision. */
  onCaseArrondissement?: (l: Grille["lignes"][number], c: CaseGrille) => void;
  /** Une case grise touchée : d'où vient son chiffre, mois par mois. */
  onOrigine?: (l: Grille["lignes"][number], c: CaseGrille) => void;
  origine?: EtatOrigine | null;
  onFermerOrigine?: () => void;
  /** Le trimestre affiché, et la grille à recharger après une correction au trimestre. */
  periode?: { annee: number; trimestre: number };
  onCorrige?: () => void;
  /**
   * Toujours le tableau entier, jamais le formulaire d'une seule ligne : un
   * chef de section doit voir les six arrondissements, même s'il ne reste
   * qu'une case à remplir — et pouvoir signaler n'importe laquelle.
   */
  entier?: boolean;
  refus: string | null;
  controle: ControleCategories | null;
  /** DA ou agent : le bouton ouvre son rapport mensuel. */
  arrondissement: boolean;
  onFermerControle: () => void;
  grille: Grille;
  valeurs: Record<string, string>;
  enCours: string | null;
  onChange: (cle: string, valeur: string) => void;
  onQuitter: (ligne: string, colonne: string, avant: string | null) => void;
  /** Le BAC confirme son chiffre face à celui d'un arrondissement. */
  onConfirmerReprise?: (c: ConfirmationReprise) => void;
  /** Mode « signaler » : toucher une case l'ouvre au signalement au lieu de la modifier. */
  signalement?: boolean;
  onSignaler?: (l: Grille["lignes"][number], c: CaseGrille) => void;
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
    if (signalement) {
      return (
        <button
          type="button"
          data-visite="case-signalable"
          onClick={() => onSignaler?.(l, c)}
          className="block w-full rounded-sm px-2 py-1 text-left outline-dashed outline-1 outline-amber-400 hover:bg-amber-100"
        >
          {valeurs[k] || c.saisi || c.affiche || "—"}
        </button>
      );
    }
    if (c.etat === "saisie") {
      return (
        <input
          data-visite={c.colonne.startsWith("TOTAL ") ? "case-saisie case-an-passe" : "case-saisie"}
          value={valeurs[k] ?? ""}
          // Un nombre : le clavier numérique du téléphone s'ouvre directement.
          inputMode={c.texte ? "text" : "decimal"}
          placeholder={c.propose ?? (c.anPasse ? "obligatoire" : c.texte ? "texte" : "")}
          title={
            c.propose
              ? "Valeur reprise du tableau du BAC : saisissez-en une autre si elle est fausse."
              : c.anPasse
                ? `Obligatoire : le chiffre de votre arrondissement à la même période de l'an passé (${c.colonne.replace(/^TOTAL\s*/, "")}). Le SID ne l'a pas encore. Si l'activité était nulle, inscrivez 0.`
                : undefined
          }
          aria-required={c.anPasse || undefined}
          onChange={(e) => onChange(k, e.target.value)}
          onBlur={() => onQuitter(l.cle, c.colonne, c.saisi)}
          className={`${large ? "w-full" : c.texte ? "w-48" : "w-28"} ${c.propose ? "placeholder:text-gray-500" : c.anPasse ? "" : "placeholder:text-gray-300"} rounded-sm border px-2 py-1 outline-none focus:border-primary focus:bg-amber-50 ${
            c.anPasse && !(valeurs[k] ?? "").trim() ? "border-amber-500 bg-amber-50 placeholder:text-amber-700" : "border-gray-300 bg-white"
          } ${enCours === k ? "bg-amber-100" : ""}`}
          aria-label={`${l.libelle}, ${c.colonne}`}
        />
      );
    }
    // La case d'un arrondissement, hors révision : elle se TOUCHE — une infobulle
    // ne s'affiche pas sur un téléphone, et le chef restait sans rien (21 octobre 2026).
    if (c.reservee && onCaseArrondissement) {
      return (
        <button
          type="button"
          data-visite="case-arrondissement"
          onClick={() => onCaseArrondissement(l, c)}
          className="block min-h-[32px] w-full bg-blue-50 px-2 py-1 text-left text-blue-900 hover:bg-blue-100"
        >
          {c.affiche ?? "—"}
        </button>
      );
    }
    const titre = c.reservee
      ? "Case de l'arrondissement : touchez-la pour la signaler, ou demandez au DD d'ouvrir la révision"
      : c.etat === "calculee"
        ? "Calculé à partir des rapports mensuels"
        : c.etat === "total"
          ? "Total calculé"
          : "Hors de votre ressort";
    // Une case calculée à partir du mensuel se touche : d'où vient son chiffre —
    // vide comprise (21 octobre 2026) : c'est là qu'on apprend POURQUOI elle l'est.
    if (c.etat === "calculee" && onOrigine) {
      return (
        <button
          type="button"
          data-visite="case-grise"
          title={
            c.corrigee
              ? `Corrigé au trimestre par le chef de section — ${c.corrigee.motif}. Touchez pour le détail.`
              : "D'où vient ce chiffre ? Touchez pour voir les rapports mensuels, mois par mois."
          }
          onClick={() => onOrigine(l, c)}
          className={`block w-full px-2 py-1 text-left underline decoration-dotted underline-offset-2 hover:bg-primary-light hover:text-primary-dark ${
            c.corrigee ? (c.corrigee.conflit ? "bg-red-50 font-semibold text-red-900" : "bg-sky-50 font-semibold text-sky-900") : "bg-gray-100 text-gray-600"
          }`}
        >
          {c.affiche ?? "—"}
          {c.corrigee && <span className="ml-1 align-super text-[10px] font-bold" aria-label="corrigé au trimestre">✎</span>}
        </button>
      );
    }
    return (
      <span
        data-visite={c.reservee ? "case-arrondissement" : c.etat === "calculee" || c.etat === "total" ? "case-grise" : undefined}
        title={titre}
        className={`block px-2 py-1 ${c.reservee ? "bg-blue-50 text-blue-900" : c.etat === "lecture" ? "text-gray-700" : "bg-gray-100 text-gray-600"} ${
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
      {controle ? (
        <ComparaisonMensuel controle={controle} arrondissement={arrondissement} onFermer={onFermerControle} />
      ) : (
        refus && (
          <p role="alert" className="mb-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-800">
            {refus}
          </p>
        )
      )}
      {origine && (
        // Une fenêtre par-dessus l'écran : sur un téléphone, elle ne peut pas passer hors de vue.
        <OrigineMensuelle
          chargement={origine.chargement}
          origine={origine.donnees}
          message={origine.message}
          correction={origine.correction ?? null}
          periode={periode}
          cellule={origine.cellule}
          onCorrige={onCorrige}
          onFermer={() => onFermerOrigine?.()}
        />
      )}
      {(grille.alertes ?? grille.avertissements.map((texte) => ({ texte }))).length > 0 && (
        <ul className="mb-3 space-y-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          {(grille.alertes ?? grille.avertissements.map((texte) => ({ texte } as { texte: string; confirmable?: ConfirmationReprise }))).map((a, i) => (
            <li key={i}>
              ⚠ {a.texte}
              {a.confirmable && onConfirmerReprise && (
                <button
                  type="button"
                  data-visite="confirmer-reprise"
                  onClick={() => onConfirmerReprise(a.confirmable!)}
                  className="ml-2 mt-1 rounded border border-amber-700 bg-white px-2 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                >
                  Mon chiffre est juste
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/*
        Une seule ligne à remplir — le cas du DA, qui ne saisit que son
        arrondissement : un formulaire vertical se lit mieux sur un téléphone
        qu'un tableau de dix colonnes. Le chef ou le DD qui choisit UN
        arrondissement a le même formulaire (21 octobre 2026).
      */}
      {focus && grille.axe === "lignes" && grille.lignes.some((l) => l.cle === focus) ? (
        <div className="grid max-w-xl gap-2">
          <p className="text-sm font-semibold text-gray-800">{focus}</p>
          {grille.lignes
            .filter((l) => l.cle === focus)
            .flatMap((l) =>
              l.cases.map((c) => (
                <label key={c.colonne} className="grid grid-cols-[1fr,9rem] items-center gap-3 rounded text-sm">
                  <span className={c.etat === "saisie" ? "text-gray-800" : "font-medium text-gray-600"}>{c.colonne}</span>
                  {champ(l, c, true)}
                </label>
              ))
            )}
        </div>
      ) : focus && grille.axe === "colonnes" && colonnes.includes(focus) ? (
        <div className="grid max-w-xl gap-2">
          <p className="text-sm font-semibold text-gray-800">{focus}</p>
          {grille.lignes.map((l) => {
            const c = l.cases.find((x) => x.colonne === focus);
            if (!c) return null;
            return (
              <label key={l.cle} className="grid grid-cols-[1fr,9rem] items-center gap-3 rounded text-sm">
                <span className={c.etat === "saisie" ? "text-gray-800" : "font-medium text-gray-600"}>{l.libelle || l.cle}</span>
                {champ(l, c, true)}
              </label>
            );
          })}
        </div>
      ) : !entier && lignesSaisies.length > 1 && colonnesSaisies.length === 1 ? (
        // Une seule colonne à remplir : chaque ligne du tableau devient une
        // question, et les totaux de la colonne s'affichent en fin de liste.
        <div className="grid max-w-xl gap-2">
          <p className="text-sm font-semibold text-gray-800">{colonnesSaisies[0]}</p>
          {grille.lignes.map((l) => {
            const c = l.cases.find((x) => x.colonne === colonnesSaisies[0]);
            if (!c) return null;
            return (
              <label
                key={l.cle}
                data-cible={cibles(cibleTrimestrielle.ligne(l.cle), cibleTrimestrielle.case(l.cle, c.colonne))}
                className="grid grid-cols-[1fr,8rem] items-center gap-3 rounded text-sm"
              >
                <span className={c.etat === "saisie" ? "text-gray-800" : "font-medium text-gray-600"}>{l.libelle || l.cle}</span>
                {champ(l, c, true)}
              </label>
            );
          })}
        </div>
      ) : !entier && lignesSaisies.length === 1 ? (
        <div data-cible={cibleTrimestrielle.ligne(lignesSaisies[0].cle)} className="grid max-w-xl gap-2 rounded p-1">
          {lignesSaisies[0].cases.map((c) => (
            <label
              key={c.colonne}
              data-cible={cibleTrimestrielle.case(lignesSaisies[0].cle, c.colonne)}
              className="grid grid-cols-[1fr,10rem] items-center gap-3 rounded text-sm"
            >
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
                  <th
                    data-cible={cibleTrimestrielle.ligne(l.cle)}
                    className="sticky left-0 z-10 border border-gray-200 bg-white px-2 py-1 text-left font-normal text-gray-800"
                  >
                    {l.libelle || l.cle}
                  </th>
                  {l.cases.map((c) => (
                    <td key={c.colonne} data-cible={cibleTrimestrielle.case(l.cle, c.colonne)} className="border border-gray-200 p-0">
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
        {grille.lignes.some((l) => l.cases.some((c) => c.reservee)) &&
          " Cases bleutées : celles des arrondissements — vous les modifiez pendant la révision ouverte par le DD ; d'ici là, touchez-en une pour la signaler à son arrondissement."}
      </p>
    </div>
  );
}

/** Les cases qu'un DA, un chef ou le DD peut corriger après validation. */
function casesCorrigeables(grille: Grille, annee: number) {
  const anneePassee = annee < new Date().getFullYear();
  return grille.lignes.flatMap((l) =>
    l.cases
      .filter((c) => c.anPasse || (anneePassee && !c.texte && (c.etat === "saisie" || c.reservee)))
      .map((c) => ({
        ligne: l.cle,
        colonne: c.colonne,
        libelle: `${l.libelle || l.cle} · ${c.colonne}`,
        actuel: c.saisi ?? c.affiche ?? null,
      }))
  );
}

function CorrigerChiffrePanneau({
  cases,
  onFermer,
  onEnvoyer,
}: {
  cases: ReturnType<typeof casesCorrigeables>;
  onFermer: () => void;
  onEnvoyer: (ligne: string, colonne: string, valeur: string, motif: string) => Promise<string | null>;
}) {
  const [choix, setChoix] = useState(0);
  const [valeur, setValeur] = useState("");
  const [motif, setMotif] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const c = cases[Math.min(choix, cases.length - 1)];

  return (
    <div className="rounded-card border border-primary/40 bg-primary-light p-4">
      <p className="text-sm font-bold text-primary-dark">Corriger un chiffre déjà inscrit</p>
      <p className="mt-1 text-[13px] text-ink-muted">
        Le rapport n&apos;est pas rouvert : seul ce chiffre change. Le motif est obligatoire ; la correction est inscrite au
        journal d&apos;activité et le Délégué départemental en est informé.
      </p>
      <label className="mt-3 block text-[13px] font-bold text-ink" htmlFor="corriger-case">
        Case à corriger
      </label>
      <select
        id="corriger-case"
        value={choix}
        onChange={(e) => setChoix(Number(e.target.value))}
        className="mt-1 min-h-[42px] w-full rounded-input border border-gray-300 bg-white px-2 text-sm"
      >
        {cases.map((x, i) => (
          <option key={`${x.ligne}|${x.colonne}`} value={i}>
            {x.libelle} — actuellement : {x.actuel ?? "vide"}
          </option>
        ))}
      </select>
      <div className="mt-3 grid gap-3 sm:grid-cols-[180px_1fr]">
        <div>
          <label className="block text-[13px] font-bold text-ink" htmlFor="corriger-valeur">
            Nouveau chiffre
          </label>
          <input
            id="corriger-valeur"
            inputMode="decimal"
            value={valeur}
            onChange={(e) => setValeur(e.target.value)}
            placeholder="0 si nul"
            className="mt-1 min-h-[42px] w-full rounded-input border border-gray-300 bg-white px-2 text-right text-sm font-semibold tabular-nums"
          />
        </div>
        <div>
          <label className="block text-[13px] font-bold text-ink" htmlFor="corriger-motif">
            Motif de la correction
          </label>
          <input
            id="corriger-motif"
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            placeholder="Ex. : erreur de report du registre 2025"
            className="mt-1 min-h-[42px] w-full rounded-input border border-gray-300 bg-white px-2 text-sm"
          />
        </div>
      </div>
      {erreur && <p className="mt-3 rounded-input bg-red-50 p-2 text-sm text-red-800">{erreur}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={occupe || !c}
          onClick={async () => {
            setErreur(null);
            if (!valeur.trim()) return setErreur("Inscrivez le nouveau chiffre (0 si l'activité était nulle).");
            if (motif.trim().length < 5) return setErreur("Indiquez le motif : pourquoi ce chiffre change.");
            setOccupe(true);
            const e = await onEnvoyer(c.ligne, c.colonne, valeur, motif);
            setOccupe(false);
            if (e) setErreur(e);
          }}
          className="min-h-[44px] rounded-btn bg-primary px-4 text-sm font-bold text-white hover:bg-primary-hover disabled:opacity-50"
        >
          {occupe ? "Enregistrement…" : "Enregistrer la correction"}
        </button>
        <button type="button" onClick={onFermer} className="min-h-[44px] rounded-btn border border-gray-300 bg-white px-4 text-sm font-semibold text-ink-muted hover:bg-gray-100">
          Annuler
        </button>
      </div>
    </div>
  );
}