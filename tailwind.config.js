/** @type {import('tailwindcss').Config} */

/*
 * Charte « Indigo des Hautes Terres » (refonte visuelle du 15 octobre 2026,
 * voir docs/refonte-visuelle/). Indigo, bleu nuit, ivoire ; cuivre et or en
 * accents rares, inspirés du ndop.
 *
 * Les NOMS des jetons n'ont pas changé (primary, ink, line, statut…) : seules
 * leurs valeurs. Les écrans n'ont donc pas été réécrits, ils ont été
 * rhabillés — aucune logique n'est touchée par ce fichier.
 *
 * Les gammes Tailwind « gray », « blue », « green », « amber » et « red »,
 * employées directement dans de nombreux écrans, sont elles aussi redéfinies
 * ici, dans des teintes accordées à la charte. Chacune garde son SENS :
 * gris = neutre, bleu = information, vert = conforme, ambre = à corriger /
 * en retard (désormais cuivre), rouge = erreur. Les nuances claires (50-200)
 * restent des fonds, les sombres (600-900) des textes : les contrastes sont
 * conservés ou améliorés.
 */

const neutre = {
  50: "#FAF8F4",
  100: "#F2EFE8",
  200: "#E6E1D6",
  300: "#CFC9BC",
  400: "#9AA0A8",
  500: "#6B7480",
  600: "#4E5A68",
  700: "#3A4553",
  800: "#243244",
  900: "#10253F",
};

const indigo = {
  50: "#EEF2F8",
  100: "#E6ECF4",
  200: "#B9C8DC",
  300: "#8FA6C4",
  400: "#5F7FA6",
  500: "#3C5F8A",
  600: "#2A4C78",
  700: "#17365D",
  800: "#10253F",
  900: "#0B1B2F",
};

const vert = {
  50: "#EEF5F0",
  100: "#E5EFE8",
  200: "#B5D0BF",
  300: "#8DB89D",
  400: "#5E9474",
  500: "#427A5C",
  600: "#32684D",
  700: "#2A5A41",
  800: "#214633",
  900: "#183426",
};

const cuivre = {
  50: "#FDF7F0",
  100: "#FBF1E6",
  200: "#F3DFC8",
  300: "#E9CBAE",
  400: "#D9A877",
  500: "#C28452",
  600: "#A8663F",
  700: "#8A5130",
  800: "#7A4524",
  900: "#5C331B",
};

const rouge = {
  50: "#FBEFEE",
  100: "#F7E3E1",
  200: "#E3B4B4",
  300: "#D68C8C",
  400: "#C76363",
  500: "#B53D3D",
  600: "#9A2F2F",
  700: "#7F2626",
  800: "#651E1E",
  900: "#4B1616",
};

module.exports = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        gray: neutre,
        slate: neutre,
        blue: indigo,
        green: vert,
        amber: cuivre,
        red: rouge,

        primary: {
          DEFAULT: "#17365D", // indigo : boutons principaux, accents
          hover: "#10253F",
          dark: "#10253F", // bleu nuit : menu, titres forts
          light: "#E6ECF4",
        },
        nuit: "#10253F",
        cuivre: "#A8663F",
        or: "#D0AE73",
        // Anciennes teintes pastel, gardées sous leur nom et accordées à la charte.
        mint: "#E5EFE8",
        aqua: "#B9C8DC",
        sky: "#E6ECF4",
        lavender: "#E6ECF4",
        appbg: "#F7F5F0", // ivoire : fond général
        surface: "#FFFFFF",
        statut: {
          soumisBg: "#E5EFE8",
          soumisBorder: "#B5D0BF",
          soumisText: "#2A5A41",
          soumisDot: "#32684D",
          retardBg: "#FBF1E6",
          retardBorder: "#E9CBAE",
          retardText: "#7A4524",
          retardDot: "#A8663F",
          rejeteBg: "#F7E3E1",
          rejeteBorder: "#E3B4B4",
          rejeteText: "#9A2F2F",
          rejeteDot: "#B53D3D",
        },
        succes: "#32684D",
        info: "#2A4C78",
        alerte: "#A8663F",
        danger: { DEFAULT: "#B53D3D", hover: "#9A2F2F" },
        horsligne: "#6B7480",
        ink: {
          DEFAULT: "#10253F",
          muted: "#4E5A68",
          faint: "#6B7480",
        },
        line: "#E6E1D6",
      },
      fontFamily: {
        sans: ["var(--font-manrope)", "Manrope", "Segoe UI", "Arial", "sans-serif"],
        // Grands titres d'accueil et d'identité SEULEMENT — jamais dans un tableau.
        titre: ["var(--font-cormorant)", "Cormorant Garamond", "Georgia", "serif"],
      },
      borderRadius: {
        sm: "7px",
        input: "8px",
        btn: "8px",
        card: "12px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(16, 37, 63, 0.04), 0 4px 14px rgba(16, 37, 63, 0.04)",
        focus: "0 0 0 3px rgba(23, 54, 93, 0.22)",
        barre: "0 -4px 14px rgba(16, 37, 63, 0.06)",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #17365D 0%, #10253F 100%)",
        "brand-gradient-soft": "linear-gradient(135deg, #F7F5F0 0%, #EFEBE2 100%)",
      },
    },
  },
  plugins: [],
};
