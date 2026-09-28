"use client";

/**
 * Rédaction des rubriques du rapport trimestriel.
 *
 * Refonte demandée par le Délégué (28 septembre 2026) : sur téléphone, une
 * section ouverte empilait onze grandes cases vides, chacune répétant
 * « Laissez vide : le document portera Néant ». Désormais :
 *   - une LIGNE par rubrique, avec son état (à rédiger, rédigée, modèle,
 *     automatique, facultative) ; on la touche, et elle seule s'ouvre ;
 *   - « Enregistrer et rubrique suivante » enchaîne sans remonter ;
 *   - les rubriques facultatives (vides, elles n'écrivent rien) en fin de
 *     section ; la règle du « Néant » dite une fois par section ;
 *   - « Voir le tableau » quand la rubrique présente un tableau du canevas ;
 *   - la période repliée dans une bande.
 *
 * L'enregistrement se fait à la sortie du champ ou au bouton, jamais à chaque
 * frappe : la connexion est mauvaise sur le terrain.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { lireAvecCopie, envoyer, enAttente } from "@/lib/trimestreHorsLigne";
import HorsLigneTrimestre from "@/components/HorsLigneTrimestre";

interface Zone {
  cle: string;
  consigne: string;
  sectionCle: string;
  sectionTitre: string;
  contexte: string;
  fixe: boolean;
  /** Vide, elle n'écrit rien au document. */
  facultative?: boolean;
  /** Le tableau que la rubrique présente, collé à elle dans le canevas. */
  tableau?: { numero: number; titre: string } | null;
  contenu: string;
  /** Le texte de référence, déjà mis à la période ; null s'il n'y en a pas. */
  reference: string | null;
  /** Ce qui a été écrit au trimestre précédent. */
  precedent: string | null;
  /** Le texte rédigé AUTOMATIQUEMENT à partir du rapport (les conclusions). */
  automatique: string | null;
}

interface Etat {
  periode?: { annee: number; trimestre: number; libelle: string };
  pour?: "departement" | "arrondissement";
  zones?: Zone[];
  total?: number;
  message?: string;
}

type Statut = "a_rediger" | "redigee" | "modele" | "automatique" | "facultative";

const STATUTS: Record<Statut, { texte: string; classe: string; point: string }> = {
  a_rediger: { texte: "À rédiger", classe: "bg-amber-100 text-amber-900", point: "bg-amber-500" },
  redigee: { texte: "Rédigée", classe: "bg-green-100 text-green-800", point: "bg-green-600" },
  modele: { texte: "Texte modèle", classe: "bg-blue-50 text-blue-800", point: "bg-blue-500" },
  automatique: { texte: "Automatique · à relire", classe: "bg-green-50 text-green-800", point: "bg-green-500" },
  facultative: { texte: "Facultative", classe: "bg-gray-100 text-gray-600", point: "bg-gray-300" },
};

const ORDINAL = ["1er", "2e", "3e", "4e"];

/** Les rôles qui ouvrent l'écran des tableaux du trimestre. */
const VOIENT_LES_TABLEAUX = ["DD", "CHEF_BAC", "DA", "AGENT_SAISIE"];

export default function RubriquesTrimestreClient({
  annee,
  trimestre,
  username,
  role = "",
}: {
  annee: number;
  trimestre: number;
  username: string;
  /** Pour savoir si le lien « Voir le tableau » mène quelque part. */
  role?: string;
}) {
  const router = useRouter();
  const [choix, setChoix] = useState({ annee, trimestre });
  const [changerPeriode, setChangerPeriode] = useState(false);
  const [etat, setEtat] = useState<Etat | null>(null);
  const [chargement, setChargement] = useState(true);
  const [sectionsOuvertes, setSectionsOuvertes] = useState<Set<string>>(new Set());
  const [zoneOuverte, setZoneOuverte] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<"toutes" | "a_rediger">("toutes");
  const [enCours, setEnCours] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Ce qui est affiché dans les champs, avant enregistrement.
  const [saisie, setSaisie] = useState<Record<string, string>>({});
  const dernierEnregistre = useRef<Record<string, string>>({});
  const [copieDu, setCopieDu] = useState<string | null>(null);

  const charger = useCallback(async (c: { annee: number; trimestre: number }) => {
    setChargement(true);
    let data: Etat;
    try {
      const lu = await lireAvecCopie<Etat>(username, `/api/trimestre/rubriques?annee=${c.annee}&trimestre=${c.trimestre}`);
      data = lu.donnees;
      setCopieDu(lu.copieDu);
    } catch (e) {
      data = { message: e instanceof Error ? e.message : "Chargement impossible." };
    }
    setEtat(data);
    const initial: Record<string, string> = {};
    for (const z of data.zones ?? []) initial[z.cle] = z.contenu;
    dernierEnregistre.current = { ...initial };
    // Ce qui a été écrit hors ligne et attend le réseau : c'est le dernier état.
    for (const op of await enAttente(username)) {
      const k = op.corps as { annee?: number; trimestre?: number; cle?: string; contenu?: string };
      if (op.refusee || !op.cle.startsWith("texte|") || k.annee !== c.annee || k.trimestre !== c.trimestre || !k.cle) continue;
      initial[k.cle] = k.contenu ?? "";
      dernierEnregistre.current[k.cle] = k.contenu ?? "";
    }
    setSaisie(initial);
    setChargement(false);
  }, [username]);

  useEffect(() => { void charger(choix); }, [choix, charger]);

  const statutDe = useCallback(
    (z: Zone): Statut => {
      if ((saisie[z.cle] ?? "").trim()) return "redigee";
      if (z.automatique) return "automatique";
      if (z.reference) return "modele";
      if (z.facultative) return "facultative";
      return "a_rediger";
    },
    [saisie]
  );

  /** Reprend un texte dans la zone, pour le corriger ; il est enregistré aussitôt. */
  function reprendre(cle: string, texte: string) {
    const actuel = (saisie[cle] ?? "").trim();
    if (actuel && !window.confirm("Remplacer ce qui est déjà écrit dans cette rubrique ?")) return;
    setSaisie((x) => ({ ...x, [cle]: texte }));
    void enregistrer(cle, texte);
  }

  async function enregistrer(cle: string, force?: string) {
    const contenu = force ?? saisie[cle] ?? "";
    // Rien n'a changé depuis le dernier enregistrement : ne pas écrire pour rien.
    if (contenu === (dernierEnregistre.current[cle] ?? "")) return;
    setEnCours(cle);
    setMessage(null);
    const zone = etat?.zones?.find((z) => z.cle === cle);
    const resultat = await envoyer(username, {
      cle: `texte|${choix.annee}|${choix.trimestre}|${cle}`,
      methode: "PUT",
      url: "/api/trimestre/rubriques",
      corps: { ...choix, cle, contenu },
      libelle: `Texte — ${zone?.contexte ?? cle}`,
    });
    if (resultat.statut === "refuse") {
      setMessage(resultat.message);
    } else {
      dernierEnregistre.current[cle] = contenu;
      setMessage(
        resultat.statut === "en_file"
          ? "Pas de réseau : texte gardé sur ce téléphone, envoyé seul au retour du réseau."
          : resultat.statut === "ignore"
            ? "Une version plus récente de ce texte existe sur le serveur : elle est conservée."
            : "Enregistré."
      );
      if (resultat.statut === "ignore") void charger(choix);
    }
    setEnCours(null);
  }

  // Les sections, dans l'ordre du canevas ; dans chacune, les rubriques
  // facultatives en dernier.
  const sections = useMemo(() => {
    const m = new Map<string, { titre: string; zones: Zone[] }>();
    for (const z of etat?.zones ?? []) {
      const e = m.get(z.sectionCle) ?? { titre: z.sectionTitre, zones: [] };
      e.zones.push(z);
      m.set(z.sectionCle, e);
    }
    return Array.from(m.entries()).map(([cle, s]) => ({
      cle,
      titre: s.titre,
      zones: [...s.zones.filter((z) => !z.facultative), ...s.zones.filter((z) => z.facultative)],
    }));
  }, [etat]);

  // L'ordre de lecture, pour « rubrique suivante ».
  const ordre = useMemo(() => sections.flatMap((s) => s.zones), [sections]);
  const aRediger = ordre.filter((z) => statutDe(z) === "a_rediger").length;
  const pretes = ordre.length - aRediger;

  async function enregistrerEtSuivante(cle: string) {
    await enregistrer(cle);
    // La suivante à rédiger, à partir d'ici ; à défaut, simplement la suivante.
    const i = ordre.findIndex((z) => z.cle === cle);
    const apres = ordre.slice(i + 1);
    const suivante = apres.find((z) => statutDe(z) === "a_rediger") ?? apres[0];
    if (!suivante) {
      setZoneOuverte(null);
      return;
    }
    setSectionsOuvertes((s) => new Set(s).add(suivante.sectionCle));
    setZoneOuverte(suivante.cle);
    setTimeout(() => document.getElementById(`rubrique-${suivante.cle}`)?.scrollIntoView({ block: "start", behavior: "smooth" }), 50);
  }

  async function voirTableau(cle: string, numero: number) {
    await enregistrer(cle); // rien de ce qui est écrit ne se perd en changeant d'écran
    router.push(`/trimestre/saisie?tableau=${numero}`);
  }

  if (chargement && !etat) return <p className="text-sm text-ink-muted">Chargement…</p>;
  if (etat?.message && !etat.zones) {
    return <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">{etat.message}</p>;
  }

  return (
    <div className="max-w-4xl">
      <HorsLigneTrimestre username={username} copieDu={copieDu} onEnvoye={() => void charger(choix)} />

      {/* ---- La période, repliée en une bande ---- */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line bg-white px-3 py-2 text-sm">
        <span className="font-semibold text-primary-dark">
          {ORDINAL[choix.trimestre - 1]} trimestre {choix.annee}
          {etat?.pour === "arrondissement" ? " · votre arrondissement" : ""}
        </span>
        <button type="button" onClick={() => setChangerPeriode((v) => !v)} className="text-xs font-medium text-primary underline">
          {changerPeriode ? "fermer" : "changer de période"}
        </button>
        {changerPeriode && (
          <span className="flex w-full flex-wrap gap-2">
            <input
              type="number"
              aria-label="Année"
              className="w-24 rounded border border-gray-300 px-2 py-1.5"
              value={choix.annee}
              onChange={(e) => setChoix({ ...choix, annee: Number(e.target.value) })}
            />
            <select
              aria-label="Trimestre"
              className="rounded border border-gray-300 px-2 py-1.5"
              value={choix.trimestre}
              onChange={(e) => setChoix({ ...choix, trimestre: Number(e.target.value) })}
            >
              {[1, 2, 3, 4].map((t) => <option key={t} value={t}>{ORDINAL[t - 1]} trimestre</option>)}
            </select>
          </span>
        )}
      </div>

      {/* ---- Où l'on en est ---- */}
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-200">
        <div className="h-full bg-primary transition-all" style={{ width: ordre.length ? `${Math.round((pretes / ordre.length) * 100)}%` : "0%" }} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filtrer les rubriques">
        {([
          ["toutes", `Toutes · ${ordre.length}`],
          ["a_rediger", `À rédiger · ${aRediger}`],
        ] as const).map(([cle, texte]) => (
          <button
            key={cle}
            type="button"
            onClick={() => setFiltre(cle)}
            aria-pressed={filtre === cle}
            className={`rounded-full border px-3 py-1.5 text-sm ${filtre === cle ? "border-primary bg-primary text-white" : "border-line bg-white text-ink-muted"}`}
          >
            {texte}
          </button>
        ))}
      </div>

      {/* ---- Les sections ---- */}
      {sections.map((s) => {
        const zones = filtre === "a_rediger" ? s.zones.filter((z) => statutDe(z) === "a_rediger") : s.zones;
        if (zones.length === 0) return null;
        const restantes = s.zones.filter((z) => statutDe(z) === "a_rediger").length;
        const ouverte = sectionsOuvertes.has(s.cle);
        const premiereFacultative = zones.findIndex((z) => z.facultative);
        return (
          <section key={s.cle} className="mt-3 rounded-lg border border-gray-200 bg-white">
            <button
              type="button"
              onClick={() => {
                const n = new Set(sectionsOuvertes);
                if (n.has(s.cle)) n.delete(s.cle); else n.add(s.cle);
                setSectionsOuvertes(n);
              }}
              aria-expanded={ouverte}
              className="flex min-h-[52px] w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
            >
              <span className="text-sm font-semibold text-primary-dark">{s.titre}</span>
              <span className={`shrink-0 text-xs font-medium ${restantes ? "text-amber-800" : "text-green-700"}`}>
                {restantes ? `${restantes} à rédiger` : "✓ prête"} {ouverte ? "▾" : "▸"}
              </span>
            </button>

            {ouverte && (
              <div className="border-t border-gray-100">
                <p className="px-4 pt-2 text-xs text-ink-muted">
                  Laissée vide, une rubrique porte « Néant. » dans le document ; une rubrique facultative n&apos;écrit rien.
                </p>
                <ul className="py-1">
                  {zones.map((z, i) => {
                    const statut = STATUTS[statutDe(z)];
                    const active = zoneOuverte === z.cle;
                    return (
                      <li key={z.cle} id={`rubrique-${z.cle}`} className="scroll-mt-4">
                        {i === premiereFacultative && (
                          <p className="px-4 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wide text-ink-faint">Facultatives</p>
                        )}
                        <button
                          type="button"
                          onClick={() => setZoneOuverte(active ? null : z.cle)}
                          aria-expanded={active}
                          className={`flex min-h-[48px] w-full items-center gap-3 px-4 py-2 text-left ${active ? "bg-primary-light" : "hover:bg-gray-50"}`}
                        >
                          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${statut.point}`} />
                          <span className="flex-1 text-sm text-gray-900">{z.contexte}</span>
                          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${statut.classe}`}>{statut.texte}</span>
                        </button>

                        {active && (
                          <div className="border-y border-primary/20 bg-white px-4 pb-4 pt-2">
                            <p className="text-xs italic text-ink-muted">{z.consigne}</p>

                            <div className="mt-2 flex flex-wrap gap-2">
                              {z.tableau && VOIENT_LES_TABLEAUX.includes(role) && (
                                <button
                                  type="button"
                                  onClick={() => void voirTableau(z.cle, z.tableau!.numero)}
                                  className="rounded border border-primary px-2 py-1 text-xs font-medium text-primary hover:bg-primary-light"
                                >
                                  Voir le tableau : {z.tableau.titre}
                                </button>
                              )}
                              {z.reference && (
                                <button
                                  type="button"
                                  onClick={() => reprendre(z.cle, z.reference!)}
                                  className="rounded border border-primary px-2 py-1 text-xs text-primary hover:bg-primary hover:text-white"
                                >
                                  Reprendre le texte modèle
                                </button>
                              )}
                              {z.precedent && (
                                <button
                                  type="button"
                                  onClick={() => reprendre(z.cle, z.precedent!)}
                                  className="rounded border border-gray-400 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                                >
                                  Reprendre le texte du trimestre précédent
                                </button>
                              )}
                            </div>

                            {z.automatique && !(saisie[z.cle] ?? "").trim() ? (
                              <div className="mt-2">
                                <p className="mb-1 text-xs font-semibold text-green-800">
                                  Rédigée automatiquement à partir du rapport — elle suit les chiffres toute seule.
                                </p>
                                <p className="whitespace-pre-line rounded border border-green-200 bg-green-50 p-3 text-sm text-gray-900">{z.automatique}</p>
                                <button
                                  type="button"
                                  onClick={() => setSaisie({ ...saisie, [z.cle]: z.automatique! })}
                                  className="mt-2 rounded border border-gray-400 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                                >
                                  Modifier ce texte
                                </button>
                              </div>
                            ) : (
                              <>
                                {z.automatique && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSaisie({ ...saisie, [z.cle]: "" });
                                      void enregistrer(z.cle, "");
                                    }}
                                    className="mt-2 rounded border border-green-700 px-2 py-1 text-xs text-green-800 hover:bg-green-50"
                                  >
                                    Revenir au texte automatique
                                  </button>
                                )}
                                <textarea
                                  autoFocus
                                  className="mt-2 w-full rounded border border-gray-300 px-3 py-2 text-[15px] leading-relaxed focus:border-primary focus:outline-none"
                                  rows={Math.min(12, Math.max(5, Math.ceil((saisie[z.cle] ?? "").length / 70) + 2))}
                                  value={saisie[z.cle] ?? ""}
                                  onChange={(e) => setSaisie({ ...saisie, [z.cle]: e.target.value })}
                                  onBlur={() => void enregistrer(z.cle)}
                                  placeholder={
                                    z.reference
                                      ? "Vide : le texte modèle figurera dans le document."
                                      : z.facultative
                                        ? "Facultative : vide, rien n'est écrit."
                                        : "Écrivez ici. Vide, le document portera « Néant. »."
                                  }
                                />
                              </>
                            )}

                            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                              <button
                                type="button"
                                disabled={enCours === z.cle}
                                onClick={() => void enregistrerEtSuivante(z.cle)}
                                className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60 sm:w-auto"
                              >
                                {enCours === z.cle ? "Enregistrement…" : "Enregistrer et rubrique suivante →"}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  void enregistrer(z.cle);
                                  setZoneOuverte(null);
                                }}
                                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-700 sm:w-auto"
                              >
                                Fermer
                              </button>
                              <span className="text-[11px] text-ink-muted sm:ml-auto">
                                {(saisie[z.cle] ?? "").trim() ? `${(saisie[z.cle] ?? "").trim().length} caractères` : ""}
                              </span>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>
        );
      })}

      {filtre === "a_rediger" && aRediger === 0 && (
        <p className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          Plus aucune rubrique à rédiger. Relisez les autres avec le filtre « Toutes ».
        </p>
      )}

      {message && <p className="mt-4 text-sm text-gray-700" role="status">{message}</p>}
    </div>
  );
}
