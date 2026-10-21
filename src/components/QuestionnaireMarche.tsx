"use client";

/**
 * LE QUESTIONNAIRE D'UN MARCHÉ (demande du Délégué, 21 octobre 2026) — « bien
 * structuré comme sur Kobo, ou mieux », adapté à des collègues peu habitués au
 * numérique :
 *
 *  - un thème par écran, dix étapes, une barre d'avancement, deux gros boutons
 *    (Retour, Suivant) ;
 *  - on TOUCHE plutôt qu'on n'écrit : presque tout se choisit ;
 *  - toujours un mot à côté d'un pictogramme ;
 *  - le brouillon est gardé à chaque réponse, sur l'appareil, même sans réseau ;
 *  - un récapitulatif à la fin, avec « Modifier » sur chaque partie.
 *
 * Les listes et le calendrier traditionnel : src/lib/marches.ts.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight, Camera, Pencil, Store, Check } from "lucide-react";
import CaptureGps, { useGpsEnAvance, type PositionGps } from "@/components/CaptureGps";
import { ESPECES, INFRASTRUCTURES_MARCHE } from "@/lib/acteurs";
import {
  ACCES, CONTROLES, EFFECTIFS, ETATS, FONCTIONNEMENTS, JOURS_SEMAINE, PORTEES, RYTHMES, TYPES_MARCHE,
  calendrierDe, dateAuCameroun, dateCourte, jourTraditionnel, joursEnClair, libelleDe, lieuxDeDestination,
  lieuxDeProvenance, lieuxEnClair, prochaineDate, type Choix, type FicheMarche,
} from "@/lib/marches";
import { compresserPhoto } from "@/lib/photo";
import type { EtablissementOffline } from "@/lib/dexie";

export interface ReponsesMarche {
  nom: string;
  localite: string;
  especes: string[];
  observations: string | null;
  gps: PositionGps | null;
  fiche: FicheMarche;
  /** undefined : photo inchangée ; null : retirée ; une data URL : nouvelle photo. */
  photo?: string | null;
}

interface Brouillon {
  r: ReponsesMarche;
  etape: number;
}

const ETAPES = [
  "Le marché",
  "Type et état",
  "Quand se tient-il ?",
  "Les espèces vendues",
  "D'où viennent les animaux ?",
  "Où partent-ils ?",
  "Les équipements",
  "Contrôle vétérinaire et accès",
  "La position GPS",
  "Photo et observations",
];
const RECAP = ETAPES.length;

function lireBrouillon(cle: string): Brouillon | null {
  try {
    const brut = window.localStorage.getItem(cle);
    return brut ? (JSON.parse(brut) as Brouillon) : null;
  } catch {
    return null;
  }
}
function ecrireBrouillon(cle: string, b: Brouillon | null) {
  try {
    if (b) window.localStorage.setItem(cle, JSON.stringify(b));
    else window.localStorage.removeItem(cle);
  } catch {
    // stockage plein ou interdit : le questionnaire continue sans brouillon
  }
}

function depuisEtablissement(e: EtablissementOffline | null): ReponsesMarche {
  return {
    nom: e?.nom ?? "",
    localite: e?.localite ?? "",
    especes: e?.especes ?? [],
    observations: e?.observations ?? null,
    gps:
      e && e.latitude != null && e.longitude != null && e.precisionGPS != null
        ? { latitude: e.latitude, longitude: e.longitude, precisionGPS: e.precisionGPS, dateCollecteGPS: e.dateCollecteGPS ?? new Date().toISOString() }
        : null,
    fiche: { ...(e?.fiche ?? {}) },
  };
}

// ---------------------------------------------------------------- les tuiles

function Tuile({ choisi, onClick, children, petit = false }: { choisi: boolean; onClick: () => void; children: React.ReactNode; petit?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={choisi}
      className={`flex items-center justify-between gap-2 rounded-input border text-left font-semibold transition ${petit ? "min-h-[40px] px-3 text-[13px]" : "min-h-[52px] px-4 text-[15px]"} ${
        choisi ? "border-primary bg-primary-light text-primary-dark ring-2 ring-primary" : "border-gray-300 bg-white text-ink hover:border-primary"
      }`}
    >
      <span className="min-w-0 flex-1">{children}</span>
      {choisi && <Check size={18} className="shrink-0" />}
    </button>
  );
}

function UnChoix({ liste, valeur, onChange, colonnes = 1 }: { liste: Choix[]; valeur: string | null | undefined; onChange: (v: string | null) => void; colonnes?: 1 | 2 }) {
  return (
    <div className={`grid gap-2 ${colonnes === 2 ? "sm:grid-cols-2" : ""}`}>
      {liste.map((c) => (
        <Tuile key={c.code} choisi={valeur === c.code} onClick={() => onChange(valeur === c.code ? null : c.code)}>
          {c.libelle}
        </Tuile>
      ))}
    </div>
  );
}

function Question({ children, aide }: { children: React.ReactNode; aide?: string }) {
  return (
    <div className="mb-2 mt-5 first:mt-0">
      <p className="text-[16px] font-bold text-nuit">{children}</p>
      {aide && <p className="text-[13px] text-ink-muted">{aide}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- le questionnaire

export default function QuestionnaireMarche({
  etablissement,
  arrondissement,
  arrondissements,
  codeDepartement,
  nomDepartement,
  username,
  onEnregistrer,
  onFermer,
}: {
  /** null : un nouveau marché. */
  etablissement: EtablissementOffline | null;
  arrondissement: { id: string; nom: string };
  arrondissements: string[];
  codeDepartement: string | null;
  nomDepartement: string;
  username: string;
  onEnregistrer: (r: ReponsesMarche) => Promise<void>;
  onFermer: () => void;
}) {
  const cle = `sid-brouillon-marche:${username}:${etablissement?.id ?? `nouveau:${arrondissement.id}`}`;
  const [r, setR] = useState<ReponsesMarche>(() => depuisEtablissement(etablissement));
  const [etape, setEtape] = useState(0);
  const [brouillon, setBrouillon] = useState<Brouillon | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [photoErreur, setPhotoErreur] = useState<string | null>(null);
  const champPhoto = useRef<HTMLInputElement>(null);
  const haut = useRef<HTMLDivElement>(null);
  const cal = calendrierDe(codeDepartement);
  const aujourdhui = dateAuCameroun();
  useGpsEnAvance(true);

  // Un brouillon laissé la dernière fois : on propose de le reprendre.
  useEffect(() => {
    const b = lireBrouillon(cle);
    if (b) setBrouillon(b);
  }, [cle]);
  // Le brouillon n'est gardé que si une réponse a changé : rouvrir une fiche
  // pour la relire ne laisse rien derrière soi.
  const depart = useRef(JSON.stringify(r));
  useEffect(() => {
    if (JSON.stringify(r) === depart.current) return;
    ecrireBrouillon(cle, { r, etape });
  }, [r, etape, cle]);

  const f = r.fiche;
  const majFiche = (p: Partial<FicheMarche>) => setR((x) => ({ ...x, fiche: { ...x.fiche, ...p } }));
  const provenances = useMemo(() => lieuxDeProvenance(arrondissements, arrondissement.nom, nomDepartement), [arrondissements, arrondissement.nom, nomDepartement]);
  const destinations = useMemo(() => lieuxDeDestination(), []);

  /** Ce qui manque pour quitter l'étape — rien de bloquant ailleurs. */
  function manque(n: number): string | null {
    switch (n) {
      case 0:
        if (!r.nom.trim()) return "Écrivez le nom du marché.";
        if (!r.localite.trim()) return "Écrivez le quartier ou le village.";
        return null;
      case 1:
        return f.typeMarche ? null : "Touchez le type de marché.";
      case 2:
        if (!f.rythme) return "Touchez comment se tient le marché.";
        if (f.rythme === "HUIT_JOURS" && cal && !f.grandMarche) return "Touchez le jour du grand marché.";
        if (f.rythme === "HUIT_JOURS" && !cal && !f.nomLocalJour) return "Écrivez le nom du jour de marché.";
        if (f.rythme === "SEMAINE" && !f.grandMarche) return "Touchez le jour du marché.";
        return null;
      case 3:
        return r.especes.length ? null : "Touchez au moins une espèce vendue.";
      case 4:
        if ((f.provenances?.length ?? 0) > 1 && !f.provenancePrincipale) return "Touchez la provenance principale.";
        if (f.provenances?.includes("AUTRE") && !f.provenanceAutre?.trim()) return "Écrivez l'autre provenance.";
        return null;
      case 5:
        if ((f.destinations?.length ?? 0) > 1 && !f.destinationPrincipale) return "Touchez la destination principale.";
        if (f.destinations?.includes("AUTRE") && !f.destinationAutre?.trim()) return "Écrivez l'autre destination.";
        return null;
      case 6:
        if (f.equipementAutre?.trim() && !f.etatEquipementAutre) return "Touchez l'état de l'autre équipement.";
        return null;
      default:
        return null;
    }
  }

  function aller(n: number) {
    setErreur(null);
    setEtape(n);
    haut.current?.scrollIntoView({ block: "start" });
  }
  function suivant() {
    const m = manque(etape);
    if (m) return setErreur(m);
    aller(etape + 1);
  }

  async function enregistrer() {
    for (let n = 0; n < RECAP; n++) {
      const m = manque(n);
      if (m) {
        aller(n);
        return setErreur(m);
      }
    }
    setOccupe(true);
    setErreur(null);
    try {
      await onEnregistrer(r);
      ecrireBrouillon(cle, null);
      onFermer();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'enregistrement a échoué.");
    } finally {
      setOccupe(false);
    }
  }

  async function prendrePhoto(fichier: File | undefined) {
    if (!fichier) return;
    setPhotoErreur(null);
    try {
      const donnees = await compresserPhoto(fichier);
      setR((x) => ({ ...x, photo: donnees }));
    } catch (e) {
      setPhotoErreur(e instanceof Error ? e.message : "La photo n'a pas pu être prise.");
    }
  }

  // Ce que la photo montre : la nouvelle, celle de l'appareil, celle du serveur.
  const apercu =
    r.photo === null
      ? null
      : r.photo ?? etablissement?.photoLocale ?? (etablissement?.aPhoto ? `/api/etablissements/${etablissement.id}/photo` : null);

  // -------------------------------------------------------------- les étapes
  const lieuxMulti = (sens: "provenance" | "destination", groupes: { groupe: string; lieux: Choix[] }[]) => {
    const cleListe = sens === "provenance" ? "provenances" : "destinations";
    const liste = f[cleListe] ?? [];
    const principale = f[`${sens}Principale`];
    const basculer = (code: string) => {
      const nouvelle = liste.includes(code) ? liste.filter((x) => x !== code) : [...liste, code];
      majFiche({
        [cleListe]: nouvelle,
        [`${sens}Principale`]: nouvelle.length === 1 ? nouvelle[0] : principale && nouvelle.includes(principale) ? principale : null,
      } as Partial<FicheMarche>);
    };
    const tous = groupes.flatMap((g) => g.lieux);
    return (
      <>
        <Question aide="Touchez tous les lieux qui comptent.">{sens === "provenance" ? "D'où viennent les animaux ?" : "Où partent les animaux ?"}</Question>
        {groupes.map((g) => (
          <div key={g.groupe} className="mb-3">
            {groupes.length > 1 && <p className="mb-1 text-[12px] font-bold uppercase tracking-wide text-ink-muted">{g.groupe}</p>}
            <div className="grid gap-2 sm:grid-cols-2">
              {g.lieux.map((l) => (
                <Tuile key={l.code} petit choisi={liste.includes(l.code)} onClick={() => basculer(l.code)}>
                  {l.libelle}
                </Tuile>
              ))}
            </div>
          </div>
        ))}
        {liste.includes("AUTRE") && (
          <input
            value={(f[`${sens}Autre`] as string | null | undefined) ?? ""}
            onChange={(e) => majFiche({ [`${sens}Autre`]: e.target.value } as Partial<FicheMarche>)}
            placeholder={sens === "provenance" ? "Écrivez d'où (ville, pays…)" : "Écrivez la ville"}
            className="mt-1 min-h-[48px] w-full rounded-input border border-gray-300 px-3 text-[15px]"
          />
        )}
        {liste.length > 1 && (
          <>
            <Question aide="Il y en a toujours un qui compte le plus.">{sens === "provenance" ? "Quelle est la provenance principale ?" : "Quelle est la destination principale ?"}</Question>
            <div className="grid gap-2 sm:grid-cols-2">
              {liste.map((c) => (
                <Tuile key={c} choisi={principale === c} onClick={() => majFiche({ [`${sens}Principale`]: c } as Partial<FicheMarche>)}>
                  {c === "AUTRE" && f[`${sens}Autre`] ? (f[`${sens}Autre`] as string) : tous.find((x) => x.code === c)?.libelle ?? c}
                </Tuile>
              ))}
            </div>
          </>
        )}
      </>
    );
  };

  const contenu = () => {
    switch (etape) {
      case 0:
        return (
          <>
            <Question>Nom du marché</Question>
            <input value={r.nom} onChange={(e) => setR({ ...r, nom: e.target.value })} placeholder="Ex. : Marché à bétail de Foréké" className="min-h-[52px] w-full rounded-input border border-gray-300 px-3 text-[16px]" />
            <Question>Quartier ou village</Question>
            <input value={r.localite} onChange={(e) => setR({ ...r, localite: e.target.value })} placeholder="Ex. : Foréké-Dschang" className="min-h-[52px] w-full rounded-input border border-gray-300 px-3 text-[16px]" />
            <p className="mt-4 rounded-input bg-appbg p-3 text-sm text-ink">
              Arrondissement de <b>{arrondissement.nom}</b> · géré par la <b>commune de {arrondissement.nom}</b>
            </p>
          </>
        );
      case 1:
        return (
          <>
            <Question>Quel type de marché ?</Question>
            <UnChoix liste={TYPES_MARCHE} valeur={f.typeMarche} onChange={(v) => majFiche({ typeMarche: v })} colonnes={2} />
            <Question>Le marché fonctionne-t-il ?</Question>
            <UnChoix liste={FONCTIONNEMENTS} valeur={f.fonctionnement} onChange={(v) => majFiche({ fonctionnement: v })} />
            <Question>D'où viennent les acheteurs et les vendeurs ?</Question>
            <UnChoix liste={PORTEES} valeur={f.portee} onChange={(v) => majFiche({ portee: v })} />
          </>
        );
      case 2:
        return (
          <>
            <Question>Comment se tient le marché ?</Question>
            <UnChoix liste={RYTHMES} valeur={f.rythme} onChange={(v) => majFiche({ rythme: v, grandMarche: null, petitMarche: null })} />
            {f.rythme === "HUIT_JOURS" && cal && (
              <>
                <Question aide={`Aujourd'hui, c'est ${jourTraditionnel(cal, aujourdhui).libelle}.`}>{f.petitMarche ? "Jour du grand marché" : "Jour du marché (ou du grand marché)"}</Question>
                <div className="grid gap-2 sm:grid-cols-2">
                  {cal.jours.map((j) => {
                    const d = prochaineDate(cal, j.code, aujourdhui)!;
                    return (
                      <Tuile key={j.code} choisi={f.grandMarche === j.code} onClick={() => majFiche({ grandMarche: j.code, petitMarche: f.petitMarche === j.code ? null : f.petitMarche })}>
                        <span className="flex w-full items-center justify-between gap-3">
                          <span>{j.libelle}</span>
                          <span className="text-[12px] font-normal text-ink-muted">{dateCourte(d, aujourdhui)}</span>
                        </span>
                      </Tuile>
                    );
                  })}
                </div>
                <Question>Y a-t-il aussi un petit marché ?</Question>
                <div className="grid grid-cols-2 gap-2">
                  <Tuile choisi={f.petitMarche != null} onClick={() => majFiche({ petitMarche: f.petitMarche ?? cal.jours.find((j) => j.code !== f.grandMarche)!.code })}>Oui</Tuile>
                  <Tuile choisi={f.petitMarche == null} onClick={() => majFiche({ petitMarche: null })}>Non</Tuile>
                </div>
                {f.petitMarche != null && (
                  <>
                    <Question>Jour du petit marché</Question>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {cal.jours.filter((j) => j.code !== f.grandMarche).map((j) => (
                        <Tuile key={j.code} petit choisi={f.petitMarche === j.code} onClick={() => majFiche({ petitMarche: j.code })}>
                          <span className="flex w-full items-center justify-between gap-3">
                            <span>{j.libelle}</span>
                            <span className="text-[12px] font-normal text-ink-muted">{dateCourte(prochaineDate(cal, j.code, aujourdhui)!, aujourdhui)}</span>
                          </span>
                        </Tuile>
                      ))}
                    </div>
                  </>
                )}
                <Question aide="Facultatif : seulement si le village dit ce jour autrement.">Autre nom local du jour</Question>
                <input value={f.nomLocalJour ?? ""} onChange={(e) => majFiche({ nomLocalJour: e.target.value })} className="min-h-[48px] w-full rounded-input border border-gray-300 px-3 text-[15px]" />
              </>
            )}
            {f.rythme === "HUIT_JOURS" && !cal && (
              <>
                <Question aide="Le calendrier de votre département n'est pas encore dans le SID.">Nom du jour de marché</Question>
                <input value={f.nomLocalJour ?? ""} onChange={(e) => majFiche({ nomLocalJour: e.target.value })} className="min-h-[48px] w-full rounded-input border border-gray-300 px-3 text-[15px]" />
              </>
            )}
            {f.rythme === "SEMAINE" && (
              <>
                <Question>Quel jour ?</Question>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {JOURS_SEMAINE.map((j) => (
                    <Tuile key={j} petit choisi={f.grandMarche === j} onClick={() => majFiche({ grandMarche: j })}>
                      {j.charAt(0) + j.slice(1).toLowerCase()}
                    </Tuile>
                  ))}
                </div>
              </>
            )}
          </>
        );
      case 3:
        return (
          <>
            <Question aide="Touchez toutes les espèces vendues.">Quelles espèces sont vendues ?</Question>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ESPECES.map((e) => (
                <Tuile
                  key={e.code}
                  petit
                  choisi={r.especes.includes(e.code)}
                  onClick={() => setR({ ...r, especes: r.especes.includes(e.code) ? r.especes.filter((x) => x !== e.code) : [...r.especes, e.code] })}
                >
                  {e.libelle}
                </Tuile>
              ))}
            </div>
            {r.especes.length > 0 && (
              <>
                <Question aide="Un jour de marché ordinaire, en moyenne.">Combien de têtes sont présentées ?</Question>
                <div className="space-y-3">
                  {r.especes.map((esp) => (
                    <div key={esp}>
                      <p className="mb-1 text-[14px] font-semibold text-ink">{ESPECES.find((x) => x.code === esp)?.libelle}</p>
                      <div className="grid grid-cols-3 gap-2">
                        {EFFECTIFS.map((n) => (
                          <Tuile key={n.code} petit choisi={f.effectifs?.[esp] === n.code} onClick={() => majFiche({ effectifs: { ...(f.effectifs ?? {}), [esp]: n.code } })}>
                            {n.libelle}
                          </Tuile>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        );
      case 4:
        return lieuxMulti("provenance", provenances);
      case 5:
        return lieuxMulti("destination", [{ groupe: "Villes", lieux: destinations }]);
      case 6:
        return (
          <>
            <Question aide="Pour chacun, touchez son état — « Absent » s'il n'existe pas.">Les équipements du marché</Question>
            <div className="space-y-3">
              {INFRASTRUCTURES_MARCHE.map((eq) => (
                <div key={eq.code}>
                  <p className="mb-1 text-[14px] font-semibold text-ink">{eq.libelle}</p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {ETATS.map((s) => (
                      <Tuile key={s.code} petit choisi={f.equipements?.[eq.code] === s.code} onClick={() => majFiche({ equipements: { ...(f.equipements ?? {}), [eq.code]: s.code } })}>
                        {s.libelle}
                      </Tuile>
                    ))}
                  </div>
                </div>
              ))}
              <div>
                <p className="mb-1 text-[14px] font-semibold text-ink">Autre équipement (facultatif)</p>
                <input value={f.equipementAutre ?? ""} onChange={(e) => majFiche({ equipementAutre: e.target.value })} placeholder="Écrivez son nom" className="mb-1.5 min-h-[44px] w-full rounded-input border border-gray-300 px-3 text-[15px]" />
                {f.equipementAutre?.trim() && (
                  <div className="grid grid-cols-4 gap-1.5">
                    {ETATS.filter((s) => s.code !== "ABSENT").map((s) => (
                      <Tuile key={s.code} petit choisi={f.etatEquipementAutre === s.code} onClick={() => majFiche({ etatEquipementAutre: s.code })}>
                        {s.libelle}
                      </Tuile>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        );
      case 7:
        return (
          <>
            <Question>Un agent du MINEPIA est-il présent les jours de marché ?</Question>
            <UnChoix liste={CONTROLES} valeur={f.controleVeterinaire} onChange={(v) => majFiche({ controleVeterinaire: v })} />
            <Question>Des laissez-passer sanitaires y sont-ils délivrés ?</Question>
            <div className="grid grid-cols-2 gap-2">
              <Tuile choisi={f.laissezPasser === true} onClick={() => majFiche({ laissezPasser: f.laissezPasser === true ? null : true })}>Oui</Tuile>
              <Tuile choisi={f.laissezPasser === false} onClick={() => majFiche({ laissezPasser: f.laissezPasser === false ? null : false })}>Non</Tuile>
            </div>
            <Question>Comment arrive-t-on au marché ?</Question>
            <UnChoix liste={ACCES} valeur={f.acces} onChange={(v) => majFiche({ acces: v })} />
          </>
        );
      case 8:
        return (
          <>
            <Question aide="Placez-vous au milieu du marché.">Prendre la position du marché</Question>
            <CaptureGps valeur={r.gps} onChange={(gps) => setR((x) => ({ ...x, gps }))} demarrer />
          </>
        );
      case 9:
        return (
          <>
            <Question aide="Facultatif : une vue d'ensemble du marché.">Photo du marché</Question>
            {apercu && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={apercu} alt="Photo du marché" className="mb-2 max-h-64 w-full rounded-input object-cover" />
            )}
            <input ref={champPhoto} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void prendrePhoto(e.target.files?.[0])} />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => champPhoto.current?.click()} className="flex min-h-[48px] items-center gap-2 rounded-btn border border-primary bg-white px-4 text-[15px] font-bold text-primary hover:bg-primary-light">
                <Camera size={20} /> {apercu ? "Reprendre la photo" : "Prendre une photo"}
              </button>
              {apercu && (
                <button type="button" onClick={() => setR({ ...r, photo: null })} className="min-h-[48px] px-3 text-sm text-ink-muted underline">
                  Retirer la photo
                </button>
              )}
            </div>
            {photoErreur && <p className="mt-2 text-sm text-red-800">{photoErreur}</p>}
            <Question aide="Facultatif.">Observations</Question>
            <textarea
              rows={3}
              value={r.observations ?? ""}
              onChange={(e) => setR({ ...r, observations: e.target.value })}
              placeholder="Ex. : fréquentation en saison sèche, problèmes du marché…"
              className="w-full rounded-input border border-gray-300 px-3 py-2 text-[15px]"
            />
          </>
        );
      default:
        return recapitulatif();
    }
  };

  const recapitulatif = () => {
    const lignes: { etape: number; titre: string; valeurs: [string, string | null][] }[] = [
      { etape: 0, titre: ETAPES[0], valeurs: [["Nom", r.nom], ["Quartier ou village", r.localite], ["Géré par", `Commune de ${arrondissement.nom}`]] },
      { etape: 1, titre: ETAPES[1], valeurs: [["Type", libelleDe(TYPES_MARCHE, f.typeMarche)], ["État", libelleDe(FONCTIONNEMENTS, f.fonctionnement)], ["Portée", libelleDe(PORTEES, f.portee)]] },
      { etape: 2, titre: ETAPES[2], valeurs: [["Jours", joursEnClair(f, codeDepartement)]] },
      {
        etape: 3,
        titre: ETAPES[3],
        valeurs: r.especes.map((e) => [ESPECES.find((x) => x.code === e)?.libelle ?? e, libelleDe(EFFECTIFS, f.effectifs?.[e]) ?? "taille non indiquée"] as [string, string]),
      },
      { etape: 4, titre: ETAPES[4], valeurs: [["Provenance", lieuxEnClair(f.provenances, f.provenancePrincipale, f.provenanceAutre, arrondissement.nom)]] },
      { etape: 5, titre: ETAPES[5], valeurs: [["Destinations", lieuxEnClair(f.destinations, f.destinationPrincipale, f.destinationAutre)]] },
      {
        etape: 6,
        titre: ETAPES[6],
        valeurs: [
          ...INFRASTRUCTURES_MARCHE.filter((eq) => f.equipements?.[eq.code]).map((eq) => [eq.libelle, libelleDe(ETATS, f.equipements![eq.code])] as [string, string | null]),
          ...(f.equipementAutre?.trim() ? [[f.equipementAutre, libelleDe(ETATS, f.etatEquipementAutre)] as [string, string | null]] : []),
        ],
      },
      {
        etape: 7,
        titre: ETAPES[7],
        valeurs: [["Agent du MINEPIA", libelleDe(CONTROLES, f.controleVeterinaire)], ["Laissez-passer", f.laissezPasser == null ? null : f.laissezPasser ? "Oui" : "Non"], ["Accès", libelleDe(ACCES, f.acces)]],
      },
      { etape: 8, titre: ETAPES[8], valeurs: [["Position", r.gps ? `${r.gps.latitude}, ${r.gps.longitude} (± ${String(r.gps.precisionGPS).replace(".", ",")} m)` : null]] },
      { etape: 9, titre: ETAPES[9], valeurs: [["Photo", apercu ? "Oui" : "Non"], ["Observations", r.observations?.trim() || null]] },
    ];
    return (
      <>
        <p className="mb-3 text-[16px] font-bold text-nuit">Relisez avant d&apos;enregistrer</p>
        {!r.gps && (
          <p className="mb-3 rounded-input bg-amber-50 p-3 text-sm text-amber-900">
            La position GPS n&apos;est pas prise : la fiche sera enregistrée, mais restera incomplète tant qu&apos;elle ne l&apos;est pas.
          </p>
        )}
        <div className="space-y-2">
          {lignes.map((l) => (
            <div key={l.etape} className="rounded-input border border-gray-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[14px] font-bold text-primary-dark">{l.titre}</p>
                <button type="button" onClick={() => aller(l.etape)} className="flex min-h-[36px] items-center gap-1 rounded-btn px-2 text-[13px] font-semibold text-primary hover:bg-primary-light">
                  <Pencil size={14} /> Modifier
                </button>
              </div>
              {l.valeurs.length === 0 ? (
                <p className="text-sm text-ink-muted">—</p>
              ) : (
                l.valeurs.map(([k, v]) => (
                  <p key={k} className="text-sm text-ink">
                    <span className="text-ink-muted">{k} : </span>
                    {v ?? "—"}
                  </p>
                ))
              )}
            </div>
          ))}
        </div>
      </>
    );
  };

  return (
    // Au-dessus des bandeaux du bas (téléchargement 180, mise à jour 190), sous le code PIN (250).
    <div className="fixed inset-0 z-[195] flex flex-col bg-appbg" role="dialog" aria-modal="true" aria-label="Fiche du marché">
      <div className="flex items-center gap-2 bg-primary px-3 py-2.5 text-white">
        <Store size={20} className="shrink-0" />
        <p className="min-w-0 flex-1 truncate text-[15px] font-bold">{etablissement ? `Fiche : ${etablissement.nom}` : "Nouveau marché"}</p>
        <button type="button" onClick={onFermer} aria-label="Fermer" className="flex h-10 w-10 items-center justify-center rounded-md hover:bg-white/10">
          <X size={22} />
        </button>
      </div>
      <div className="bg-white px-4 pb-2 pt-2">
        <p className="text-[13px] font-semibold text-ink-muted">
          {etape < RECAP ? `Étape ${etape + 1} sur ${RECAP} — ${ETAPES[etape]}` : "Récapitulatif"}
        </p>
        <div className="mt-1.5 h-1.5 rounded-full bg-gray-200">
          <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${Math.round((Math.min(etape + 1, RECAP) / RECAP) * 100)}%` }} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div ref={haut} className="mx-auto max-w-xl">
          {brouillon && (
            <div className="mb-4 rounded-input border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">Un brouillon de cette fiche a été gardé sur ce téléphone.</p>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => { setR(brouillon.r); setEtape(brouillon.etape); setBrouillon(null); }} className="min-h-[40px] rounded-btn bg-primary px-3 font-semibold text-white">
                  Reprendre le brouillon
                </button>
                <button type="button" onClick={() => { ecrireBrouillon(cle, null); setBrouillon(null); }} className="min-h-[40px] rounded-btn border border-gray-300 bg-white px-3 font-semibold text-ink">
                  Recommencer
                </button>
              </div>
            </div>
          )}
          {contenu()}
          {erreur && <p role="alert" className="mt-4 rounded-input bg-red-50 p-3 text-sm font-semibold text-red-900">{erreur}</p>}
        </div>
      </div>

      <div className="flex gap-2 border-t border-gray-200 bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => (etape === 0 ? onFermer() : aller(etape - 1))}
          className="flex min-h-[52px] flex-1 items-center justify-center gap-1 rounded-btn border border-gray-300 bg-white text-[15px] font-bold text-ink"
        >
          <ChevronLeft size={20} /> {etape === 0 ? "Annuler" : "Retour"}
        </button>
        {etape < RECAP ? (
          <button type="button" onClick={suivant} className="flex min-h-[52px] flex-1 items-center justify-center gap-1 rounded-btn bg-primary text-[15px] font-bold text-white hover:bg-primary-hover">
            Suivant <ChevronRight size={20} />
          </button>
        ) : (
          <button type="button" disabled={occupe} onClick={() => void enregistrer()} className="flex min-h-[52px] flex-1 items-center justify-center gap-1 rounded-btn bg-primary text-[15px] font-bold text-white hover:bg-primary-hover disabled:opacity-60">
            <Check size={20} /> {occupe ? "Enregistrement…" : "Enregistrer la fiche"}
          </button>
        )}
      </div>
    </div>
  );
}
