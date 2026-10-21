"use client";

/**
 * L'écran des collectes ponctuelles du DD (21 octobre 2026) : lancer, suivre,
 * relancer, clôturer, exporter.
 */
import { useCallback, useEffect, useState } from "react";
import { Megaphone, RefreshCw, FileDown } from "lucide-react";
import { TYPES_ACTEURS } from "@/lib/acteurs";

interface Ligne {
  arrondissementId: string;
  nom: string;
  fiches: number;
  completes: number;
  avecGps: number;
  avecPhoto: number;
  auRegistre: number;
  auteurs: string[];
  derniere: string | null;
  details: { id: string; nom: string; complete: boolean; gps: boolean; photo: boolean }[];
}
interface CollecteLue {
  id: string;
  titre: string;
  consigne: string | null;
  typeCode: string;
  arrondissementIds: string[];
  roles: string[];
  debut: string;
  fin: string;
  prioritaire: boolean;
  clotureeLe: string | null;
  etat: "a_venir" | "en_cours" | "terminee";
  lien: string;
  avancement: { lignes: Ligne[]; total: { fiches: number; completes: number; arrondissementsActifs: number } } | null;
}

const QUESTIONNAIRES = [...TYPES_ACTEURS].sort((a, b) => Number(b.code === "ETAB_MARCHE") - Number(a.code === "ETAB_MARCHE"));
const TITRES: Record<string, string> = { ETAB_MARCHE: "Recensement des marchés" };
const CONSIGNES: Record<string, string> = {
  ETAB_MARCHE: "Recensez tous les marchés de votre arrondissement : remplissez la fiche sur place, et prenez la position GPS au milieu du marché.",
};
const ROLES = [
  { code: "AGENT_SAISIE", libelle: "Agents de saisie" },
  { code: "DA", libelle: "Délégués d'arrondissement" },
];
const ETATS = {
  en_cours: { texte: "En cours", classe: "bg-green-100 text-green-800" },
  a_venir: { texte: "À venir", classe: "bg-blue-100 text-blue-800" },
  terminee: { texte: "Terminée", classe: "bg-gray-200 text-gray-700" },
};

const jour = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const periode = (c: { debut: string; fin: string }) => (c.debut === c.fin ? `le ${jour(c.debut)}` : `du ${jour(c.debut)} au ${jour(c.fin)}`);
const heure = (iso: string) => new Date(iso).toLocaleString("fr-FR", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Douala" });

export default function CollectesClient({
  arrondissements,
  aujourdhui,
  demain,
}: {
  arrondissements: { id: string; nom: string }[];
  aujourdhui: string;
  demain: string;
}) {
  const [collectes, setCollectes] = useState<CollecteLue[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [form, setForm] = useState({
    typeCode: "ETAB_MARCHE",
    titre: TITRES.ETAB_MARCHE,
    consigne: CONSIGNES.ETAB_MARCHE,
    arrondissementIds: arrondissements.map((a) => a.id),
    roles: ["AGENT_SAISIE", "DA"],
    debut: aujourdhui,
    fin: demain,
    prioritaire: true,
  });
  const [ouverte, setOuverte] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const r = await fetch("/api/collectes", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message ?? "Chargement impossible.");
      setCollectes(j.collectes);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Chargement impossible.");
    }
  }, []);
  useEffect(() => {
    void charger();
    // L'avancement se met à jour seul, toutes les minutes.
    const t = window.setInterval(() => void charger(), 60_000);
    return () => window.clearInterval(t);
  }, [charger]);

  async function lancer() {
    setErreur(null);
    setMessage(null);
    const qui = ROLES.filter((r) => form.roles.includes(r.code)).map((r) => r.libelle.toLowerCase()).join(" et ");
    const ou = form.arrondissementIds.length === arrondissements.length ? `les ${arrondissements.length} arrondissements` : `${form.arrondissementIds.length} arrondissement(s)`;
    if (!window.confirm(`Lancer « ${form.titre} » ${periode(form)} pour ${ou} (${qui}) ?\nChacun recevra une notification tout de suite.`)) return;
    setOccupe(true);
    try {
      const r = await fetch("/api/collectes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message ?? "La collecte n'a pas pu être lancée.");
      setMessage(`« ${form.titre} » est lancée : ${j.notifies} personne(s) prévenue(s).`);
      await charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "La collecte n'a pas pu être lancée.");
    } finally {
      setOccupe(false);
    }
  }

  async function agir(c: CollecteLue, action: "relancer" | "relancerRetardataires" | "cloturer") {
    setErreur(null);
    setMessage(null);
    const question = {
      relancer: `Relancer tous ceux qui collectent « ${c.titre} » ?`,
      relancerRetardataires: "Relancer les arrondissements qui n'ont encore envoyé aucune fiche ?",
      cloturer: `Clôturer « ${c.titre} » maintenant ? Elle disparaîtra de l'accueil des agents ; les fiches restent au registre.`,
    }[action];
    if (!window.confirm(question)) return;
    try {
      const r = await fetch(`/api/collectes/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message ?? "Action impossible.");
      setMessage(action === "cloturer" ? `« ${c.titre} » est clôturée.` : j.notifies ? `${j.notifies} personne(s) relancée(s).` : "Personne à relancer : tous les arrondissements ont commencé.");
      await charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Action impossible.");
    }
  }

  const basculer = (cle: "arrondissementIds" | "roles", v: string) =>
    setForm((f) => ({ ...f, [cle]: f[cle].includes(v) ? f[cle].filter((x) => x !== v) : [...f[cle], v] }));

  return (
    <div className="space-y-6">
      {/* ---- Lancer une collecte ---- */}
      <section className="rounded-card border border-line bg-white p-4 shadow-card sm:p-5">
        <h2 className="flex items-center gap-2 text-[17px] font-bold text-primary-dark">
          <Megaphone size={20} /> Lancer une collecte
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-[13px] font-bold text-ink">
            Questionnaire
            <select
              value={form.typeCode}
              onChange={(e) => setForm((f) => ({ ...f, typeCode: e.target.value, titre: TITRES[e.target.value] ?? `Recensement : ${TYPES_ACTEURS.find((t) => t.code === e.target.value)?.pluriel.toLowerCase()}`, consigne: CONSIGNES[e.target.value] ?? "" }))}
              className="mt-1 block min-h-[44px] w-full rounded-input border border-gray-300 bg-white px-2 text-sm font-normal"
            >
              {QUESTIONNAIRES.map((q) => (
                <option key={q.code} value={q.code}>
                  {q.pluriel}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[13px] font-bold text-ink">
            Titre
            <input value={form.titre} onChange={(e) => setForm((f) => ({ ...f, titre: e.target.value }))} className="mt-1 block min-h-[44px] w-full rounded-input border border-gray-300 px-3 text-sm font-normal" />
          </label>
          <label className="text-[13px] font-bold text-ink sm:col-span-2">
            Consigne (ce que les agents liront)
            <textarea rows={2} value={form.consigne} onChange={(e) => setForm((f) => ({ ...f, consigne: e.target.value }))} className="mt-1 block w-full rounded-input border border-gray-300 px-3 py-2 text-sm font-normal" />
          </label>
          <div>
            <p className="text-[13px] font-bold text-ink">Arrondissements</p>
            <label className="mt-1 flex min-h-[32px] items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={form.arrondissementIds.length === arrondissements.length}
                onChange={(e) => setForm((f) => ({ ...f, arrondissementIds: e.target.checked ? arrondissements.map((a) => a.id) : [] }))}
                className="h-4 w-4"
              />
              Tous ({arrondissements.length})
            </label>
            <div className="mt-1 flex flex-wrap gap-x-5">
              {arrondissements.map((a) => (
                <label key={a.id} className="flex min-h-[32px] items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.arrondissementIds.includes(a.id)} onChange={() => basculer("arrondissementIds", a.id)} className="h-4 w-4" />
                  {a.nom}
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-[13px] font-bold text-ink">Qui collecte</p>
              {ROLES.map((r) => (
                <label key={r.code} className="flex min-h-[32px] items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.roles.includes(r.code)} onChange={() => basculer("roles", r.code)} className="h-4 w-4" />
                  {r.libelle}
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-[13px] font-bold text-ink">
                Premier jour
                <input type="date" value={form.debut} onChange={(e) => setForm((f) => ({ ...f, debut: e.target.value }))} className="mt-1 block min-h-[44px] w-full rounded-input border border-gray-300 px-2 text-sm font-normal" />
              </label>
              <label className="text-[13px] font-bold text-ink">
                Dernier jour
                <input type="date" value={form.fin} onChange={(e) => setForm((f) => ({ ...f, fin: e.target.value }))} className="mt-1 block min-h-[44px] w-full rounded-input border border-gray-300 px-2 text-sm font-normal" />
              </label>
            </div>
            <label className="flex min-h-[32px] items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={form.prioritaire} onChange={(e) => setForm((f) => ({ ...f, prioritaire: e.target.checked }))} className="h-4 w-4" />
              Activité prioritaire (en tête de l&apos;accueil)
            </label>
          </div>
        </div>
        <button
          type="button"
          disabled={occupe}
          onClick={() => void lancer()}
          className="mt-4 flex min-h-[48px] items-center gap-2 rounded-btn bg-primary px-5 text-[15px] font-bold text-white hover:bg-primary-hover disabled:opacity-50"
        >
          <Megaphone size={18} /> {occupe ? "Lancement…" : "Lancer la collecte"}
        </button>
      </section>

      {erreur && <p role="alert" className="rounded-input bg-red-50 p-3 text-sm text-red-800">{erreur}</p>}
      {message && <p className="rounded-input bg-green-50 p-3 text-sm text-green-800">{message}</p>}

      {/* ---- Les collectes ---- */}
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-[17px] font-bold text-primary-dark">Les collectes</h2>
          <button type="button" onClick={() => void charger()} className="flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
            <RefreshCw size={14} /> Actualiser
          </button>
        </div>
        {collectes == null ? (
          <p className="text-sm text-ink-muted">Chargement…</p>
        ) : collectes.length === 0 ? (
          <p className="text-sm text-ink-muted">Aucune collecte pour l&apos;instant.</p>
        ) : (
          <div className="space-y-4">
            {collectes.map((c) => (
              <article key={c.id} className="rounded-card border border-line bg-white p-4 shadow-card">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[16px] font-bold text-nuit">
                      {c.titre} {c.prioritaire && <span className="ml-1 rounded-full bg-cuivre px-2 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-white">Prioritaire</span>}
                    </p>
                    <p className="text-sm text-ink-muted">
                      {periode(c)} · {TYPES_ACTEURS.find((t) => t.code === c.typeCode)?.pluriel ?? c.typeCode} ·{" "}
                      {ROLES.filter((r) => c.roles.includes(r.code)).map((r) => r.libelle.toLowerCase()).join(" et ")}
                    </p>
                  </div>
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${ETATS[c.etat].classe}`}>{ETATS[c.etat].texte}</span>
                </div>
                {c.consigne && <p className="mt-2 rounded-input bg-appbg p-2 text-sm text-ink">{c.consigne}</p>}

                {c.avancement && (
                  <>
                    <p className="mt-3 text-sm font-semibold text-ink">
                      {c.avancement.total.fiches} fiche(s) reçue(s), dont {c.avancement.total.completes} complète(s) · {c.avancement.total.arrondissementsActifs} arrondissement(s) sur {c.avancement.lignes.length} ont commencé
                    </p>
                    <div className="mt-2 overflow-x-auto rounded-input border border-gray-200">
                      <table className="w-full border-collapse text-sm">
                        <thead>
                          <tr className="bg-gray-50 text-left">
                            <th className="border-b px-3 py-2">Arrondissement</th>
                            <th className="border-b px-3 py-2 text-right">Fiches</th>
                            <th className="border-b px-3 py-2 text-right">Complètes</th>
                            <th className="border-b px-3 py-2 text-right">GPS</th>
                            <th className="border-b px-3 py-2 text-right">Photo</th>
                            <th className="border-b px-3 py-2 text-right" title="Établissements de ce type au registre, en tout">Au registre</th>
                            <th className="border-b px-3 py-2">Par</th>
                            <th className="border-b px-3 py-2">Dernière fiche</th>
                          </tr>
                        </thead>
                        <tbody>
                          {c.avancement.lignes.map((l) => (
                            <tr key={l.arrondissementId} className={l.fiches === 0 ? "bg-amber-50/60" : ""}>
                              <td className="border-b border-gray-100 px-3 py-2 font-medium">
                                {l.fiches > 0 ? (
                                  <button type="button" onClick={() => setOuverte(ouverte === `${c.id}:${l.arrondissementId}` ? null : `${c.id}:${l.arrondissementId}`)} className="text-left text-primary hover:underline">
                                    {l.nom}
                                  </button>
                                ) : (
                                  l.nom
                                )}
                                {ouverte === `${c.id}:${l.arrondissementId}` && (
                                  <ul className="mt-1 space-y-0.5 text-[12px] font-normal text-ink">
                                    {l.details.map((d) => (
                                      <li key={d.id}>
                                        {d.nom} — {d.complete ? "complète" : "incomplète"}
                                        {!d.gps && " · sans GPS"}
                                        {d.photo && " · photo"}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </td>
                              <td className="border-b border-gray-100 px-3 py-2 text-right tabular-nums font-semibold">{l.fiches}</td>
                              <td className="border-b border-gray-100 px-3 py-2 text-right tabular-nums">{l.completes}</td>
                              <td className="border-b border-gray-100 px-3 py-2 text-right tabular-nums">{l.avecGps}</td>
                              <td className="border-b border-gray-100 px-3 py-2 text-right tabular-nums">{l.avecPhoto}</td>
                              <td className="border-b border-gray-100 px-3 py-2 text-right tabular-nums text-ink-muted">{l.auRegistre}</td>
                              <td className="border-b border-gray-100 px-3 py-2 text-[12px]">{l.auteurs.join(", ") || "—"}</td>
                              <td className="border-b border-gray-100 px-3 py-2 text-[12px]">{l.derniere ? heure(l.derniere) : <span className="font-semibold text-amber-800">aucune encore</span>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  {c.etat === "en_cours" && (
                    <>
                      <button type="button" onClick={() => void agir(c, "relancerRetardataires")} className="min-h-[40px] rounded-btn border border-primary bg-white px-3 text-sm font-semibold text-primary hover:bg-primary-light">
                        Relancer ceux qui n&apos;ont rien envoyé
                      </button>
                      <button type="button" onClick={() => void agir(c, "relancer")} className="min-h-[40px] rounded-btn border border-gray-300 bg-white px-3 text-sm font-semibold text-ink hover:bg-gray-50">
                        Relancer tout le monde
                      </button>
                    </>
                  )}
                  <a href={`/api/etablissements/liste?typeCode=${c.typeCode}&arrondissementId=TOUS&format=xlsx`} className="flex min-h-[40px] items-center gap-1 rounded-btn border border-gray-300 bg-white px-3 text-sm font-semibold text-primary hover:bg-gray-50">
                    <FileDown size={15} /> Excel
                  </a>
                  {c.typeCode === "ETAB_MARCHE" ? (
                    <a href={`/api/etablissements/liste?typeCode=ETAB_MARCHE&arrondissementId=TOUS&format=pdf&fiches=1`} className="flex min-h-[40px] items-center gap-1 rounded-btn border border-gray-300 bg-white px-3 text-sm font-semibold text-primary hover:bg-gray-50">
                      <FileDown size={15} /> Fiches PDF
                    </a>
                  ) : (
                    <a href={`/api/etablissements/liste?typeCode=${c.typeCode}&arrondissementId=TOUS&format=pdf`} className="flex min-h-[40px] items-center gap-1 rounded-btn border border-gray-300 bg-white px-3 text-sm font-semibold text-primary hover:bg-gray-50">
                      <FileDown size={15} /> Liste PDF
                    </a>
                  )}
                  {c.etat !== "terminee" && (
                    <button type="button" onClick={() => void agir(c, "cloturer")} className="min-h-[40px] px-3 text-sm font-semibold text-statut-rejeteText hover:underline">
                      Clôturer maintenant
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
