"use client";

/**
 * « D'OÙ VIENT CE CHIFFRE ? » — une case grise du trimestre, détaillée mois
 * par mois (demande du Délégué, 20 octobre 2026 : un chef qui voit une erreur
 * au trimestre doit pouvoir vérifier le mensuel, d'où elle vient forcément).
 *
 * Pour un tableau des LISTES du mensuel (vaccinations, cliniques, circulation,
 * lésions — 21 octobre 2026) : ce qui est compté, ce qui est inscrit dans un
 * rapport pas encore transmis, et les lignes que le SID n'a pas su ranger. On
 * sait ainsi POURQUOI une case est vide.
 *
 * Puis, pour ces tableaux et la pisciculture, la CORRECTION AU TRIMESTRE : le
 * chef de la section, sur ordre du DD, inscrit le vrai chiffre (motif et source
 * obligatoires) ; sans ordre, il le demande au DD.
 */
import { useState } from "react";
import { allerAuMois } from "@/lib/allerAuMois";
import { useUtilisateur } from "@/components/UtilisateurContexte";
import type { ControleCategories } from "@/components/ComparaisonMensuel";

export type Origine = ControleCategories & {
  explication: string;
  periodeLue: string;
  nonClassees?: { mois: string; ligne: string; quantite: number | null }[];
};

/** Ce que ce profil peut faire de la case au trimestre (src/server/trimestre/corrigerCase.ts). */
export interface InfoCorrection {
  corrigeable: boolean;
  estChef: boolean;
  aOrdre: boolean;
  demandeEnCours: boolean;
  raison: string | null;
  peutCorriger: boolean;
  affiche: number | null;
  mensuel: number | null;
  /** Le chef qui corrige ce tableau, sa section et l'état de l'ordre — pour le DD, qui le donne d'ici. */
  chef: string | null;
  section: string | null;
  ordreEnCours: boolean;
  demande: { motif: string; le: string } | null;
  motifPropose: string;
  existante: {
    valeur: number;
    valeurMensuelle: number | null;
    mensuelActuel: number | null;
    motif: string;
    source: string;
    le: string;
    auteur: string | null;
    conflit: boolean;
  } | null;
}

const f = (n: number) => n.toLocaleString("fr-FR");
const STATUT_RAPPORT: Record<string, string> = {
  EN_SAISIE: "en saisie",
  REJETE: "renvoyé pour correction",
  SOUMIS: "transmis au DD",
  CLOTURE: "clôturé",
};

/**
 * LA FENÊTRE D'UNE CASE GRISE (21 octobre 2026) : par-dessus l'écran — sur un
 * téléphone, un cadre inséré au-dessus du tableau passait hors de vue, et le
 * bouton de correction, tout en bas, n'était jamais trouvé. L'action vient
 * EN PREMIER (corriger, demander l'ordre, donner l'ordre), le détail ensuite.
 */
export default function OrigineMensuelle({
  origine,
  message,
  chargement = false,
  onFermer,
  correction = null,
  periode,
  cellule,
  onCorrige,
}: {
  origine?: Origine;
  /** Pas de détail pour cette case : la raison. */
  message?: string;
  chargement?: boolean;
  onFermer: () => void;
  correction?: InfoCorrection | null;
  periode?: { annee: number; trimestre: number };
  cellule?: { numero: number; ligne: string; colonne: string };
  onCorrige?: () => void;
}) {
  const titre = origine ? `${origine.arrondissement}, « ${origine.nature} » (${origine.periodeLue})` : cellule ? `${cellule.ligne}, « ${cellule.colonne} »` : "Cette case";
  return (
    <div className="fixed inset-0 z-[195] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onFermer}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="D'où vient ce chiffre ?"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-2 bg-primary-light px-4 py-3">
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-primary-dark">D&apos;où vient ce chiffre ?</p>
            <p className="text-sm text-ink">{titre}</p>
          </div>
          <button type="button" onClick={onFermer} className="min-h-[40px] shrink-0 rounded-btn border border-primary/40 bg-white px-3 text-sm font-semibold text-primary">
            Fermer
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-3">
          {chargement && <p className="text-sm text-ink-muted">Recherche dans les rapports mensuels…</p>}
          {/* L'action d'abord : corriger, demander l'ordre, ou le donner. */}
          {!chargement && correction && periode && cellule && <CorrectionAuTrimestre correction={correction} periode={periode} cellule={cellule} onCorrige={onCorrige} />}
          {!chargement && origine && <DetailOrigine o={origine} correction={correction} />}
          {!chargement && !origine && message && <p className="mt-3 rounded-md bg-appbg p-3 text-sm text-gray-800">{message}</p>}
        </div>
      </div>
    </div>
  );
}

/** Le détail mois par mois. */
function DetailOrigine({ o, correction }: { o: Origine; correction: InfoCorrection | null }) {
  const moi = useUtilisateur();
  const role = moi?.role ?? "";
  const [erreur, setErreur] = useState<string | null>(null);
  const [ouverture, setOuverture] = useState<string | null>(null);
  const stock = o.regle === "DERNIERE_VALEUR";
  const liste = o.nonClassees !== undefined; // un tableau des listes du mensuel

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
        : correction?.corrigeable
          ? "Si le vrai chiffre manque au mensuel (rien d'inscrit, ou inscrit faux), corrigez-le au trimestre pendant la révision ouverte par le DD (cadre bleu, en haut)."
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
    <section className="mt-3">
      <p className="text-xs text-ink-muted">Calcul : {o.explication}.</p>
      <div className="mt-1">
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
              {m.enAttente != null && (
                <span className="text-xs font-semibold text-amber-800">{f(m.enAttente)} inscrit(s), pas encore compté(s) : le rapport n&apos;est pas transmis</span>
              )}
              <span className="flex w-full items-center justify-between gap-2 sm:ml-auto sm:w-auto">
                <span className="text-xs text-ink-faint">{m.statutRapport ? `rapport ${STATUT_RAPPORT[m.statutRapport] ?? m.statutRapport}` : liste ? "aucun rapport" : ""}</span>
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
        {o.nonClassees && o.nonClassees.length > 0 && (
          <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">Inscrit au mensuel, mais que le SID n&apos;a pas su ranger dans ce tableau :</p>
            <ul className="mt-1 list-disc pl-5">
              {o.nonClassees.slice(0, 8).map((n, i) => (
                <li key={i}>
                  {n.mois} — {n.ligne}
                  {n.quantite != null ? ` : ${f(n.quantite)}` : ""}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs">Le DD range ces lignes (« Saisir les tableaux du trimestre », liste des lignes non rangées).</p>
          </div>
        )}
        {liste && o.mois.every((m) => m.valeur == null && m.enAttente == null) && !o.nonClassees?.length && (
          <p className="mt-3 rounded-md bg-appbg p-3 text-sm text-gray-800">
            Rien n&apos;est inscrit pour cette case dans les rapports mensuels de {o.arrondissement}. Si l&apos;activité a eu lieu, le vrai chiffre est au poste (registre, fiche de campagne).
          </p>
        )}
        <p className="mt-3 rounded-md bg-appbg p-3 text-sm text-gray-800">
          <span className="font-semibold">Que faire ?</span> {queFaire}
          {!correction?.corrigeable && " Le trimestre se recalcule ensuite tout seul : ce chiffre ne se tape jamais au trimestre."}
        </p>
        {erreur && <p className="mt-2 text-sm text-red-800">{erreur}</p>}
      </div>
    </section>
  );
}

/**
 * LA CORRECTION AU TRIMESTRE d'une case calculée (21 octobre 2026) : le chef de
 * la section, sur ordre du DD — ou la demande de cet ordre.
 */
export function CorrectionAuTrimestre({
  correction: c,
  periode,
  cellule,
  onCorrige,
}: {
  correction: InfoCorrection;
  periode: { annee: number; trimestre: number };
  cellule: { numero: number; ligne: string; colonne: string };
  onCorrige?: () => void;
}) {
  const [form, setForm] = useState<{ valeur: string; motif: string; source: string } | null>(null);
  const [annulation, setAnnulation] = useState<string | null>(null);
  const [demande, setDemande] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const corps = { annee: periode.annee, trimestre: periode.trimestre, numeroTableau: cellule.numero, ligne: cellule.ligne, colonne: cellule.colonne };
  const nb = (n: number | null) => (n == null ? "rien" : f(n));

  async function envoyer(url: string, methode: "POST" | "DELETE", donnees: Record<string, unknown>, apres: string) {
    setErreur(null);
    setOccupe(true);
    try {
      const r = await fetch(url, { method: methode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(donnees) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message ?? "Impossible pour le moment.");
      setMessage(apres);
      setForm(null);
      setAnnulation(null);
      setDemande(null);
      onCorrige?.();
    } catch (e) {
      setErreur(
        typeof navigator !== "undefined" && !navigator.onLine ? "Une correction au trimestre demande du réseau : réessayez une fois connecté." : e instanceof Error ? e.message : "Impossible pour le moment."
      );
    } finally {
      setOccupe(false);
    }
  }

  if (!c.corrigeable) return null;
  const e = c.existante;

  return (
    <div className="rounded-md border border-sky-300 bg-sky-50 p-3 text-sm text-sky-950">
      <p className="font-bold">Corriger au trimestre</p>
      {c.estChef && c.aOrdre && !c.raison && <p className="mt-1 font-semibold text-green-800">✓ Révision ouverte : vous pouvez corriger ce chiffre.</p>}
      {!c.estChef && <OrdreDuDD correction={c} periode={periode} onFait={onCorrige} />}

      {e && (
        <div className={`mt-2 rounded-md p-2 ${e.conflit ? "bg-red-50 text-red-900" : "bg-white"}`}>
          <p>
            <b>Corrigé au trimestre : {f(e.valeur)}</b> — le mensuel donnait {nb(e.valeurMensuelle)}
            {e.conflit ? <>, il donne <b>maintenant {nb(e.mensuelActuel)}</b> : confirmez votre correction ou annulez-la.</> : "."}
          </p>
          <p className="mt-0.5 text-xs">
            Motif : {e.motif} · Source : {e.source} · {e.auteur ? `par ${e.auteur}, ` : ""}le {new Date(e.le).toLocaleDateString("fr-FR")}
          </p>
        </div>
      )}

      {c.estChef && c.raison && <p className="mt-2 rounded-md bg-amber-50 p-2 font-semibold text-amber-900">{c.raison}</p>}

      {c.peutCorriger && !form && annulation == null && (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setForm({ valeur: e ? String(e.valeur) : "", motif: e?.motif ?? "", source: e?.source ?? "" })}
            className="min-h-[40px] rounded-btn bg-primary px-3 font-semibold text-white hover:bg-primary-hover"
          >
            {e ? "Modifier la correction" : "Inscrire le vrai chiffre"}
          </button>
          {e?.conflit && (
            <button
              type="button"
              disabled={occupe}
              onClick={() => void envoyer("/api/trimestre/correction-case", "POST", { ...corps, valeur: e.valeur, motif: e.motif, source: e.source }, "Correction confirmée.")}
              className="min-h-[40px] rounded-btn border border-primary bg-white px-3 font-semibold text-primary"
            >
              Confirmer ma correction
            </button>
          )}
          {e && (
            <button type="button" onClick={() => setAnnulation("")} className="min-h-[40px] px-3 text-sm font-semibold text-red-800 underline">
              Annuler la correction
            </button>
          )}
        </div>
      )}

      {form && (
        <div className="mt-2 space-y-2">
          <label className="block text-[13px] font-bold">
            Le vrai chiffre
            <input
              inputMode="decimal"
              value={form.valeur}
              onChange={(ev) => setForm({ ...form, valeur: ev.target.value })}
              placeholder={c.mensuel != null ? `le mensuel donne ${f(c.mensuel)}` : "0 si l'activité était nulle"}
              className="mt-1 block min-h-[44px] w-40 rounded-input border border-gray-300 bg-white px-3 text-[15px] font-normal tabular-nums"
            />
          </label>
          <label className="block text-[13px] font-bold">
            Motif (obligatoire)
            <textarea
              rows={2}
              value={form.motif}
              onChange={(ev) => setForm({ ...form, motif: ev.target.value })}
              placeholder="Ex. : campagne de vaccination de septembre non inscrite au rapport mensuel"
              className="mt-1 block w-full rounded-input border border-gray-300 bg-white px-3 py-2 text-sm font-normal"
            />
          </label>
          <label className="block text-[13px] font-bold">
            D&apos;où vient le vrai chiffre (obligatoire)
            <input
              value={form.source}
              onChange={(ev) => setForm({ ...form, source: ev.target.value })}
              placeholder="Ex. : registre de vaccination du poste"
              className="mt-1 block min-h-[44px] w-full rounded-input border border-gray-300 bg-white px-3 text-sm font-normal"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={occupe || !form.valeur.trim() || form.motif.trim().length < 5 || form.source.trim().length < 3}
              onClick={() => void envoyer("/api/trimestre/correction-case", "POST", { ...corps, ...form }, "Correction enregistrée : le DD est prévenu ; l'arrondissement la verra au bilan de la révision.")}
              className="min-h-[44px] flex-1 rounded-btn bg-primary px-3 font-semibold text-white disabled:opacity-50"
            >
              {occupe ? "Enregistrement…" : "Enregistrer la correction"}
            </button>
            <button type="button" onClick={() => setForm(null)} className="min-h-[44px] flex-1 rounded-btn border border-gray-300 bg-white px-3">
              Annuler
            </button>
          </div>
        </div>
      )}

      {annulation != null && (
        <div className="mt-2 space-y-2">
          <textarea
            rows={2}
            value={annulation}
            onChange={(ev) => setAnnulation(ev.target.value)}
            placeholder="Pourquoi annuler la correction (obligatoire)"
            className="block w-full rounded-input border border-gray-300 bg-white px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={occupe || annulation.trim().length < 5}
              onClick={() => void envoyer("/api/trimestre/correction-case", "DELETE", { ...corps, motif: annulation }, "Correction annulée : la case reprend le chiffre du mensuel.")}
              className="min-h-[44px] flex-1 rounded-btn bg-red-700 px-3 font-semibold text-white disabled:opacity-50"
            >
              Annuler la correction
            </button>
            <button type="button" onClick={() => setAnnulation(null)} className="min-h-[44px] flex-1 rounded-btn border border-gray-300 bg-white px-3">
              Garder
            </button>
          </div>
        </div>
      )}

      {/* Révision fermée : le chef la demande. */}
      {c.estChef && !c.aOrdre && (
        c.demandeEnCours ? (
          <p className="mt-2">Votre demande de révision est chez le DD : vous serez prévenu de sa réponse.</p>
        ) : demande == null ? (
          <div className="mt-2">
            <p>Pour corriger ce chiffre, il faut que le Délégué départemental ouvre la révision de votre section (après le dépôt de tous les rapports des DA).</p>
            <button type="button" onClick={() => setDemande(c.motifPropose)} className="mt-2 min-h-[40px] rounded-btn border border-primary bg-white px-3 font-semibold text-primary">
              Demander au DD d&apos;ouvrir la révision
            </button>
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            <textarea
              rows={2}
              value={demande}
              onChange={(ev) => setDemande(ev.target.value)}
              placeholder="Ce que vous voulez corriger, et pourquoi (ex. : vaccinations de Fongo-Tongo absentes du mensuel)"
              className="block w-full rounded-input border border-gray-300 bg-white px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={occupe}
                onClick={() =>
                  void envoyer(
                    "/api/trimestre/circuit",
                    "POST",
                    { annee: periode.annee, trimestre: periode.trimestre, action: "demanderOrdre", motif: demande },
                    "Demande envoyée au DD : vous serez prévenu de sa réponse."
                  )
                }
                className="min-h-[44px] flex-1 rounded-btn bg-primary px-3 font-semibold text-white disabled:opacity-50"
              >
                Envoyer la demande
              </button>
              <button type="button" onClick={() => setDemande(null)} className="min-h-[44px] flex-1 rounded-btn border border-gray-300 bg-white px-3">
                Annuler
              </button>
            </div>
          </div>
        )
      )}

      {message && <p className="mt-2 font-semibold text-green-800">{message}</p>}
      {erreur && <p className="mt-2 font-semibold text-red-800">{erreur}</p>}
    </div>
  );
}

/**
 * LE DD OUVRE LA RÉVISION D'ICI (21 octobre 2026) : sans attendre de demande,
 * et sans aller chercher l'écran du circuit. Un mot est proposé, modifiable.
 */
function OrdreDuDD({ correction: c, periode, onFait }: { correction: InfoCorrection; periode: { annee: number; trimestre: number }; onFait?: () => void }) {
  const moi = useUtilisateur();
  const [motif, setMotif] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  if (moi?.role !== "DD" || !c.chef || !c.section) {
    return <p className="mt-1 text-xs">Seul le chef de la section corrige ce chiffre au trimestre, pendant la révision ouverte par le DD.</p>;
  }
  async function agir(action: "ordonnerCorrection" | "revoquerOrdre", texte?: string) {
    setErreur(null);
    setOccupe(true);
    try {
      const r = await fetch("/api/trimestre/circuit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annee: periode.annee, trimestre: periode.trimestre, action, section: c.section, motif: texte }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message ?? "Impossible pour le moment.");
      setMotif(null);
      onFait?.();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Impossible pour le moment.");
    } finally {
      setOccupe(false);
    }
  }
  return (
    <div className="mt-2">
      {c.ordreEnCours ? (
        <>
          <p>
            <b>Révision ouverte au chef {c.section}</b> : il corrige les tableaux de sa section pour ce trimestre.
          </p>
          <button
            type="button"
            disabled={occupe}
            onClick={() => {
              if (window.confirm(`Fermer la révision du chef ${c.section} ? Ses corrections déjà faites restent, et chaque DA reçoit le bilan.`)) void agir("revoquerOrdre");
            }}
            className="mt-2 min-h-[40px] rounded-btn border border-gray-600 bg-white px-3 font-semibold text-gray-800"
          >
            Fermer la révision
          </button>
        </>
      ) : motif == null ? (
        <>
          {c.demande ? (
            <p>
              <b>Le chef {c.section} vous demande d&apos;ouvrir la révision</b> : « {c.demande.motif} »
            </p>
          ) : (
            <p>C&apos;est le chef {c.section} qui corrige ce chiffre, pendant la révision que vous lui ouvrez (après le dépôt de tous les rapports des DA).</p>
          )}
          <button
            type="button"
            onClick={() => setMotif(c.demande?.motif ?? c.motifPropose)}
            className="mt-2 min-h-[44px] rounded-btn bg-green-700 px-4 font-semibold text-white hover:bg-green-800"
          >
            Ouvrir la révision au chef {c.section}
          </button>
        </>
      ) : (
        <div className="space-y-2">
          <textarea rows={2} value={motif} placeholder="Un mot (facultatif)" onChange={(ev) => setMotif(ev.target.value)} className="block w-full rounded-input border border-gray-300 bg-white px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={occupe}
              onClick={() => void agir("ordonnerCorrection", motif)}
              className="min-h-[44px] flex-1 rounded-btn bg-green-700 px-3 font-semibold text-white disabled:opacity-50"
            >
              {occupe ? "Envoi…" : "Ouvrir la révision"}
            </button>
            <button type="button" onClick={() => setMotif(null)} className="min-h-[44px] flex-1 rounded-btn border border-gray-300 bg-white px-3">
              Annuler
            </button>
          </div>
        </div>
      )}
      {erreur && <p className="mt-2 font-semibold text-red-800">{erreur}</p>}
    </div>
  );
}
