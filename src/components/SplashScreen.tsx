"use client";

/**
 * SplashScreen.tsx — animation d'ouverture SVG fournie par le DD (trois
 * fiches de données convergent vers la base centrale), une seule fois par
 * jour ; les lancements suivants n'affichent qu'un logo bref (~0,8 s). Skip
 * immédiat au clic/toucher ou via le bouton dédié.
 *
 * Son : les navigateurs bloquent tout son avant une interaction de
 * l'utilisateur (règle de sécurité, pas une limite de ce code). On déclenche
 * donc la séquence sonore synthétisée (Web Audio, aucun fichier audio) dès le
 * tout premier geste sur la page — en pratique quasi immédiat puisqu'il faut
 * cliquer dans le champ Identifiant. La séquence est recalée sur le temps
 * déjà écoulé de l'animation pour rester synchronisée même si ce geste
 * arrive une seconde ou deux après l'ouverture.
 */

import { useEffect, useRef, useState } from "react";

const CLE_DERNIERE_OUVERTURE = "sid-ddepia-derniere-ouverture";
const DUREE_ANIMATION_MS = 4050;
const DUREE_FONDU_MS = 900;

// Trois "transferts" de carte vers la base, puis un accord d'arrivée — calqués
// sur le minutage de l'animation CSS (voir globals.css, section splash-screen).
const TRANSFERTS = [
  { start: 1.22, arrive: 1.82, frequency: 520 },
  { start: 1.52, arrive: 2.12, frequency: 610 },
  { start: 1.82, arrive: 2.42, frequency: 720 },
];

function softTone(ctx: AudioContext, frequency: number, startTime: number, duration: number, volume = 0.022, type: OscillatorType = "sine") {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startTime);

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(2400, startTime);
  filter.Q.setValueAtTime(0.7, startTime);

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.03);
}

function softWhoosh(ctx: AudioContext, startTime: number, duration = 0.3, volume = 0.01) {
  const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  for (let index = 0; index < bufferSize; index += 1) {
    const envelope = Math.sin((Math.PI * index) / bufferSize);
    data[index] = (Math.random() * 2 - 1) * envelope;
  }

  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  source.buffer = buffer;
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(1350, startTime);
  filter.frequency.exponentialRampToValueAtTime(520, startTime + duration);
  filter.Q.setValueAtTime(0.8, startTime);

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(startTime);
}

export default function SplashScreen() {
  const [mode, setMode] = useState<"complet" | "mini" | "aucun">("aucun");
  const [visible, setVisible] = useState(false);
  const [fermeture, setFermeture] = useState(false);
  const dejaDecide = useRef(false);
  const debutAnimationMs = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sonDejaDeclencheRef = useRef(false);

  function fermer() {
    setFermeture((deja) => {
      if (deja) return deja;
      window.setTimeout(() => setVisible(false), DUREE_FONDU_MS);
      return true;
    });
  }

  function declencherSequenceSonore() {
    if (sonDejaDeclencheRef.current) return;
    sonDejaDeclencheRef.current = true;

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContextClass();
    const ctx = audioCtxRef.current;

    const jouer = () => {
      const ecouleSec = (performance.now() - debutAnimationMs.current) / 1000;
      const base = ctx.currentTime + 0.04 - ecouleSec;

      TRANSFERTS.forEach((t) => {
        if (t.start < ecouleSec) return; // geste arrivé après ce repère : on ne le rejoue pas en retard
        softWhoosh(ctx, base + t.start, 0.32, 0.008);
        softTone(ctx, t.frequency, base + t.arrive, 0.16, 0.02, "triangle");
        softTone(ctx, t.frequency * 1.5, base + t.arrive + 0.015, 0.11, 0.009, "sine");
      });

      if (2.68 > ecouleSec) {
        softTone(ctx, 523.25, base + 2.68, 0.56, 0.021, "sine");
        softTone(ctx, 659.25, base + 2.7, 0.64, 0.015, "sine");
        softTone(ctx, 783.99, base + 2.74, 0.52, 0.009, "sine");
      }
    };

    if (ctx.state === "suspended") ctx.resume().then(jouer).catch(() => {});
    else jouer();
  }

  useEffect(() => {
    if (dejaDecide.current) return; // évite le double-déclenchement du Strict Mode en développement
    dejaDecide.current = true;

    const aujourdHui = new Date().toDateString();
    let dernier: string | null = null;
    try {
      dernier = localStorage.getItem(CLE_DERNIERE_OUVERTURE);
    } catch {
      // stockage indisponible (navigation privée…) : on retombe sur le mini-logo
    }

    if (dernier === aujourdHui) {
      setMode("mini");
      setVisible(true);
      const t = setTimeout(() => setVisible(false), 800);
      return () => clearTimeout(t);
    }

    setMode("complet");
    setVisible(true);
    debutAnimationMs.current = performance.now();
    try {
      localStorage.setItem(CLE_DERNIERE_OUVERTURE, aujourdHui);
    } catch {
      // tant pis, la séquence complète réapparaîtra au prochain lancement
    }
    // Filet de sécurité : l'animation ne doit jamais retenir l'accès à
    // l'application au-delà de sa durée prévue.
    const t = setTimeout(fermer, DUREE_ANIMATION_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (mode !== "complet") return;
    const declencher = () => declencherSequenceSonore();
    window.addEventListener("pointerdown", declencher, { once: true });
    window.addEventListener("keydown", declencher, { once: true });
    return () => {
      window.removeEventListener("pointerdown", declencher);
      window.removeEventListener("keydown", declencher);
    };
  }, [mode]);

  if (!visible || mode === "aucun") return null;

  if (mode === "mini") {
    return (
      <div className="splash-mini" onClick={() => setVisible(false)} role="presentation">
        <div className="flex h-16 w-16 items-center justify-center rounded-card bg-primary text-lg font-bold text-white shadow-card">
          DD
        </div>
      </div>
    );
  }

  return (
    <section
      className={`splash-screen is-playing${fermeture ? " hidden" : ""}`}
      onClick={fermer}
      role="presentation"
      aria-label="Animation de démarrage SID DDEPIA"
    >
      <div className="ambient-layer" aria-hidden="true">
        <span className="ambient-circle circle-one" />
        <span className="ambient-circle circle-two" />
        <span className="ambient-circle circle-three" />
        <span className="ambient-blob blob-one" />
        <span className="ambient-blob blob-two" />
        <span className="ambient-blob blob-three" />
      </div>

      <div className="grain" aria-hidden="true" />

      <div className="splash-content">
        <svg className="logo-svg" viewBox="0 0 360 350" role="img" aria-labelledby="splashLogoTitle splashLogoDesc">
          <title id="splashLogoTitle">SID DDEPIA</title>
          <desc id="splashLogoDesc">Trois fiches de données transfèrent leurs informations vers un serveur central.</desc>

          <defs>
            <linearGradient id="surfaceGradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.96" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.82" />
            </linearGradient>
            <linearGradient id="greenCard" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#e9f7f1" />
              <stop offset="100%" stopColor="#b8e8d5" />
            </linearGradient>
            <linearGradient id="blueCard" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#edf7f8" />
              <stop offset="100%" stopColor="#a8dfe5" />
            </linearGradient>
            <linearGradient id="purpleCard" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#eef2fb" />
              <stop offset="100%" stopColor="#d4d5f5" />
            </linearGradient>
            <linearGradient id="dbBody" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#b8e8d5" />
              <stop offset="52%" stopColor="#a8dfe5" />
              <stop offset="100%" stopColor="#bbd8f3" />
            </linearGradient>
            <radialGradient id="topGlow">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.90" />
              <stop offset="45%" stopColor="#a8dfe5" stopOpacity="0.52" />
              <stop offset="100%" stopColor="#a8dfe5" stopOpacity="0" />
            </radialGradient>
            <filter id="softShadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="10" stdDeviation="12" floodColor="#397781" floodOpacity="0.14" />
            </filter>
            <filter id="softGlow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="2.3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <rect
            className="icon-surface"
            x="35"
            y="28"
            width="290"
            height="290"
            rx="74"
            fill="url(#surfaceGradient)"
            stroke="#ffffff"
            strokeOpacity="0.78"
            filter="url(#softShadow)"
          />

          <path id="path-left" className="flow-path" pathLength="1" d="M 113 134 C 118 175, 146 192, 166 225" fill="none" stroke="#397781" strokeOpacity="0.30" strokeWidth="2.2" strokeLinecap="round" />
          <path id="path-mid" className="flow-path" pathLength="1" d="M 180 111 C 180 153, 180 184, 180 224" fill="none" stroke="#397781" strokeOpacity="0.30" strokeWidth="2.2" strokeLinecap="round" />
          <path id="path-right" className="flow-path" pathLength="1" d="M 247 134 C 242 175, 214 192, 194 225" fill="none" stroke="#397781" strokeOpacity="0.30" strokeWidth="2.2" strokeLinecap="round" />

          <g id="card-left" className="source-card">
            <rect x="78" y="78" width="74" height="82" rx="17" fill="url(#greenCard)" stroke="#ffffff" strokeOpacity="0.70" />
            <rect x="91" y="92" width="18" height="18" rx="5" fill="#66d8b7" />
            <rect x="91" y="122" width="43" height="7" rx="3.5" fill="#66d8b7" fillOpacity="0.86" />
            <rect x="91" y="137" width="33" height="7" rx="3.5" fill="#66d8b7" fillOpacity="0.76" />
          </g>

          <g id="card-mid" className="source-card">
            <rect x="143" y="51" width="74" height="90" rx="17" fill="url(#blueCard)" stroke="#ffffff" strokeOpacity="0.72" />
            <rect x="156" y="65" width="18" height="18" rx="5" fill="#4fc1de" />
            <rect x="156" y="97" width="44" height="7" rx="3.5" fill="#4fc1de" fillOpacity="0.86" />
            <rect x="156" y="112" width="34" height="7" rx="3.5" fill="#4fc1de" fillOpacity="0.76" />
          </g>

          <g id="card-right" className="source-card">
            <rect x="208" y="78" width="74" height="82" rx="17" fill="url(#purpleCard)" stroke="#ffffff" strokeOpacity="0.72" />
            <rect x="221" y="92" width="18" height="18" rx="5" fill="#7f87ea" />
            <rect x="221" y="122" width="43" height="7" rx="3.5" fill="#7f87ea" fillOpacity="0.86" />
            <rect x="221" y="137" width="33" height="7" rx="3.5" fill="#7f87ea" fillOpacity="0.76" />
          </g>

          <circle id="particle-left" className="flow-particle" r="6.2" fill="#ffffff" style={{ offsetPath: "path('M 113 134 C 118 175, 146 192, 166 225')", offsetRotate: "0deg" } as React.CSSProperties} />
          <circle id="particle-mid" className="flow-particle" r="6.2" fill="#ffffff" style={{ offsetPath: "path('M 180 111 C 180 153, 180 184, 180 224')", offsetRotate: "0deg" } as React.CSSProperties} />
          <circle id="particle-right" className="flow-particle" r="6.2" fill="#ffffff" style={{ offsetPath: "path('M 247 134 C 242 175, 214 192, 194 225')", offsetRotate: "0deg" } as React.CSSProperties} />

          <ellipse className="server-aura" cx="180" cy="236" rx="62" ry="31" fill="url(#topGlow)" />
          <circle className="sync-ring" cx="180" cy="244" r="34" fill="none" stroke="#397781" strokeOpacity="0.48" strokeWidth="1.8" />

          <g id="database-group">
            <ellipse cx="180" cy="288" rx="68" ry="16" fill="#397781" opacity="0.08" />
            <path d="M112 246 L112 279 C112 294 248 294 248 279 L248 246 Z" fill="url(#dbBody)" />
            <ellipse cx="180" cy="246" rx="68" ry="18" fill="#c8edf1" />
            <ellipse cx="180" cy="245" rx="56" ry="12" fill="#ffffff" opacity="0.22" />
            <path d="M112 224 L112 253 C112 268 248 268 248 253 L248 224 Z" fill="url(#dbBody)" />
            <ellipse cx="180" cy="224" rx="68" ry="18" fill="#bce7ee" />
            <path d="M112 202 L112 231 C112 246 248 246 248 231 L248 202 Z" fill="url(#dbBody)" />
            <ellipse cx="180" cy="202" rx="68" ry="18" fill="#c8edf1" />
            <ellipse className="server-top-glow" cx="180" cy="202" rx="76" ry="30" fill="url(#topGlow)" />
            <circle className="server-led led-one" cx="228" cy="222" r="4.3" />
            <circle className="server-led led-two" cx="228" cy="247" r="4.3" />
            <circle className="server-led led-three" cx="228" cy="272" r="4.3" />
          </g>
        </svg>

        <div className="brand-text">SID DDEPIA</div>
        <div className="splash-tagline-svg">Collecter • Centraliser • Décider</div>
      </div>

      <button
        className="skip-button"
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          fermer();
        }}
      >
        Passer
      </button>
    </section>
  );
}
