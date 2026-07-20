/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Charte graphique SID DDEPIA-Menoua (maquette Claude Design)
        primary: {
          DEFAULT: "#1e6091",
          dark: "#173a56",
          darker: "#163f5c",
          light: "#eaf1f8",
        },
        appbg: "#eef1f5",
        statut: {
          soumisBg: "#e4f3ea",
          soumisBorder: "#b9dcc6",
          soumisText: "#1f7a44",
          soumisDot: "#1f8a4c",
          retardBg: "#fbecd8",
          retardBorder: "#f0cf9e",
          retardText: "#b45309",
          retardDot: "#d97706",
          rejeteBg: "#fbe4e1",
          rejeteBorder: "#f0b8b1",
          rejeteText: "#b42318",
          rejeteDot: "#c0392b",
        },
        ink: {
          DEFAULT: "#1f2a37",
          muted: "#5b6673",
          faint: "#8a95a3",
        },
        line: "#dde3ea",
      },
      fontFamily: {
        sans: ["Segoe UI", "Tahoma", "Geneva", "Verdana", "Helvetica Neue", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};
