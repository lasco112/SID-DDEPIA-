"use client";

/**
 * Importer un RÉPERTOIRE DES ACTEURS EPIA (fichier Word du canevas régional)
 * dans le registre d'un arrondissement — demande du Délégué, 12 novembre 2026.
 *
 * 1. On choisit le fichier : le SID le lit et montre, filière par filière, ce
 *    qu'il a trouvé (rien n'est encore écrit). Un acteur déjà au registre est
 *    décoché d'office.
 * 2. On garde ce qu'il faut, puis « Inscrire » : les acteurs entrent au
 *    registre, marqués « à vérifier par le DA » dans leurs observations.
 *
 * Il faut le réseau (le fichier part au serveur) ; le registre, lui, reste
 * consultable sans réseau comme avant.
 */
import { useState } from "react";
import { FileUp } from "lucide-react";
import { TYPES_ACTEURS } from "@/lib/acteurs";
import { champsRepertoire, valeurEnClair, type FicheRepertoire } from "@/lib/repertoire";
import { telechargerBootstrap } from "@/lib/offlineStore";

interface Proposition {
  typeCode: string;
  nom: string;
  proprietaire: string | null;
  telephone: string | null;
  village: string | null;
  especes: string[];
  fiche: FicheRepertoire | null;
  villageId: string | null;
  villageAutre: string | null;
  localite: string;
  doublon: "registre" | "fichier" | null;
}

const resumeFiche = (p: Proposition) =>
  champsRepertoire(p.typeCode)
    .filter((c) => p.fiche?.[c.code] != null && p.fiche?.[c.code] !== "")
    .slice(0, 6)
    .map((c) => `${c.libelle.replace(/ \(.*\)$/, "").replace("Effectifs — ", "")} : ${valeurEnClair(c, p.fiche![c.code])}`)
    .join(" · ");

export default function ImportRepertoire({
  arrondissementId,
  nomArrondissement,
  onFini,
}: {
  arrondissementId: string;
  nomArrondissement: string;
  onFini: () => void | Promise<void>;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [fichier, setFichier] = useState<File | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<string | null>(null);
  const [analyse, setAnalyse] = useState<{ fichier: string; propositions: Proposition[] } | null>(null);
  const [gardes, setGardes] = useState<Set<number>>(new Set());

  async function lire() {
    if (!fichier) return;
    setEnCours(true);
    setErreur(null);
    setResultat(null);
    try {
      const f = new FormData();
      f.append("fichier", fichier);
      f.append("arrondissementId", arrondissementId);
      const r = await fetch("/api/etablissements/repertoire", { method: "POST", body: f });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setErreur(d.message ?? "Le fichier n'a pas pu être lu.");
      const props = d.propositions as Proposition[];
      if (!props.length) return setErreur("Aucun acteur trouvé dans ce fichier : est-ce bien le répertoire du canevas régional (tableaux « N° | Nom et prénoms du promoteur | … ») ?");
      setAnalyse({ fichier: d.fichier, propositions: props });
      setGardes(new Set(props.map((p, i) => (p.doublon ? -1 : i)).filter((i) => i >= 0)));
    } catch {
      setErreur("Pas de réseau : l'import du répertoire demande une connexion.");
    } finally {
      setEnCours(false);
    }
  }

  async function inscrire() {
    if (!analyse) return;
    setEnCours(true);
    setErreur(null);
    try {
      const lignes = analyse.propositions.filter((_, i) => gardes.has(i));
      const r = await fetch("/api/etablissements/repertoire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arrondissementId, fichier: analyse.fichier, lignes }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setErreur(d.message ?? "L'inscription n'a pas abouti.");
      setAnalyse(null);
      setFichier(null);
      setResultat(
        `${d.inscrits} acteur(s) inscrit(s) au registre de ${nomArrondissement}${d.ignores?.length ? ` ; ${d.ignores.length} laissé(s) de côté (déjà au registre ou illisibles)` : ""}. ` +
          "Chacun porte « à vérifier par le DA » : celui qui n'est plus en activité se désactive avec « Actif — désactiver »."
      );
      // Les téléphones et cet écran relisent le registre.
      await telechargerBootstrap().catch(() => undefined);
      await onFini();
    } catch {
      setErreur("Pas de réseau : rien n'a été inscrit.");
    } finally {
      setEnCours(false);
    }
  }

  const basculer = (i: number) =>
    setGardes((g) => {
      const n = new Set(g);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  const parType = analyse
    ? TYPES_ACTEURS.map((t) => ({ t, lignes: analyse.propositions.map((p, i) => ({ p, i })).filter(({ p }) => p.typeCode === t.code) })).filter((g) => g.lignes.length)
    : [];

  return (
    <div data-visite="import-repertoire" className="mt-8 rounded-lg border border-gray-200 bg-white p-4">
      {!ouvert ? (
        <button
          type="button"
          onClick={() => setOuvert(true)}
          className="flex min-h-[44px] items-center gap-2 rounded-btn border border-primary px-4 text-sm font-semibold text-primary hover:bg-primary-light"
        >
          <FileUp size={18} /> Importer un répertoire des acteurs (fichier Word)
        </button>
      ) : (
        <>
          <h3 className="text-sm font-bold text-primary-dark">Importer un répertoire des acteurs — {nomArrondissement}</h3>
          <p className="mt-1 text-xs text-gray-600">
            Le fichier Word du canevas régional (porciculteurs, poulets, petits ruminants, bovins, apiculteurs, aquaculteurs…). Le SID montre ce qu&apos;il a trouvé,
            filière par filière ; vous décochez ce qu&apos;il ne faut pas inscrire. Les coordonnées X / Y du papier ne sont pas reprises : la position se prend sur place, avec le téléphone.
          </p>
          {!analyse && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => setFichier(e.target.files?.[0] ?? null)} className="text-sm" />
              <button
                type="button"
                disabled={!fichier || enCours}
                onClick={() => void lire()}
                className="min-h-[40px] rounded-btn bg-primary px-4 text-sm font-semibold text-white disabled:bg-gray-300"
              >
                {enCours ? "Lecture…" : "Lire le fichier"}
              </button>
              <button type="button" onClick={() => setOuvert(false)} className="min-h-[40px] rounded-btn border border-gray-300 px-3 text-sm">
                Fermer
              </button>
            </div>
          )}
          {erreur && <p className="mt-2 text-sm font-semibold text-red-700">{erreur}</p>}
          {resultat && <p className="mt-2 text-sm font-semibold text-green-800">{resultat}</p>}

          {analyse && (
            <div className="mt-3">
              <p className="text-sm text-gray-700">
                <b>{analyse.propositions.length}</b> acteur(s) trouvé(s) dans « {analyse.fichier} » ; <b>{gardes.size}</b> coché(s) pour l&apos;inscription.
              </p>
              {parType.map(({ t, lignes }) => (
                <div key={t.code} className="mt-3">
                  <p className="text-[13px] font-bold text-ink">
                    {t.pluriel} — {lignes.length}
                  </p>
                  <div className="mt-1 overflow-x-auto rounded border border-gray-200">
                    <table className="w-full border-collapse text-[13px]">
                      <thead>
                        <tr className="bg-gray-50 text-left">
                          <th className="w-8 border-b px-2 py-1"></th>
                          <th className="border-b px-2 py-1">Nom</th>
                          <th className="border-b px-2 py-1">Téléphone</th>
                          <th className="border-b px-2 py-1">Village</th>
                          <th className="border-b px-2 py-1">Fiche du répertoire</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lignes.map(({ p, i }) => (
                          <tr key={i} className={gardes.has(i) ? "" : "bg-gray-50 text-gray-400"}>
                            <td className="border-b px-2 py-1">
                              <input type="checkbox" aria-label={`Inscrire ${p.nom}`} checked={gardes.has(i)} onChange={() => basculer(i)} className="h-4 w-4" />
                            </td>
                            <td className="border-b px-2 py-1 font-medium">
                              {p.nom}
                              {p.especes.length > 0 && p.typeCode === "ETAB_PETITS_RUMINANTS" && <span className="ml-1 text-[11px] text-ink-muted">({p.especes.join(", ").toLowerCase()})</span>}
                              {p.doublon && (
                                <span className="ml-1 rounded bg-amber-100 px-1 text-[11px] font-semibold text-amber-800">
                                  {p.doublon === "registre" ? "déjà au registre" : "deux fois dans le fichier"}
                                </span>
                              )}
                            </td>
                            <td className="border-b px-2 py-1">{p.telephone ?? "—"}</td>
                            <td className="border-b px-2 py-1">
                              {p.localite}
                              <span className="block text-[11px] text-ink-muted">{p.villageId ? "liste officielle" : p.villageAutre ? "autre village" : "village à préciser"}</span>
                            </td>
                            <td className="border-b px-2 py-1 text-[12px] text-gray-600">{resumeFiche(p) || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={enCours || gardes.size === 0}
                  onClick={() => void inscrire()}
                  className="min-h-[44px] rounded-btn bg-primary px-4 text-sm font-semibold text-white disabled:bg-gray-300"
                >
                  {enCours ? "Inscription…" : `Inscrire les ${gardes.size} acteur(s) coché(s) au registre de ${nomArrondissement}`}
                </button>
                <button type="button" onClick={() => setAnalyse(null)} className="min-h-[44px] rounded-btn border border-gray-300 px-3 text-sm">
                  Annuler
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

