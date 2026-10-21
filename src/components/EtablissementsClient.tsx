"use client";

/**
 * EtablissementsClient.tsx — gestion du registre des établissements NOMINATIF
 * (CDC §B.5.3) : ajout, correction du nom/localité/propriétaire/téléphone,
 * désactivation (conserve l'historique) et suppression définitive.
 *
 * Les trois rôles qui saisissent (DD, DA, agent de saisie) peuvent ajouter et
 * supprimer — élargissement demandé par le DD, l'agent créant lui-même ses
 * établissements pendant la saisie doit pouvoir corriger un doublon sans
 * remonter la hiérarchie. Le DA et l'agent restent cloisonnés sur LEUR
 * arrondissement (le serveur le revérifie), seul le DD choisit parmi les six.
 */

import { useEffect, useState, useCallback } from "react";
import type { EtablissementOffline } from "@/lib/dexie";
import {
  listerEtablissements,
  creerEtablissement,
  modifierEtablissement,
  supprimerEtablissement,
  synchroniserEtablissements,
  nombreOperationsEnAttente,
  envoyerPhoto,
} from "@/lib/etablissementsLocal";
import VisiteGuidee from "@/components/VisiteGuidee";
import ListeFermes from "@/components/ListeFermes";
import InfosActeurForm from "@/components/InfosActeurForm";
import QuestionnaireMarche, { type ReponsesMarche } from "@/components/QuestionnaireMarche";
import { useUtilisateur } from "@/components/UtilisateurContexte";
import { Store, MapPin, FileDown } from "lucide-react";
import { TYPES_ACTEURS, nettoyerInfos, libellesEspeces, type InfosStructurelles } from "@/lib/acteurs";
import { joursEnClair } from "@/lib/marches";

const MARCHE = "ETAB_MARCHE";

interface Arrondissement {
  id: string;
  code: string;
  nom: string;
}

/** Même forme que la table locale : cet écran lit et écrit désormais Dexie. */
type Etablissement = EtablissementOffline;

// Les neuf types d'acteurs (20 octobre 2026) : les quatre des tableaux
// nominatifs, dans le même ordre qu'avant, puis marchés, abattoirs, aires
// d'abattage, étangs et cliniques. Voir src/lib/acteurs.ts.
const TYPES = TYPES_ACTEURS.map((t) => ({ code: t.code, label: t.tableau ? `${t.pluriel} — Tableau ${t.tableau}` : t.pluriel }));

export default function EtablissementsClient({
  role,
  arrondissements,
  ownArrondissementId,
  codeDepartement = null,
  nomDepartement = "",
}: {
  role: "DA" | "DD" | "AGENT_SAISIE";
  arrondissements: Arrondissement[];
  ownArrondissementId: string | null;
  codeDepartement?: string | null;
  nomDepartement?: string;
}) {
  const moi = useUtilisateur();
  /** Le questionnaire d'un marché ouvert : null pour un nouveau marché. */
  const [questionnaire, setQuestionnaire] = useState<{ etab: Etablissement | null } | null>(null);
  /** Arrivé par « Commencer » d'une collecte ponctuelle : son titre et sa fin. */
  const [collecte, setCollecte] = useState<{ titre: string; fin: string; consigne: string | null } | null>(null);

  // ?type=ETAB_MARCHE&collecte=…&nouveau=1 : l'onglet, la collecte, et le
  // questionnaire ouvert d'emblée (bouton « Commencer » de l'accueil).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const type = q.get("type");
    if (type && TYPES.some((t) => t.code === type)) setTypeCode(type);
    if (q.get("nouveau") === "1" && type === MARCHE) setQuestionnaire({ etab: null });
    const id = q.get("collecte");
    if (id) {
      fetch("/api/collectes", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          const c = j?.collectes?.find((x: { id: string }) => x.id === id);
          if (c) setCollecte({ titre: c.titre, fin: c.fin, consigne: c.consigne });
        })
        .catch(() => undefined); // sans réseau : le registre marche sans le bandeau
    }
  }, []);
  // Seul le DD choisit l'arrondissement : le DA et l'agent de saisie sont
  // cloisonnés sur le leur (§A.2), le serveur le revérifie de son côté.
  const estDD = role === "DD";
  const [arrondissementId, setArrondissementId] = useState(
    estDD ? arrondissements[0]?.id ?? "" : ownArrondissementId ?? ""
  );
  const [typeCode, setTypeCode] = useState(TYPES[0].code);
  const [liste, setListe] = useState<Etablissement[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [nouveau, setNouveau] = useState({ nom: "", localite: "", proprietaire: "", telephone: "" });
  const [infosNouveau, setInfosNouveau] = useState<InfosStructurelles>({});
  const [ajout, setAjout] = useState(false);
  const [aSupprimer, setASupprimer] = useState<{ id: string; nom: string } | null>(null);

  // Lecture depuis la base LOCALE de l'appareil (remplie par /api/bootstrap),
  // jamais depuis le réseau : la page reste consultable et modifiable sans
  // connexion. Une synchronisation est tentée en arrière-plan si le réseau
  // est là, puis la liste est relue.
  const charger = useCallback(async () => {
    if (!arrondissementId) return;
    setLoading(true);
    setListe(await listerEtablissements(typeCode, arrondissementId));
    setLoading(false);
  }, [typeCode, arrondissementId]);

  useEffect(() => {
    charger();
  }, [charger]);

  // Rattrapage : les opérations faites hors ligne repartent dès que le réseau
  // revient, puis la liste affichée est relue.
  useEffect(() => {
    async function rattraper() {
      const { envoyees } = await synchroniserEtablissements();
      if (envoyees > 0) await charger();
    }
    void rattraper();
    window.addEventListener("online", rattraper);
    return () => window.removeEventListener("online", rattraper);
  }, [charger]);

  async function ajouter(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!nouveau.nom.trim() || !nouveau.localite.trim()) {
      setMessage("Nom et localité requis.");
      return;
    }
    const infos = nettoyerInfos(infosNouveau as Record<string, unknown>);
    if ("erreur" in infos) {
      setMessage(infos.erreur);
      return;
    }
    setAjout(true);
    try {
      const cree = await creerEtablissement({ typeCode, arrondissementId, ...nouveau, ...infos.donnees });
      setNouveau({ nom: "", localite: "", proprietaire: "", telephone: "" });
      setInfosNouveau({});
      // On se fie au RÉSULTAT réel, pas à navigator.onLine : celui-ci reste
      // « en ligne » quand l'appareil est connecté au Wi-Fi sans Internet.
      setMessage(
        (await nombreOperationsEnAttente()) > 0
          ? `« ${cree.nom} » enregistré sur cet appareil — il sera transmis dès que le serveur sera joignable.`
          : `« ${cree.nom} » ajouté.`
      );
      await charger();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Erreur.");
    } finally {
      setAjout(false);
    }
  }

  async function modifier(id: string, patch: Partial<Etablissement>) {
    setMessage(null);
    try {
      await modifierEtablissement(id, patch);
      await charger();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Erreur.");
    }
  }

  /** Le questionnaire d'un marché, enregistré : un nouveau marché, ou la fiche d'un marché existant. */
  async function enregistrerMarche(r: ReponsesMarche, etab: Etablissement | null) {
    setMessage(null);
    const gps = r.gps
      ? { latitude: r.gps.latitude, longitude: r.gps.longitude, precisionGPS: r.gps.precisionGPS, dateCollecteGPS: r.gps.dateCollecteGPS }
      : { latitude: null, longitude: null, precisionGPS: null, dateCollecteGPS: null };
    const commun = { nom: r.nom.trim(), localite: r.localite.trim(), especes: r.especes, observations: r.observations?.trim() || null, fiche: r.fiche, ...gps };
    if (etab) {
      await modifierEtablissement(etab.id, commun);
      if (r.photo !== undefined) await envoyerPhoto(etab.id, r.photo);
    } else {
      await creerEtablissement({ typeCode: MARCHE, arrondissementId, ...commun, photo: r.photo ?? null });
    }
    setMessage(
      (await nombreOperationsEnAttente()) > 0
        ? `« ${commun.nom} » enregistré sur cet appareil — il sera transmis dès que le serveur sera joignable.`
        : `« ${commun.nom} » enregistré.`
    );
    await charger();
  }

  async function confirmerSuppression() {
    if (!aSupprimer) return;
    const { id, nom } = aSupprimer;
    setMessage(null);
    setASupprimer(null);
    try {
      await supprimerEtablissement(id);
      setMessage(
        (await nombreOperationsEnAttente()) > 0
          ? `« ${nom} » retiré de cet appareil — la suppression sera transmise dès que le serveur sera joignable.`
          : `« ${nom} » supprimé définitivement.`
      );
      await charger();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Erreur.");
    }
  }

  return (
    <div>
      {aSupprimer && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
            <p className="text-sm font-semibold text-gray-800">Supprimer définitivement ?</p>
            <p className="mt-2 text-sm text-gray-600">
              « {aSupprimer.nom} » sera supprimé définitivement, ainsi que toutes les saisies qui lui sont rattachées.
              Cette action est irréversible.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setASupprimer(null)} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700">
                Annuler
              </button>
              <button onClick={confirmerSuppression} className="rounded-md bg-statut-rejeteText px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
                Supprimer définitivement
              </button>
            </div>
          </div>
        </div>
      )}

      <VisiteGuidee ecran="etablissements" />
      {collecte && (
        <div className="mb-4 rounded-card border-2 border-cuivre/70 bg-white p-3 text-sm text-ink">
          <p className="font-bold text-primary-dark">
            Collecte en cours : {collecte.titre} — jusqu&apos;au{" "}
            {new Date(`${collecte.fin}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}
          </p>
          {collecte.consigne && <p className="mt-1">{collecte.consigne}</p>}
        </div>
      )}
      <ListeFermes estDD={estDD} arrondissements={arrondissements} />
      <div data-visite="types-etablissement" className="mb-4 flex flex-wrap gap-2">
        {TYPES.map((t) => (
          <button
            key={t.code}
            onClick={() => {
              setTypeCode(t.code);
              setInfosNouveau({});
            }}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              typeCode === t.code ? "bg-primary text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {estDD && (
        <div className="mb-4">
          <label className="mb-1 block text-xs font-semibold text-gray-600">Arrondissement</label>
          <select
            value={arrondissementId}
            onChange={(e) => setArrondissementId(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {arrondissements.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nom}
              </option>
            ))}
          </select>
        </div>
      )}

      {questionnaire && (
        <QuestionnaireMarche
          etablissement={questionnaire.etab}
          arrondissement={{ id: arrondissementId, nom: arrondissements.find((a) => a.id === arrondissementId)?.nom ?? "" }}
          arrondissements={arrondissements.map((a) => a.nom)}
          codeDepartement={codeDepartement}
          nomDepartement={nomDepartement}
          username={moi?.username ?? "inconnu"}
          onEnregistrer={(r) => enregistrerMarche(r, questionnaire.etab)}
          onFermer={() => setQuestionnaire(null)}
        />
      )}

      {typeCode === MARCHE ? (
        <div data-visite="ajouter-etablissement" className="mb-5 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <button
            type="button"
            onClick={() => setQuestionnaire({ etab: null })}
            className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-btn bg-primary px-4 text-[15px] font-bold text-white hover:bg-primary-hover sm:w-auto"
          >
            <Store size={20} /> Ajouter un marché
          </button>
          <p className="mt-2 text-sm text-ink-muted">
            Un questionnaire en 10 étapes, à remplir <b>sur place</b> : la position GPS se prend au milieu du marché. Sans réseau, tout est gardé sur le téléphone.
          </p>
        </div>
      ) : (
      <form onSubmit={ajouter} data-visite="ajouter-etablissement" className="mb-5 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-700">Ajouter un établissement</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <input
            placeholder="Nom *"
            value={nouveau.nom}
            onChange={(e) => setNouveau({ ...nouveau, nom: e.target.value })}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="Localité *"
            value={nouveau.localite}
            onChange={(e) => setNouveau({ ...nouveau, localite: e.target.value })}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="Propriétaire (optionnel)"
            value={nouveau.proprietaire}
            onChange={(e) => setNouveau({ ...nouveau, proprietaire: e.target.value })}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="Téléphone (optionnel)"
            value={nouveau.telephone}
            onChange={(e) => setNouveau({ ...nouveau, telephone: e.target.value })}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        {/* Les informations structurelles : ouvertes d'emblée pour un marché. */}
        <details key={typeCode} open={typeCode === "ETAB_MARCHE"} className="mt-3 rounded-input border border-gray-200 bg-white p-3">
          <summary className="cursor-pointer text-sm font-semibold text-primary">
            Informations structurelles : coordonnées GPS{typeCode === "ETAB_MARCHE" ? ", espèces vendues, jours de marché, équipements" : ""}…
          </summary>
          <div className="mt-3">
            <InfosActeurForm typeCode={typeCode} valeur={infosNouveau} onChange={setInfosNouveau} />
          </div>
        </details>
        <button
          type="submit"
          disabled={ajout}
          className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {ajout ? "Ajout…" : "Ajouter"}
        </button>
      </form>
      )}

      {message && <p className="mb-3 text-sm text-gray-700">{message}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Chargement…</p>
      ) : liste.length === 0 ? (
        <p className="text-sm text-gray-500">Aucun établissement de ce type pour cet arrondissement.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                {/* Largeurs minimales : sans elles, le nom se réduisait à trois lettres sur un écran moyen. */}
                <th className="min-w-[200px] border-b border-gray-200 px-3 py-2">Nom</th>
                <th className="min-w-[140px] border-b border-gray-200 px-3 py-2">Localité</th>
                {typeCode === MARCHE ? (
                  // Un marché n'a ni propriétaire ni téléphone : c'est la commune qui le gère.
                  <th className="min-w-[200px] border-b border-gray-200 px-3 py-2">Jours de marché</th>
                ) : (
                  <>
                    <th className="min-w-[140px] border-b border-gray-200 px-3 py-2">Propriétaire</th>
                    <th className="min-w-[120px] border-b border-gray-200 px-3 py-2">Téléphone</th>
                  </>
                )}
                <th className="border-b border-gray-200 px-3 py-2">Fiche</th>
                <th className="border-b border-gray-200 px-3 py-2">Statut</th>
                <th className="border-b border-gray-200 px-3 py-2 text-right">Suppression</th>
              </tr>
            </thead>
            <tbody>
              {liste.map((etab) => (
                <LigneEtablissement
                  key={etab.id}
                  etab={etab}
                  onMessage={setMessage}
                  onModifier={(patch) => modifier(etab.id, patch)}
                  onSupprimer={() => setASupprimer({ id: etab.id, nom: etab.nom })}
                  codeDepartement={codeDepartement}
                  onOuvrirQuestionnaire={etab.typeCode === MARCHE ? () => setQuestionnaire({ etab }) : undefined}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LigneEtablissement({
  etab,
  onModifier,
  onSupprimer,
  onMessage,
  codeDepartement,
  onOuvrirQuestionnaire,
}: {
  etab: Etablissement;
  onModifier: (patch: Partial<Etablissement>) => void;
  onSupprimer: () => void;
  onMessage: (m: string | null) => void;
  codeDepartement: string | null;
  /** Un marché : sa fiche est le questionnaire. */
  onOuvrirQuestionnaire?: () => void;
}) {
  const [ficheOuverte, setFicheOuverte] = useState(false);
  const [infos, setInfos] = useState<InfosStructurelles>({
    latitude: etab.latitude ?? null,
    longitude: etab.longitude ?? null,
    precisionGPS: etab.precisionGPS ?? null,
    dateCollecteGPS: etab.dateCollecteGPS ?? null,
    especes: etab.especes ?? [],
    joursMarche: etab.joursMarche ?? [],
    infrastructures: etab.infrastructures ?? [],
    observations: etab.observations ?? null,
  });
  const resume = [
    etab.latitude != null && etab.longitude != null ? `GPS${etab.precisionGPS != null ? ` ± ${String(etab.precisionGPS).replace(".", ",")} m` : ""}` : null,
    etab.especes?.length ? libellesEspeces(etab.especes) : null,
    !onOuvrirQuestionnaire && etab.joursMarche?.length ? etab.joursMarche.map((j) => j.slice(0, 3).toLowerCase()).join(", ") : null,
    etab.aPhoto || etab.photoLocale ? "photo" : null,
  ].filter(Boolean).join(" · ");
  const [nom, setNom] = useState(etab.nom);
  const [localite, setLocalite] = useState(etab.localite);
  const [proprietaire, setProprietaire] = useState(etab.proprietaire ?? "");
  const [telephone, setTelephone] = useState(etab.telephone ?? "");

  const champCommun = "w-full rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-gray-300 focus:border-blue-400 focus:bg-white focus:outline-none disabled:text-gray-400";

  return (
    <>
    <tr className={!etab.actif ? "bg-gray-50 text-gray-400" : ""}>
      <td className="border-b border-gray-100 px-3 py-2">
        <input data-visite="modifier-etablissement" value={nom} disabled={!etab.actif} onChange={(e) => setNom(e.target.value)} onBlur={() => nom !== etab.nom && onModifier({ nom })} className={champCommun} />
      </td>
      <td className="border-b border-gray-100 px-3 py-2">
        <input value={localite} disabled={!etab.actif} onChange={(e) => setLocalite(e.target.value)} onBlur={() => localite !== etab.localite && onModifier({ localite })} className={champCommun} />
      </td>
      {onOuvrirQuestionnaire ? (
        <td className="border-b border-gray-100 px-3 py-2 text-[13px]">
          {joursEnClair(etab.fiche ?? {}, codeDepartement) ?? <span className="text-ink-muted">—</span>}
        </td>
      ) : (
        <>
          <td className="border-b border-gray-100 px-3 py-2">
            <input value={proprietaire} disabled={!etab.actif} onChange={(e) => setProprietaire(e.target.value)} onBlur={() => proprietaire !== (etab.proprietaire ?? "") && onModifier({ proprietaire })} className={champCommun} />
          </td>
          <td className="border-b border-gray-100 px-3 py-2">
            <input value={telephone} disabled={!etab.actif} onChange={(e) => setTelephone(e.target.value)} onBlur={() => telephone !== (etab.telephone ?? "") && onModifier({ telephone })} className={champCommun} />
          </td>
        </>
      )}
      <td className="border-b border-gray-100 px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={Boolean(onOuvrirQuestionnaire) && !etab.actif}
            onClick={() => (onOuvrirQuestionnaire ? onOuvrirQuestionnaire() : setFicheOuverte((v) => !v))}
            className="rounded-btn border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-primary hover:bg-primary-light disabled:opacity-50"
          >
            {ficheOuverte ? "Fermer la fiche" : "Fiche"}
          </button>
          {onOuvrirQuestionnaire && !etab.enAttenteSynchro && (
            <a
              href={`/api/etablissements/liste?typeCode=ETAB_MARCHE&arrondissementId=${etab.arrondissementId}&id=${etab.id}&format=pdf&fiches=1`}
              title="La fiche du marché en PDF"
              className="flex items-center gap-1 rounded-btn border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-primary hover:bg-primary-light"
            >
              <FileDown size={13} /> PDF
            </a>
          )}
        </div>
        {resume && <span className="mt-0.5 block max-w-[220px] truncate text-[11px] text-ink-muted" title={resume}>{resume}</span>}
        {onOuvrirQuestionnaire && etab.latitude == null && (
          <span className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-amber-800"><MapPin size={11} /> position à prendre</span>
        )}
      </td>
      <td className="border-b border-gray-100 px-3 py-2">
        <button
          data-visite="actif-etablissement"
          onClick={() => onModifier({ actif: !etab.actif })}
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${etab.actif ? "bg-green-100 text-green-800 hover:bg-red-100 hover:text-red-800" : "bg-gray-200 text-gray-600 hover:bg-green-100 hover:text-green-800"}`}
        >
          {etab.actif ? "Actif — désactiver" : "Inactif — réactiver"}
        </button>
      </td>
      <td className="border-b border-gray-100 px-3 py-2 text-right">
        <button onClick={onSupprimer} className="text-xs font-semibold text-statut-rejeteText hover:underline">
          Supprimer
        </button>
      </td>
    </tr>
    {ficheOuverte && (
      <tr>
        <td colSpan={7} className="border-b border-gray-200 bg-gray-50 px-3 py-3">
          <InfosActeurForm typeCode={etab.typeCode} valeur={infos} onChange={setInfos} desactive={!etab.actif} />
          <button
            type="button"
            disabled={!etab.actif}
            onClick={() => {
              const r = nettoyerInfos(infos as Record<string, unknown>);
              if ("erreur" in r) return onMessage(r.erreur);
              onModifier(r.donnees);
              onMessage(`Fiche de « ${etab.nom} » enregistrée.`);
              setFicheOuverte(false);
            }}
            className="mt-3 min-h-[40px] rounded-btn bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
          >
            Enregistrer la fiche
          </button>
        </td>
      </tr>
    )}
    </>
  );
}
