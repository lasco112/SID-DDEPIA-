# Prompt — animation d'ouverture SID DDEPIA (à donner à une IA vidéo)

À joindre obligatoirement au prompt : le fichier `public/icon-512.png`
(logo validé par la hiérarchie — ne jamais le redessiner ni le recolorer).

Contrainte technique importante côté application : l'animation est affichée en
plein écran avec recadrage automatique (`object-fit: cover`). Les bords
gauche/droite sont donc rognés sur un téléphone en portrait, et le haut/bas sur
un écran large. D'où l'exigence de « safe zone » centrale dans le prompt.

---

## PROMPT (copier-coller tel quel)

Create a premium 4-second mobile app startup animation for "SID DDEPIA", an
institutional livestock data collection and centralization application for the
Cameroon Ministry of Livestock, Fisheries and Animal Industries (MINEPIA).

USE THE ATTACHED LOGO AS THE EXACT VISUAL REFERENCE. Do not redraw, restyle,
recolor or reinterpret it. Preserve its exact proportions, colors, rounded-square
shape and internal composition (three rounded cards converging above a rounded
data block).

### EXACT COLOR CHARTER — use these values only

- Background gradient (135°): #b8e8d5 (mint) → #a8dfe5 (aqua) → #bbd8f3 (sky)
- Soft background variant: #e9f7f1 → #edf7f8 → #eef2fb
- Primary brand color (text, accents): #397781
- Deep text color: #2f4147
- Accent lavender (sparingly): #d4d5f5
- Card / surface white: #ffffff
- Neutral background: #f8fafb

No color outside this palette. No black background. No neon. No saturated
primaries. Overall feel: soft, pastel, luminous, institutional, calm.

### ANIMATION SEQUENCE (total 4 seconds, fixed camera)

- 0.0–0.6 s — Soft pastel gradient background fades in (#b8e8d5 → #a8dfe5 →
  #bbd8f3, 135° diagonal). Very subtle light bloom in the upper third.
- 0.6–1.2 s — The app icon appears from a slight blur, scaling up gently from
  92 % to 100 % with ease-out. Soft ambient shadow beneath it.
- 1.2–2.4 s — Inside the icon, the three rounded cards emerge one after another
  (staggered ~0.15 s apart) from the upper area and glide along smooth curved
  paths toward the central data block. Each card is translucent white with a
  faint pastel tint (one mint, one aqua, one sky).
- 2.4–2.9 s — As each card reaches the data block, a subtle soft light pulse
  confirms reception. The block then emits a gentle cyan-blue glow (#a8dfe5),
  followed by one thin circular wave expanding outward and fading — symbolizing
  synchronization and consolidation.
- 2.9–3.4 s — The complete logo becomes perfectly sharp and stable. Below it,
  the wordmark "SID DDEPIA" fades upward into place in #2f4147, thin modern
  rounded sans-serif, generous letter spacing.
- 3.4–4.0 s — The subtitle "Collecter • Centraliser • Décider" fades in below in
  #397781, smaller, lighter weight. Hold the final composition perfectly still
  until the last frame.

### FULL-BLEED BACKGROUND (critical — defect observed in the previous version)

The background gradient must fill the entire frame edge to edge. Do NOT draw an
inner card, panel, rounded rectangle, border, frame, vignette or margin around
the composition. The previous version contained a rounded white card floating on
a background, which looked like a small video inside a large empty area once
displayed full-screen in the application. The scene must read as one continuous
full-frame background with the logo floating directly on it.

### TEXT RENDERING (critical — defect observed in the previous version)

The wordmark must read exactly "SID DDEPIA" — four letters, one single space,
then six letters (S-I-D space D-D-E-P-I-A). In the previous version the letters
were malformed and overlapped, rendering as "SIDDDEPIA". Render the text
cleanly, with correct letter spacing, no ligature, no overlap, no duplicated or
merged characters. Same requirement for the subtitle "Collecter • Centraliser •
Décider" (with the accent on Décider). If reliable text rendering is not
possible, deliver the animation WITHOUT any text and provide a clean version
where the text can be added afterwards.

### COMPOSITION AND SAFE ZONE (critical)

The video is displayed full-screen with automatic cropping on phones, tablets
and desktop. Keep the icon, the wordmark and the subtitle entirely inside a
centered safe zone covering the middle 60 % of the width and the middle 50 % of
the height. Everything outside that zone must be background gradient only — no
text, no icon element, no essential motion. The composition must remain readable
whether cropped to 9:16, 4:3 or 16:9.

### VISUAL STYLE

Elegant modern UI motion design. Soft 3D glassmorphism, pastel gradients,
delicate diffused studio lighting, light and airy shadows. Minimal,
professional, institutional, reassuring. Apple-inspired motion quality with an
African public-service digital identity. Absolutely no photographic realism.

### CAMERA AND MOTION

Camera completely fixed, frontal, centered. No rotation, no pan, no zoom, no
shake, no parallax. All motion is smooth ease-in-out, lightweight and precise.
Nothing bounces, nothing overshoots aggressively. End on a clean static frame.

### SOUND (optional but preferred)

Three soft, short digital data-transfer notes as each card reaches the data
block, then one warm reassuring confirmation tone as the logo settles. Gentle,
low volume, no voice, no impact, no aggressive futuristic sweep. Total sound
duration must not exceed the 4 seconds.

### DELIVERABLES

1. Vertical 1080 × 1920, 30 fps, 4 s — primary file for the mobile PWA.
2. Horizontal 1920 × 1080, 30 fps, 4 s — same composition, same timing, for
   tablet and desktop.
3. Export each in WebM (VP9, transparent background not required) AND MP4
   (H.264, yuv420p) — WebM is lighter and preferred for the application.
4. Keep each file under 2 MB if possible; the animation must load instantly on a
   slow mobile connection.

### NEGATIVE PROMPT

No additional icons, no animals, no map, no GPS pins, no people, no hands, no
excessive particles, no dark or black background, no neon or saturated colors,
no camera rotation or shake, no dramatic cinematic effects, no lens flares, no
metallic or chrome appearance, no spelling errors, no malformed or overlapping
letters, no merged or duplicated characters, no logo deformation or recoloring,
no duplicated cards, no distorted data block, no heavy shadows, no watermark,
no inner card or panel around the composition, no visible frame, border or
margin, no extra text beyond "SID DDEPIA" and "Collecter • Centraliser •
Décider".
