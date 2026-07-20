/** @type {import('next').NextConfig} */
const nextConfig = {
  // PWA config would be added here via next-pwa in production

  // pdfkit lit ses fichiers de police (Helvetica.afm...) sur disque, avec des
  // chemins relatifs à SON propre dossier node_modules — le bundling webpack
  // de Next.js casse cette résolution (fichier déplacé dans .next/server/...
  // sans ses .afm). En le laissant "externe", Next.js fait un require() normal
  // au runtime, qui résout correctement depuis node_modules/pdfkit.
  experimental: {
    serverComponentsExternalPackages: ["pdfkit"],
  },
};

export default nextConfig;
