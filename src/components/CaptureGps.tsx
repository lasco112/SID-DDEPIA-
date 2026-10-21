"use client";

/**
 * PRENDRE LA POSITION GPS (décision du Délégué, 21 octobre 2026) : par le
 * téléphone seulement — jamais tapée —, à 5 m près au plus, avec des messages
 * et des pictogrammes que chacun comprend sans lire un long texte.
 *
 * Comme Kobo et ODK : la position s'enregistre SEULE dès que la précision est
 * atteinte. Contrairement à eux, on ne laisse pas enregistrer une position
 * moins précise : elle ne serait pas exploitable.
 *
 * Le GPS du téléphone marche sans réseau.
 */
import { useEffect, useRef, useState } from "react";
import { Sun, Home, Trees, Hourglass, MapPin, Check, LocateFixed } from "lucide-react";
import { PRECISION_GPS_MAX_M } from "@/lib/marches";

export interface PositionGps {
  latitude: number;
  longitude: number;
  precisionGPS: number;
  dateCollecteGPS: string;
}

type Etat = "repos" | "recherche" | "refus" | "indisponible" | "trop_long";

/** Au-delà, on dit à l'agent de changer de place. */
const ATTENTE_MAX_S = 120;

const m = (n: number) => `± ${n < 10 ? n.toFixed(1).replace(".", ",") : Math.round(n)} m`;

export default function CaptureGps({
  valeur,
  onChange,
  desactive = false,
  demarrer = false,
}: {
  valeur: PositionGps | null;
  onChange: (p: PositionGps | null) => void;
  desactive?: boolean;
  /** Lancer la recherche dès l'affichage (étape GPS du questionnaire, sans position encore). */
  demarrer?: boolean;
}) {
  const [etat, setEtat] = useState<Etat>("repos");
  const [precision, setPrecision] = useState<number | null>(null);
  const [secondes, setSecondes] = useState(0);
  const veille = useRef<number | null>(null);
  const minuteur = useRef<number | null>(null);

  function arreter() {
    if (veille.current != null) navigator.geolocation.clearWatch(veille.current);
    if (minuteur.current != null) window.clearInterval(minuteur.current);
    veille.current = null;
    minuteur.current = null;
  }

  function chercher() {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return setEtat("indisponible");
    arreter();
    setEtat("recherche");
    setPrecision(null);
    setSecondes(0);
    const debut = Date.now();
    minuteur.current = window.setInterval(() => {
      const s = Math.round((Date.now() - debut) / 1000);
      setSecondes(s);
      if (s >= ATTENTE_MAX_S) {
        arreter();
        setEtat("trop_long");
      }
    }, 1000);
    veille.current = navigator.geolocation.watchPosition(
      (p) => {
        setPrecision(p.coords.accuracy);
        if (p.coords.accuracy <= PRECISION_GPS_MAX_M) {
          arreter();
          setEtat("repos");
          onChange({
            latitude: Number(p.coords.latitude.toFixed(6)),
            longitude: Number(p.coords.longitude.toFixed(6)),
            precisionGPS: Math.round(p.coords.accuracy * 10) / 10,
            dateCollecteGPS: new Date(p.timestamp || Date.now()).toISOString(),
          });
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          arreter();
          setEtat("refus");
        }
        // Délai ou position introuvable : on continue d'écouter jusqu'à la limite.
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }
    );
  }

  useEffect(() => {
    if (demarrer && !valeur && !desactive) chercher();
    return arreter;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pictos = (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {[
        { icone: <Sun size={26} />, texte: "À ciel ouvert" },
        {
          icone: (
            <span className="relative inline-block">
              <Home size={26} />
              <span className="absolute left-[-2px] top-1/2 h-[2.5px] w-[30px] -rotate-45 bg-red-600" />
            </span>
          ),
          texte: "Pas sous un toit",
        },
        { icone: <Trees size={26} />, texte: "Loin des arbres" },
        { icone: <Hourglass size={26} />, texte: "Restez immobile" },
      ].map((p) => (
        <div key={p.texte} className="flex flex-col items-center gap-1 rounded-input bg-appbg px-2 py-2.5 text-center text-[13px] font-semibold text-ink">
          <span className="text-primary">{p.icone}</span>
          {p.texte}
        </div>
      ))}
    </div>
  );

  if (etat === "recherche") {
    const bonne = precision != null && precision <= PRECISION_GPS_MAX_M;
    const proche = precision != null && precision <= 20;
    return (
      <div className="space-y-3">
        {pictos}
        <div
          className={`rounded-input p-4 text-center ${precision == null ? "bg-gray-100 text-ink" : bonne ? "bg-green-50 text-green-900" : proche ? "bg-amber-50 text-amber-900" : "bg-red-50 text-red-900"}`}
          aria-live="polite"
        >
          <div className="text-[28px] font-bold tabular-nums">{precision == null ? "…" : m(precision)}</div>
          <div className="text-sm font-semibold">
            {precision == null ? "Le téléphone cherche les satellites…" : proche ? "Encore un peu… restez sur place." : "Signal faible : allez vers un endroit plus dégagé."}
          </div>
          <div className="mt-1 text-xs opacity-80">Il faut {PRECISION_GPS_MAX_M} m ou mieux. La position s&apos;enregistre seule. ({secondes} s)</div>
        </div>
        <button type="button" onClick={() => { arreter(); setEtat("repos"); }} className="text-sm text-ink-muted underline">
          Arrêter
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {valeur ? (
        <div className="flex items-start gap-3 rounded-input bg-green-50 p-3 text-green-900">
          <Check size={22} className="mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-bold">Position prise ({m(valeur.precisionGPS)})</p>
            <p className="tabular-nums">{valeur.latitude}, {valeur.longitude}</p>
            <p className="text-xs opacity-80">le {new Date(valeur.dateCollecteGPS).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</p>
          </div>
        </div>
      ) : (
        pictos
      )}

      {etat === "refus" && (
        <p className="rounded-input bg-red-50 p-3 text-sm text-red-900">
          <b>La localisation est coupée pour le SID.</b> Ouvrez les réglages du téléphone, activez « Position » (ou « Localisation ») et autorisez le SID, puis touchez « Réessayer ».
        </p>
      )}
      {etat === "indisponible" && (
        <p className="rounded-input bg-red-50 p-3 text-sm text-red-900">Cet appareil ne donne pas sa position. La position se prend sur place, avec le téléphone.</p>
      )}
      {etat === "trop_long" && (
        <p className="rounded-input bg-amber-50 p-3 text-sm text-amber-900">
          <b>Signal trop faible ici{precision != null ? ` (${m(precision)})` : ""}.</b> Allez dans un endroit dégagé, loin des toits et des arbres, attendez un instant, puis réessayez.
        </p>
      )}

      <button
        type="button"
        disabled={desactive}
        onClick={chercher}
        className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-btn bg-primary px-4 text-[15px] font-bold text-white hover:bg-primary-hover disabled:opacity-50"
      >
        {valeur ? <LocateFixed size={20} /> : <MapPin size={20} />}
        {valeur ? "Reprendre la position" : etat === "repos" ? "Prendre la position" : "Réessayer"}
      </button>
    </div>
  );
}

/**
 * Réveille le GPS dès l'ouverture d'un questionnaire (conseil de Kobo et ODK :
 * le téléphone a ainsi trouvé ses satellites quand on arrive à l'étape de la
 * position). Seulement si la permission est DÉJÀ accordée : on ne surprend pas
 * l'agent par une demande d'autorisation dès le premier écran.
 */
export function useGpsEnAvance(actif: boolean) {
  useEffect(() => {
    if (!actif || typeof navigator === "undefined" || !("geolocation" in navigator) || !navigator.permissions) return;
    let id: number | null = null;
    let fini = false;
    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((p) => {
        if (fini || p.state !== "granted") return;
        id = navigator.geolocation.watchPosition(() => undefined, () => undefined, { enableHighAccuracy: true, maximumAge: 0 });
      })
      .catch(() => undefined);
    return () => {
      fini = true;
      if (id != null) navigator.geolocation.clearWatch(id);
    };
  }, [actif]);
}
