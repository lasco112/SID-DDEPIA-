"use client";

/**
 * FormNominatif.tsx — rendu générique des tableaux NOMINATIF (CDC §M2).
 * Une ligne par établissement actif du registre (arrondissement du DA),
 * une colonne par FormField. Les champs `typeValeur === "TEXTE"` (ex.
 * Observations) utilisent un champ texte libre et ne passent jamais par
 * `Number()` — même principe que FormMatrice.tsx pour T21_LIEUX.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { offlineDB, trouverSaisieNominatif } from "@/lib/dexie";
import { recalculerDerivesLocaux } from "@/lib/derivationLocale";
import { regleAlimenteeParLeChamp, numeroTableau } from "@/lib/champsDerives";
import { creerEtablissement } from "@/lib/etablissementsLocal";

interface FormFieldDto {
  code: string;
  libelle: string;
  uniteCode: string | null;
  typeValeur: string;
  ordre: number;
}
interface EtablissementDto {
  id: string;
  nom: string;
  localite: string;
}
interface TemplateDto {
  code: string;
  titre: string;
  fields: FormFieldDto[];
  etablissementTypeCode?: string | null;
}

type Cellule = { valeur: string; nonRenseigne: boolean; motifNonRenseigne: string; clientId: string };
type Cle = string; // `${etablissementId}:${fieldCode}`

export default function FormNominatif({
  template,
  periodeId,
  etablissements,
  username,
}: {
  template: TemplateDto;
  periodeId: string;
  etablissements: EtablissementDto[];
  username: string;
}) {
  const [cellules, setCellules] = useState<Record<Cle, Cellule>>({});
  const [auteurs, setAuteurs] = useState<Record<Cle, string>>({});
  const [loading, setLoading] = useState(true);
  const [ajoutes, setAjoutes] = useState<EtablissementDto[]>([]);
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [nomNouveau, setNomNouveau] = useState("");
  const [localiteNouveau, setLocaliteNouveau] = useState("");
  const [ajoutEnCours, setAjoutEnCours] = useState(false);
  const [erreurAjout, setErreurAjout] = useState<string | null>(null);
  /** Identifiants locaux stables par cellule (voir sauvegarder). */
  const idsLocaux = useRef<Record<string, string>>({});

  const tousEtablissements = [...etablissements, ...ajoutes];

  const ajouterEtablissement = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!nomNouveau.trim() || !localiteNouveau.trim()) return;
      if (!template.etablissementTypeCode) return;
      setAjoutEnCours(true);
      setErreurAjout(null);
      try {
        // Enregistrement LOCAL d'abord : l'établissement est utilisable
        // immédiatement, même sans réseau. L'envoi au serveur est empilé et
        // rejoué automatiquement dès le retour de la connexion.
        const meta = await offlineDB.meta.get("bootstrap");
        if (!meta?.arrondissementId) throw new Error("Arrondissement introuvable sur cet appareil.");

        const cree = await creerEtablissement({
          typeCode: template.etablissementTypeCode,
          nom: nomNouveau,
          localite: localiteNouveau,
          arrondissementId: meta.arrondissementId,
        });

        setAjoutes((prev) => [...prev, { id: cree.id, nom: cree.nom, localite: cree.localite }]);
        setNomNouveau("");
        setLocaliteNouveau("");
        setFormulaireOuvert(false);
      } catch (err) {
        setErreurAjout(err instanceof Error ? err.message : "Échec de l'enregistrement local.");
      } finally {
        setAjoutEnCours(false);
      }
    },
    [nomNouveau, localiteNouveau, template.etablissementTypeCode]
  );

  useEffect(() => {
    let annule = false;
    async function charger() {
      setLoading(true);
      const initial: Record<Cle, Cellule> = {};
      const auteursInitial: Record<Cle, string> = {};

      let serveur: Array<{
        etablissementId: string;
        fieldCode: string;
        valeur: string | null;
        valeurTexte: string | null;
        nonRenseigne: boolean;
        motifNonRenseigne: string | null;
        clientId: string;
        saisiPar: { nom: string; username: string } | null;
      }> = [];
      try {
        const res = await fetch(`/api/rapports/mes-saisies?periodeId=${periodeId}&templateCode=${template.code}`);
        if (res.ok) serveur = (await res.json()).nominatif ?? [];
      } catch {
        // hors-ligne
      }
      for (const s of serveur) {
        if (s.saisiPar) auteursInitial[`${s.etablissementId}:${s.fieldCode}`] = s.saisiPar.username === username ? "Vous" : s.saisiPar.nom;
      }

      for (const etab of etablissements) {
        for (const f of template.fields) {
          const texte = f.typeValeur === "TEXTE";
          const cle = `${etab.id}:${f.code}`;
          const local = await trouverSaisieNominatif(username, periodeId, template.code, etab.id, f.code);
          if (local) {
            initial[cle] = {
              valeur: texte ? local.valeurTexte ?? "" : local.valeur == null ? "" : String(local.valeur),
              nonRenseigne: local.nonRenseigne,
              motifNonRenseigne: local.motifNonRenseigne ?? "",
              clientId: local.clientId,
            };
            continue;
          }
          const distant = serveur.find((s) => s.etablissementId === etab.id && s.fieldCode === f.code);
          if (distant) {
            await offlineDB.saisies.put({
              clientId: distant.clientId,
              username,
              periodeId,
              templateCode: template.code,
              famille: "NOMINATIF",
              etablissementId: etab.id,
              fieldCode: f.code,
              valeur: texte ? null : distant.valeur == null ? null : Number(distant.valeur),
              valeurTexte: texte ? distant.valeurTexte ?? null : null,
              nonRenseigne: distant.nonRenseigne,
              motifNonRenseigne: distant.motifNonRenseigne,
              statutLocal: "SYNCHRONISE",
              updatedAt: new Date().toISOString(),
            });
            initial[cle] = {
              valeur: texte ? distant.valeurTexte ?? "" : distant.valeur == null ? "" : String(distant.valeur),
              nonRenseigne: distant.nonRenseigne,
              motifNonRenseigne: distant.motifNonRenseigne ?? "",
              clientId: distant.clientId,
            };
          } else {
            initial[cle] = { valeur: "", nonRenseigne: false, motifNonRenseigne: "", clientId: crypto.randomUUID() };
          }
        }
      }
      if (!annule) {
        setCellules(initial);
        setAuteurs(auteursInitial);
        setLoading(false);
      }
    }
    charger();
    return () => {
      annule = true;
    };
  }, [template.code, template.fields, periodeId, etablissements, username]);

  const sauvegarder = useCallback(
    async (etablissementId: string, fieldCode: string, texte: boolean, patch: Partial<Cellule>) => {
      const cle = `${etablissementId}:${fieldCode}`;
      setCellules((prev) => {
        // L'identifiant local ne doit JAMAIS être tiré au sort ici : React
        // peut exécuter cette fonction deux fois pour un même enregistrement,
        // ce qui créait deux lignes distinctes pour la même cellule dans la
        // base de l'appareil. Le serveur les fusionnait à la synchronisation,
        // le défaut restait donc invisible — jusqu'à ce qu'une somme calculée
        // localement compte la cellule deux fois. On passe par une réserve
        // stable, hors du cycle de rendu.
        const courante = prev[cle] ?? {
          valeur: "",
          nonRenseigne: false,
          motifNonRenseigne: "",
          clientId: (idsLocaux.current[cle] ??= crypto.randomUUID()),
        };
        const nouvelle = { ...courante, ...patch };
        const numVal = nouvelle.valeur.trim() === "" ? null : Number(nouvelle.valeur);

        const ecriture = offlineDB.saisies.put({
          clientId: nouvelle.clientId,
          username,
          periodeId,
          templateCode: template.code,
          famille: "NOMINATIF",
          etablissementId,
          fieldCode,
          valeur: texte || nouvelle.nonRenseigne ? null : numVal,
          valeurTexte: texte && !nouvelle.nonRenseigne ? (nouvelle.valeur.trim() === "" ? null : nouvelle.valeur) : null,
          nonRenseigne: nouvelle.nonRenseigne,
          motifNonRenseigne: nouvelle.nonRenseigne ? nouvelle.motifNonRenseigne || null : null,
          statutLocal: "BROUILLON_LOCAL",
          updatedAt: new Date().toISOString(),
        });

        // Certaines cases du tableau 1.2 sont la somme de ce tableau (1.4 et
        // 1.5). On les recalcule immédiatement, sur l'appareil, pour que les
        // deux tableaux ne puissent jamais se contredire — y compris hors
        // ligne. Sans effet si ce tableau n'alimente aucune case dérivée.
        //
        // Enchaîné sur l'écriture : la somme doit relire une base locale déjà
        // à jour, sinon elle repartirait sur la valeur précédente.
        void ecriture.then(() => recalculerDerivesLocaux(username, periodeId, template.code));

        return { ...prev, [cle]: nouvelle };
      });
    },
    [periodeId, template.code, username]
  );

  if (loading) return <p className="text-sm text-gray-500">Chargement…</p>;

  const boutonAjout = (
    <div className="mb-3">
      {!formulaireOuvert ? (
        <button
          onClick={() => setFormulaireOuvert(true)}
          className="rounded-md border border-primary px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary-light"
        >
          + Ajouter un établissement
        </button>
      ) : (
        <form onSubmit={ajouterEtablissement} className="flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Nom de l'établissement</label>
            <input
              type="text"
              value={nomNouveau}
              onChange={(e) => setNomNouveau(e.target.value)}
              className="w-48 rounded border border-gray-300 px-2 py-1 text-sm"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Localité</label>
            <input
              type="text"
              value={localiteNouveau}
              onChange={(e) => setLocaliteNouveau(e.target.value)}
              className="w-40 rounded border border-gray-300 px-2 py-1 text-sm"
            />
          </div>
          <button type="submit" disabled={ajoutEnCours} className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60">
            {ajoutEnCours ? "Ajout…" : "Ajouter"}
          </button>
          <button type="button" onClick={() => setFormulaireOuvert(false)} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600">
            Annuler
          </button>
          {erreurAjout && <p className="w-full text-xs text-red-700">{erreurAjout}</p>}
        </form>
      )}
    </div>
  );

  if (tousEtablissements.length === 0) {
    return (
      <>
        {boutonAjout}
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Aucun établissement actif de ce type n'est enregistré pour votre arrondissement.
        </p>
      </>
    );
  }

  return (
    <>
      {boutonAjout}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-50 text-left">
            <th className="border-b border-gray-200 px-4 py-2">Établissement</th>
            {template.fields.map((f) => (
              <th key={f.code} className="border-b border-gray-200 px-4 py-2">{f.libelle}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tousEtablissements.map((etab) => (
            <tr key={etab.id}>
              <td className="border-b border-gray-100 px-4 py-2 font-medium">
                {etab.nom}
                <div className="text-xs text-gray-500">{etab.localite}</div>
              </td>
              {template.fields.map((f) => {
                const cle = `${etab.id}:${f.code}`;
                const cellule = cellules[cle];
                const texte = f.typeValeur === "TEXTE";
                return (
                  <td key={f.code} className="border-b border-gray-100 px-4 py-2">
                    <input
                      type={texte ? "text" : "number"}
                      className={texte ? "w-56 rounded border border-gray-300 px-2 py-1 disabled:bg-gray-100" : "w-24 rounded border border-gray-300 px-2 py-1 disabled:bg-gray-100"}
                      value={cellule?.nonRenseigne ? "" : cellule?.valeur ?? ""}
                      disabled={cellule?.nonRenseigne}
                      onChange={(e) => sauvegarder(etab.id, f.code, texte, { valeur: e.target.value })}
                    />
                    <label className="mt-1 flex items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={cellule?.nonRenseigne ?? false}
                        onChange={(e) => sauvegarder(etab.id, f.code, texte, { nonRenseigne: e.target.checked, valeur: "" })}
                      />
                      N/D
                    </label>
                    {cellule?.nonRenseigne && (
                      <input
                        type="text"
                        placeholder="Motif obligatoire"
                        className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs"
                        value={cellule.motifNonRenseigne}
                        onChange={(e) => sauvegarder(etab.id, f.code, texte, { motifNonRenseigne: e.target.value })}
                      />
                    )}
                    {auteurs[cle] && <div className="mt-0.5 text-[11px] text-gray-400">{auteurs[cle]}</div>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        {/* Ligne de total, comme au bas du même tableau dans le rapport Word.
            L'agent voit la somme de ce qu'il vient de saisir et peut la
            confronter à ce qu'il sait du terrain — c'est un contrôle, pas
            seulement un affichage. La colonne qui alimente le tableau 1.2 le
            dit explicitement, pour que le report soit compréhensible. */}
        <tfoot>
          <tr className="bg-gray-50">
            <td className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600">Total du mois</td>
            {template.fields.map((f) => {
              if (f.typeValeur === "TEXTE") return <td key={f.code} className="px-4 py-2" />;
              const total = tousEtablissements.reduce((somme, etab) => {
                const c = cellules[`${etab.id}:${f.code}`];
                if (!c || c.nonRenseigne || c.valeur.trim() === "") return somme;
                const n = Number(c.valeur);
                return Number.isFinite(n) ? somme + n : somme;
              }, 0);
              const alimente = regleAlimenteeParLeChamp(template.code, f.code);
              return (
                <td key={f.code} className="px-4 py-2">
                  <span className="font-bold text-primary-dark">{total.toLocaleString("fr-FR")}</span>
                  {alimente && (
                    <p className="mt-0.5 text-[11px] font-normal leading-snug text-gray-500">
                      Reporté automatiquement au tableau {numeroTableau(alimente.templateCible)}, ligne « {libelleCourt(alimente.champCible)} ».
                    </p>
                  )}
                </td>
              );
            })}
          </tr>
        </tfoot>
      </table>
      </div>
    </>
  );
}

/** Libellé lisible d'une case cible, sans avoir à charger le tableau 1.2. */
function libelleCourt(champCible: string): string {
  if (champCible === "T12_VOL_MOD_PONDEUSE") return "Pondeuse — élevage moderne";
  if (champCible === "T12_VOL_MOD_POULET_CHAIR") return "Poulet chair — élevage moderne";
  return champCible;
}
