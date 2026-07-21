/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Charte graphique officielle SID DDEPIA (pastel doux + bleu pétrole pour les actions).
        primary: {
          DEFAULT: "#397781",
          hover: "#2F6871",
          dark: "#2F6871",
          light: "#E9F5F4",
        },
        mint: "#B8E8D5",
        aqua: "#A8DFE5",
        sky: "#BBD8F3",
        lavender: "#D4D5F5",
        appbg: "#F8FAFB",
        surface: "#FFFFFF",
        statut: {
          soumisBg: "#E6F5EF",
          soumisBorder: "#BFE3D3",
          soumisText: "#3E8F71",
          soumisDot: "#5DAF91",
          retardBg: "#FBF1E1",
          retardBorder: "#EFD9AE",
          retardText: "#A87A2A",
          retardDot: "#D9A84E",
          rejeteBg: "#FBEBEC",
          rejeteBorder: "#F0C4C6",
          rejeteText: "#B84F55",
          rejeteDot: "#D96C72",
        },
        succes: "#5DAF91",
        info: "#609CC7",
        alerte: "#D9A84E",
        danger: { DEFAULT: "#D96C72", hover: "#C25158" },
        horsligne: "#74868B",
        ink: {
          DEFAULT: "#2F4147",
          muted: "#667A80",
          faint: "#AAB8BC",
        },
        line: "#DCE7E9",
      },
      fontFamily: {
        sans: ["var(--font-manrope)", "Manrope", "Segoe UI", "Arial", "sans-serif"],
      },
      borderRadius: {
        sm: "8px",
        input: "10px",
        btn: "12px",
        card: "16px",
      },
      boxShadow: {
        card: "0 6px 20px rgba(47, 65, 71, 0.06)",
        focus: "0 0 0 3px rgba(92, 163, 171, 0.15)",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #B8E8D5 0%, #A8DFE5 50%, #BBD8F3 100%)",
        "brand-gradient-soft": "linear-gradient(135deg, #E9F7F1 0%, #EDF7F8 50%, #EEF2FB 100%)",
      },
    },
  },
  plugins: [],
};
