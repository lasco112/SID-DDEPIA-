"use client";

/**
 * Le circuit de validation du rapport trimestriel, vu par chacun.
 *
 *   agent de saisie → prépare ;  DA → relit et transmet ;
 *   chef de section → valide son domaine ;  DD → relit et produit le définitif.
 *
 * Même écran pour tous : chacun voit où en est le trimestre, et seuls les
 * boutons de SON étape sont actifs.
 */

import { useCallback, useEffect, useState } from "react";
import { trimestreARapporter } from "@/lib/trimestreEchu";
import { lireAvecCopie } from "@/lib/trimestreHorsLigne";
import HorsLigneTrimestre from "@/components/HorsLigneTrimestre";
import VisiteGuidee from "@/components/VisiteGuidee";

interface Arrondissement {
  id: string;
  nom: string;
  statut: "EN_PREPARATION" | "TRANSMIS" | "RENVOYE";
  date: string | null;
  auteur: string | null;
  motif: string | null;
  parLeDD: boolean;
  /** Le DD, pour un rapport renvoyé : ce que l'arrondissement a corrigé depuis le renvoi. */
  corrections?: { cases: number; tableaux: number[] };
}

interface Section {
  code: string;
  chef: string;
  nom: string;
  statut: "EN_ATTENTE" | "A_VALIDER" | "VALIDE";
  date: string | null;
  auteur: string | null;
  parLeDD: boolean;
  motif: string | null;
  /** L'ordre de correction du DD en cours pour ce chef (20 octobre 2026). */
  ordre?: { motif: string; le: string; auteur: string | null } | null;
}

interface Etat {
  periode: string;
  role: string;
  arrondissements: Arrondissement[];
  sections: Section[];
  tousTransmis: boolean;
  complet: boolean;
  peut: { transmettre: boolean; renvoyer: boolean; valider: boolean; annulerSection: string | null; relaisDD: boolean };
  /** Les tableaux où le DA doit encore inscrire le chiffre de l'an passé (obligatoire avant de transmettre). */
  aCompleterAnPasse?: { numero: number; titre: string }[];
  /** « T3 2025 ». */
  periodeN1?: string;
  /** Les chiffres qui se contredisent, dans le ressort de ce profil (20 octobre 2026). */
  incoherences?: { numero: number; titre: string; texte: string; arrondissement: string | null }[];
}

/**
 * Le titre de l'écran dit ce que CE rôle vient y faire (demande du Délégué,
 * 27 septembre 2026 : « circuit » ne parlait à personne). Mêmes mots que le menu.
 */
const TITRE_PAR_ROLE: Record<string, string> = {
  DA: "Transmettre mon rapport au DD",
  DD: "Suivre l'avancement du trimestre",
  CHEF_BAC: "Valider ma section",
  CHEF_PSA: "Valider ma section",
  CHEF_SPAIH: "Valider ma section",
  CHEF_SSV: "Valider ma section",
};

const BADGE_ARR: Record<Arrondissement["statut"], { texte: string; classe: string }> = {
  EN_PREPARATION: { texte: "En préparation", classe: "bg-amber-100 text-amber-900" },
  TRANSMIS: { texte: "Transmis au DD", classe: "bg-green-100 text-green-800" },
  RENVOYE: { texte: "Renvoyé pour correction", classe: "bg-red-100 text-red-800" },
};
const BADGE_SECTION: Record<Section["statut"], { texte: string; classe: string }> = {
  EN_ATTENTE: { texte: "En attente des arrondissements", classe: "bg-gray-100 text-gray-700" },
  A_VALIDER: { texte: "À valider", classe: "bg-amber-100 text-amber-900" },
  VALIDE: { texte: "Validé", classe: "bg-green-100 text-green-800" },
};

const ETAPES = [
  ["Agent de saisie", "prépare le rapport de son arrondissement : saisie trimestrielle, analyses, textes."],
  ["Délégué d'arrondissement", "relit l'ensemble, corrige s'il le juge utile, puis transmet au DD."],
  ["Chef de section", "une fois tous les arrondissements transmis, relit et valide son domaine du rapport départemental."],
  ["Délégué départemental", "relit le document final et produit la version définitive."],
];

const le = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("fr-FR") : "");

export default function CircuitTrimestreClient({ username }: { username: string }) {
  const [{ annee, trimestre }, setPeriode] = useState(() => trimestreARapporter());
  const [etat, setEtat] = useState<Etat | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [renvoi, setRenvoi] = useState<{ id: string; motif: string } | null>(null);
  /** Le DD valide les corrections d'un rapport renvoyé (20 octobre 2026). */
  const [validation, setValidation] = useState<{ id: string; commentaire: string } | null>(null);
  /** Le DD rédige un ordre de correction pour un chef. */
  const [ordre, setOrdre] = useState<{ code: string; motif: string } | null>(null);
  /** Le DD prend le relais : quelle étape, et pourquoi. */
  const [relais, setRelais] = useState<{ cle: string; corps: Record<string, unknown>; motif: string } | null>(null);

  const [copieDu, setCopieDu] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setErreur(null);
    try {
      const lu = await lireAvecCopie<Etat>(username, `/api/trimestre/circuit?annee=${annee}&trimestre=${trimestre}`);
      setEtat(lu.donnees);
      setCopieDu(lu.copieDu);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Chargement impossible.");
    }
  }, [annee, trimestre, username]);

  useEffect(() => {
    void charger();
  }, [charger]);

  async function agir(corps: Record<string, unknown>, confirmation?: string) {
    // Transmettre, valider, renvoyer engagent le circuit : jamais mis en file,
    // toujours faits avec le réseau, pour que chacun voie le même état.
    if (!navigator.onLine) {
      setErreur("Cette étape demande du réseau : elle engage le circuit de validation. Réessayez une fois connecté.");
      return;
    }
    if (confirmation && !window.confirm(confirmation)) return;
    setOccupe(true);
    setErreur(null);
    setMessage(null);
    try {
      const r = await fetch("/api/trimestre/circuit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annee, trimestre, ...corps }),
      });
      if (!r.ok) {
        setErreur((await r.json().catch(() => ({}))).message ?? "Action impossible.");
        return;
      }
      setMessage("Enregistré.");
      setRenvoi(null);
      setRelais(null);
      await charger();
    } catch {
      setErreur("Pas de connexion : rien n'a été enregistré. Réessayez quand le réseau revient.");
    } finally {
      setOccupe(false);
    }
  }

  /** Le formulaire « en tant que DD » : un motif, puis la confirmation. */
  function formulaireRelais(cle: string, libelle: string, corps: Record<string, unknown>) {
    if (!etat?.peut.relaisDD) return null;
    if (relais?.cle !== cle) {
      return (
        <button
          type="button"
          onClick={() => setRelais({ cle, corps, motif: "" })}
          data-visite="circuit-relais"
          className="mt-2 rounded border border-blue-700 px-2 py-1 text-xs text-blue-800 hover:bg-blue-50"
        >
          {libelle}
        </button>
      );
    }
    return (
      <div className="mt-2">
        <textarea
          value={relais.motif}
          onChange={(e) => setRelais({ ...relais, motif: e.target.value })}
          rows={2}
          placeholder="Motif (obligatoire) : pourquoi vous prenez le relais."
          className="w-full rounded border border-gray-300 p-2 text-sm"
        />
        <div className="mt-1 flex gap-2">
          <button
            type="button"
            disabled={occupe || !relais.motif.trim()}
            onClick={() => void agir({ ...relais.corps, motif: relais.motif })}
            className="flex-1 rounded-md bg-blue-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {libelle}
          </button>
          <button type="button" onClick={() => setRelais(null)} className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm">
            Annuler
          </button>
        </div>
      </div>
    );
  }

  if (erreur && !etat) return <p className="rounded-md bg-red-50 p-4 text-sm text-red-800">{erreur}</p>;
  if (!etat) return <p className="text-gray-600">Chargement…</p>;

  const sien = etat.role === "DA" || etat.role === "AGENT_SAISIE" ? etat.arrondissements[0] : null;

  return (
    <div className="max-w-3xl">
      <HorsLigneTrimestre username={username} copieDu={copieDu} />
      <VisiteGuidee ecran="circuit" />
      <h1 className="text-2xl font-bold text-primary-dark">{TITRE_PAR_ROLE[etat.role] ?? "Avancement du rapport trimestriel"}</h1>
      <p className="mt-1 text-sm text-gray-600">Rapport trimestriel · {etat.periode}</p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
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

      <ol data-visite="circuit-etapes" className="mt-4 space-y-1 rounded-md border border-gray-200 bg-white p-3 text-sm text-gray-700">
        {ETAPES.map(([qui, quoi], i) => (
          <li key={qui}>
            <strong>
              {i + 1}. {qui}
            </strong>{" "}
            {quoi}
          </li>
        ))}
      </ol>

      {erreur && <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800">{erreur}</p>}
      {message && <p className="mt-3 rounded-md bg-green-50 p-3 text-sm text-green-800">{message}</p>}

      {/* Des chiffres qui se contredisent : rien ne se transmet, ne se valide ni ne se finalise avant leur correction. */}
      {(etat.incoherences?.length ?? 0) > 0 && (
        <div role="alert" className="mt-4 rounded-input border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          <p className="font-semibold">
            {etat.incoherences!.length === 1 ? "Un chiffre se contredit" : `${etat.incoherences!.length} chiffres se contredisent`} : à corriger
            avant de {etat.role === "DD" ? "finaliser" : etat.role.startsWith("CHEF_") ? "valider votre section" : "transmettre"}.
          </p>
          <ul className="mt-2 list-disc space-y-0.5 pl-5">
            {etat.incoherences!.slice(0, 12).map((e, i) => (
              <li key={`${e.numero}-${i}`}>
                Tableau n° {e.numero} — {e.texte}
              </li>
            ))}
          </ul>
          {etat.incoherences!.length > 12 && <p className="mt-1">… et {etat.incoherences!.length - 12} autre(s).</p>}
          <p className="mt-2">
            {etat.role === "DD"
              ? "Souvent un mois corrigé après la saisie des catégories du trimestre. Renvoyez le rapport de l'arrondissement concerné, ou donnez un ordre de correction au chef de la section."
              : etat.role.startsWith("CHEF_")
                ? "Signalez la case à l'arrondissement ou renvoyez-lui son rapport. Pour un écart avec le BAC, le chef BAC confirme son chiffre ou le corrige."
                : "Touchez la case grise du tableau pour voir, mois par mois, d'où vient le total."}
          </p>
          <a href="/trimestre/saisie" className="mt-2 inline-block font-semibold text-primary underline">
            Ouvrir les tableaux du trimestre →
          </a>
        </div>
      )}

      {/* ---- L'arrondissement de l'agent ou du DA ---- */}
      {sien && (
        <section data-visite="circuit-sien" className="mt-5 rounded-md border border-gray-200 bg-white p-4">
          <h2 className="font-semibold text-gray-900">Rapport de l&apos;arrondissement de {sien.nom}</h2>
          <p className="mt-2">
            <span className={`rounded px-2 py-0.5 text-xs font-semibold ${BADGE_ARR[sien.statut].classe}`}>
              {BADGE_ARR[sien.statut].texte}
            </span>
            {sien.date && (
              <span className="ml-2 text-xs text-gray-500">
                le {le(sien.date)}
                {sien.parLeDD ? ", par le Délégué départemental à votre place" : sien.auteur ? `, par ${sien.auteur}` : ""}
              </span>
            )}
          </p>
          {sien.parLeDD && sien.motif && (
            <p className="mt-2 rounded-md bg-blue-50 p-3 text-sm text-blue-900">Motif du DD : {sien.motif}</p>
          )}
          {sien.statut === "RENVOYE" && sien.motif && (
            <p className="mt-2 rounded-md bg-red-50 p-3 text-sm text-red-800">Motif du renvoi : {sien.motif}</p>
          )}
          {sien.statut === "TRANSMIS" ? (
            <p className="mt-2 text-sm text-gray-700">Le rapport est transmis : il n&apos;est plus modifiable, sauf renvoi par le DD ou un chef de section.</p>
          ) : etat.role === "AGENT_SAISIE" ? (
            <p className="mt-2 text-sm text-gray-700">
              Remplissez la saisie trimestrielle, validez les analyses et relisez les textes. Votre DA relira l&apos;ensemble puis le transmettra.
            </p>
          ) : (
            <p className="mt-2 text-sm text-gray-700">
              Vos agents ont préparé le rapport. Relisez la saisie, les analyses et les textes, produisez un aperçu à l&apos;étape 4, « Vérifier et télécharger mon rapport », puis transmettez.
            </p>
          )}
          {etat.peut.transmettre && (etat.aCompleterAnPasse?.length ?? 0) > 0 && (
            <div role="alert" className="mt-3 rounded-input border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">
                Avant de transmettre : inscrivez le chiffre de l&apos;an passé ({etat.periodeN1}) de votre arrondissement dans{" "}
                {etat.aCompleterAnPasse!.length === 1 ? "ce tableau" : `ces ${etat.aCompleterAnPasse!.length} tableaux`}. Le SID ne
                l&apos;a pas encore ; si l&apos;activité était nulle, inscrivez 0.
              </p>
              <ul className="mt-2 list-disc space-y-0.5 pl-5">
                {etat.aCompleterAnPasse!.map((m) => (
                  <li key={m.numero}>
                    Tableau n° {m.numero} — {m.titre}
                  </li>
                ))}
              </ul>
              <a href="/trimestre/saisie" className="mt-2 inline-block font-semibold text-primary underline">
                Compléter les tableaux du trimestre →
              </a>
            </div>
          )}
          {etat.peut.transmettre && (
            <button
              type="button"
              disabled={occupe}
              onClick={() =>
                void agir(
                  { action: "transmettre" },
                  "Transmettre le rapport trimestriel au Délégué départemental ? Il ne sera plus modifiable, sauf renvoi."
                )
              }
              data-visite="circuit-transmettre"
              className="mt-3 w-full rounded-md bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50 sm:w-auto"
            >
              Transmettre au Délégué départemental
            </button>
          )}
        </section>
      )}

      {/* ---- Les six arrondissements (chefs et DD) ---- */}
      {!sien && (
        <section className="mt-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Rapports des arrondissements</h2>
          <ul data-visite="circuit-arrondissements" className="mt-2 divide-y divide-gray-100 rounded-md border border-gray-200 bg-white">
            {etat.arrondissements.map((a) => (
              <li key={a.id} className="px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-900">{a.nom}</span>
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${BADGE_ARR[a.statut].classe}`}>{BADGE_ARR[a.statut].texte}</span>
                </div>
                {a.date && (
                  <p className="text-xs text-gray-500">
                    le {le(a.date)}
                    {a.parLeDD ? ", transmis par le DD à la place du DA" : a.auteur ? `, par ${a.auteur}` : ""}
                  </p>
                )}
                {a.motif && <p className={`mt-1 text-xs ${a.parLeDD ? "text-blue-800" : "text-red-800"}`}>Motif : {a.motif}</p>}
                {a.statut === "RENVOYE" && etat.peut.relaisDD && (
                  <div className="mt-2 rounded-input border border-green-200 bg-green-50 p-3">
                    <p className="text-sm text-green-900">
                      {a.corrections && a.corrections.cases > 0
                        ? `Depuis le renvoi, l'arrondissement a modifié ${a.corrections.cases} case${a.corrections.cases > 1 ? "s" : ""} — tableau${a.corrections.tableaux.length > 1 ? "x" : ""} n° ${a.corrections.tableaux.join(", ")}.`
                        : "Aucune case modifiée dans la saisie trimestrielle depuis le renvoi (les textes et les analyses ont pu l'être)."}
                    </p>
                    {validation?.id === a.id ? (
                      <div className="mt-2">
                        <textarea
                          value={validation.commentaire}
                          onChange={(e) => setValidation({ id: a.id, commentaire: e.target.value })}
                          rows={2}
                          placeholder="Note pour le DA (facultatif)"
                          className="w-full rounded border border-gray-300 p-2 text-sm"
                        />
                        <div className="mt-1 flex gap-2">
                          <button
                            type="button"
                            disabled={occupe}
                            onClick={() => {
                              void agir({ action: "validerCorrections", arrondissementId: a.id, motif: validation.commentaire });
                              setValidation(null);
                            }}
                            className="flex-1 rounded-md bg-green-700 px-3 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50"
                          >
                            Confirmer : les corrections sont bonnes
                          </button>
                          <button type="button" onClick={() => setValidation(null)} className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm">
                            Annuler
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        data-visite="circuit-valider-corrections"
                        onClick={() => setValidation({ id: a.id, commentaire: "" })}
                        className="mt-2 min-h-[40px] rounded-md bg-green-700 px-3 py-2 text-sm font-semibold text-white hover:bg-green-800"
                      >
                        Valider les corrections et le rapport
                      </button>
                    )}
                  </div>
                )}
                {a.statut === "EN_PREPARATION" && formulaireRelais(`arr-${a.id}`, "Transmettre en tant que DD", { action: "transmettre", arrondissementId: a.id })}
                {etat.peut.renvoyer && a.statut === "TRANSMIS" && (
                  renvoi?.id === a.id ? (
                    <div className="mt-2">
                      <textarea
                        value={renvoi.motif}
                        onChange={(e) => setRenvoi({ id: a.id, motif: e.target.value })}
                        rows={3}
                        placeholder="Ce que le DA doit corriger."
                        className="w-full rounded border border-gray-300 p-2 text-sm"
                      />
                      <div className="mt-1 flex gap-2">
                        <button
                          type="button"
                          disabled={occupe || !renvoi.motif.trim()}
                          onClick={() => void agir({ action: "renvoyer", arrondissementId: a.id, motif: renvoi.motif })}
                          className="flex-1 rounded-md bg-red-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          Renvoyer au DA
                        </button>
                        <button type="button" onClick={() => setRenvoi(null)} className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm">
                          Annuler
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setRenvoi({ id: a.id, motif: "" })}
                      data-visite="circuit-renvoyer"
                      className="mt-2 rounded border border-red-700 px-2 py-1 text-xs text-red-800 hover:bg-red-50"
                    >
                      Renvoyer pour correction
                    </button>
                  )
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---- Les quatre domaines ---- */}
      <section className="mt-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Validation par les chefs de section</h2>
        <ul data-visite="circuit-sections" className="mt-2 divide-y divide-gray-100 rounded-md border border-gray-200 bg-white">
          {etat.sections.map((s) => (
            <li key={s.code} className="px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-gray-900">
                  <strong>{s.code}</strong> — {s.nom}
                </span>
                <span className={`rounded px-2 py-0.5 text-xs font-semibold ${BADGE_SECTION[s.statut].classe}`}>{BADGE_SECTION[s.statut].texte}</span>
              </div>
              {s.date && (
                <p className="text-xs text-gray-500">
                  le {le(s.date)}
                  {s.parLeDD ? ", validé par le DD à la place du chef" : s.auteur ? `, par ${s.auteur}` : ""}
                </p>
              )}
              {s.parLeDD && s.motif && <p className="mt-1 text-xs text-blue-800">Motif : {s.motif}</p>}
              {s.ordre && (
                <p className="mt-2 rounded-input border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                  <strong>Ordre de correction du DD en cours</strong> depuis le {le(s.ordre.le)} — {s.ordre.motif}.{" "}
                  {s.chef === etat.role
                    ? "Vous pouvez corriger les cases remplies par les arrondissements dans les tableaux de votre section, puis valider à nouveau."
                    : "Le chef peut corriger les cases remplies par les arrondissements."}
                </p>
              )}
              {etat.role === "DD" && s.code !== "BAC" &&
                (s.ordre ? (
                  <button
                    type="button"
                    disabled={occupe}
                    onClick={() =>
                      void agir(
                        { action: "revoquerOrdre", section: s.code },
                        `Révoquer l'ordre de correction du chef ${s.code} ? Il ne pourra plus corriger les cases remplies par les arrondissements.`
                      )
                    }
                    className="mt-2 rounded border border-amber-600 px-2 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-50"
                  >
                    Révoquer l'ordre de correction
                  </button>
                ) : ordre?.code === s.code ? (
                  <div className="mt-2">
                    <textarea
                      value={ordre.motif}
                      onChange={(e) => setOrdre({ code: s.code, motif: e.target.value })}
                      rows={2}
                      placeholder="Ce que le chef doit corriger, et pourquoi (obligatoire)."
                      className="w-full rounded border border-gray-300 p-2 text-sm"
                    />
                    {s.statut === "VALIDE" && (
                      <p className="mt-1 text-xs text-amber-900">Ce domaine est validé : l'ordre lèvera la validation, et le chef devra valider à nouveau.</p>
                    )}
                    <div className="mt-1 flex gap-2">
                      <button
                        type="button"
                        disabled={occupe || !ordre.motif.trim()}
                        onClick={() => {
                          void agir({ action: "ordonnerCorrection", section: s.code, motif: ordre.motif });
                          setOrdre(null);
                        }}
                        className="flex-1 rounded-md bg-amber-700 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
                      >
                        Donner l'ordre de correction
                      </button>
                      <button type="button" onClick={() => setOrdre(null)} className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm">
                        Annuler
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    data-visite="circuit-ordre-correction"
                    onClick={() => setOrdre({ code: s.code, motif: "" })}
                    className="mt-2 ml-0 mr-2 rounded border border-amber-600 px-2 py-1 text-xs text-amber-900 hover:bg-amber-50"
                  >
                    Ordonner une correction au chef
                  </button>
                ))}
              {s.statut !== "VALIDE" && formulaireRelais(`sec-${s.code}`, "Valider en tant que DD", { action: "valider", section: s.code })}
              {s.chef === etat.role && etat.peut.valider && (
                <button
                  type="button"
                  disabled={occupe}
                  onClick={() =>
                    void agir(
                      { action: "valider" },
                      "Valider votre domaine du rapport trimestriel ? Ses analyses et ses textes ne seront plus modifiables."
                    )
                  }
                  data-visite="circuit-valider"
                  className="mt-2 w-full rounded-md bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50 sm:w-auto"
                >
                  Valider ma section
                </button>
              )}
              {s.statut === "VALIDE" && (etat.peut.annulerSection === "toutes" || etat.peut.annulerSection === s.code) && (
                <button
                  type="button"
                  disabled={occupe}
                  onClick={() => void agir({ action: "annuler", section: s.code }, "Annuler la validation de ce domaine ?")}
                  className="mt-2 rounded border border-gray-400 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                >
                  Annuler la validation
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {etat.role === "DD" && (
        <p className={`mt-5 rounded-md p-3 text-sm ${etat.complet ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-900"}`}>
          {etat.complet
            ? "Le circuit est achevé : vous pouvez produire la version définitive à l'étape 4, « Produire le rapport du département »."
            : "Tant que le circuit n'est pas achevé, l'étape 4 « Produire le rapport du département » ne donne qu'un aperçu, marqué PROVISOIRE."}
        </p>
      )}
      {etat.role === "DD" && !etat.complet && (
        <section className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          <p>
            Exceptionnellement, si un DA ou un chef de section ne franchit pas son étape, vous pouvez prendre le
            relais : chaque étape sera marquée « par le DD », avec votre motif, et l&apos;intéressé prévenu.
          </p>
          {formulaireRelais("tout", "Finaliser tout le circuit en tant que DD", { action: "finaliser" })}
        </section>
      )}
    </div>
  );
}
