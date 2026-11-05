"use client";

/**
 * Le CZV puis le village d'un établissement (découpage MINEPIA de l'Ouest,
 * demande du Délégué du 4 novembre 2026). Les listes sont lues SUR LE
 * TÉLÉPHONE (référentiels « CZV » et « VILLAGE » descendus par /api/bootstrap) :
 * le choix marche sans réseau.
 *
 * « Autre village (à préciser) » : pour un village absent de la liste, écrit
 * en clair. Le nom retenu devient la « localité » de l'établissement.
 *
 * Si l'appareil n'a pas encore reçu les listes (première ouverture après la
 * mise à jour, sans réseau), `disponible` vaut faux : l'écran garde alors son
 * champ « Localité » d'avant, et rien n'est bloqué.
 */
import { useEffect, useState } from "react";
import { offlineDB, type ReferentielOffline } from "@/lib/dexie";
import { EVENEMENT_BOOTSTRAP_MAJ } from "@/lib/offlineStore";

export const AUTRE_VILLAGE = "__AUTRE__";

export interface Lieu {
  centreId: string | null;
  villageId: string | null;
  villageAutre: string | null;
  /** Le nom retenu pour la localité : le village choisi, ou l'autre village saisi. */
  localite: string;
}

export const LIEU_VIDE: Lieu = { centreId: null, villageId: null, villageAutre: null, localite: "" };

/** Le lieu est-il complet ? Un CZV, puis un village de la liste ou un autre village nommé. */
export const lieuComplet = (l: Lieu) => Boolean(l.centreId && (l.villageId || l.villageAutre?.trim()));

export default function ChoixVillage({
  arrondissementId,
  valeur,
  onChange,
  onDisponible,
  classeChamp = "rounded-md border border-gray-300 px-3 py-2 text-sm",
}: {
  arrondissementId: string;
  valeur: Lieu;
  onChange: (l: Lieu) => void;
  /** Dit à l'écran si les listes sont sur l'appareil. */
  onDisponible?: (oui: boolean) => void;
  classeChamp?: string;
}) {
  const [centres, setCentres] = useState<ReferentielOffline[]>([]);
  const [villages, setVillages] = useState<ReferentielOffline[]>([]);
  const [autre, setAutre] = useState(Boolean(valeur.villageAutre));

  // Relu aussi à la fin de chaque téléchargement des données de référence : à
  // la première ouverture après la mise à jour, les listes arrivent APRÈS
  // l'affichage du formulaire.
  const [relecture, setRelecture] = useState(0);
  useEffect(() => {
    const relire = () => setRelecture((n) => n + 1);
    window.addEventListener(EVENEMENT_BOOTSTRAP_MAJ, relire);
    return () => window.removeEventListener(EVENEMENT_BOOTSTRAP_MAJ, relire);
  }, []);

  useEffect(() => {
    let vivant = true;
    offlineDB.referentiels
      .where("categorie")
      .equals("CZV")
      .toArray()
      .then((tous) => {
        if (!vivant) return;
        const ici = tous.filter((c) => c.parent === arrondissementId).sort((a, b) => a.ordre - b.ordre);
        setCentres(ici);
        onDisponible?.(ici.length > 0);
      })
      .catch(() => onDisponible?.(false));
    return () => {
      vivant = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrondissementId, relecture]);

  useEffect(() => {
    let vivant = true;
    if (!valeur.centreId) {
      setVillages([]);
      return;
    }
    offlineDB.referentiels
      .where("categorie")
      .equals("VILLAGE")
      .toArray()
      .then((tous) => {
        if (vivant) setVillages(tous.filter((v) => v.parent === valeur.centreId).sort((a, b) => a.libelle.localeCompare(b.libelle, "fr")));
      })
      .catch(() => undefined);
    return () => {
      vivant = false;
    };
  }, [valeur.centreId, relecture]);

  if (centres.length === 0) return null;

  return (
    <>
      <select
        aria-label="CZV"
        value={valeur.centreId ?? ""}
        onChange={(e) => {
          setAutre(false);
          onChange({ ...LIEU_VIDE, centreId: e.target.value || null });
        }}
        className={classeChamp}
      >
        <option value="">CZV *</option>
        {centres.map((c) => (
          <option key={c.code} value={c.code}>
            {c.libelle}
          </option>
        ))}
      </select>
      <select
        aria-label="Village"
        value={autre ? AUTRE_VILLAGE : valeur.villageId ?? ""}
        disabled={!valeur.centreId}
        onChange={(e) => {
          const v = e.target.value;
          if (v === AUTRE_VILLAGE) {
            setAutre(true);
            onChange({ centreId: valeur.centreId, villageId: null, villageAutre: "", localite: "" });
          } else {
            setAutre(false);
            const nom = villages.find((x) => x.code === v)?.libelle ?? "";
            onChange({ centreId: valeur.centreId, villageId: v || null, villageAutre: null, localite: nom });
          }
        }}
        className={`${classeChamp} disabled:bg-gray-100 disabled:text-gray-400`}
      >
        <option value="">{valeur.centreId ? "Village *" : "Village (choisir d'abord le CZV)"}</option>
        {villages.map((v) => (
          <option key={v.code} value={v.code}>
            {v.libelle}
          </option>
        ))}
        {valeur.centreId && <option value={AUTRE_VILLAGE}>Autre village (à préciser)</option>}
      </select>
      {autre && (
        <input
          aria-label="Nom du village"
          placeholder="Précisez le village *"
          value={valeur.villageAutre ?? ""}
          onChange={(e) => onChange({ centreId: valeur.centreId, villageId: null, villageAutre: e.target.value, localite: e.target.value.trim() })}
          className={classeChamp}
        />
      )}
    </>
  );
}
