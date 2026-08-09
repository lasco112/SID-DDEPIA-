/** @type {import('next').NextConfig} */
const nextConfig = {
  // PWA config would be added here via next-pwa in production

  // pdfkit lit ses fichiers de police (Helvetica.afm...) sur disque, avec des
  // chemins relatifs à SON propre dossier node_modules — le bundling webpack
  // de Next.js casse cette résolution (fichier déplacé dans .next/server/...
  // sans ses .afm). En le laissant "externe", Next.js fait un require() normal
  // au runtime, qui résout correctement depuis node_modules/pdfkit.
  experimental: {
    // Exécute src/instrumentation.ts au démarrage du serveur : c'est là que
    // partent les relances calendaires, faute d'un service planificateur
    // séparé sur Railway.
    instrumentationHook: true,
    // web-push s'appuie sur des modules Node (http, agents proxy) : comme
    // pdfkit, on le laisse hors de l'empaquetage plutôt que de le compiler.
    serverComponentsExternalPackages: ["pdfkit", "web-push", "node-cron"],
  },

  // `serverComponentsExternalPackages` ne couvre pas le module
  // d'instrumentation, qui atteint web-push par la chaîne
  // instrumentation → planificateur → déclencheurs → distributeur. Webpack
  // tentait donc d'y résoudre http, https et net, et le build échouait. On le
  // déclare externe pour toute la compilation serveur : au démarrage, un
  // require() normal le charge depuis node_modules.
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals ?? []), "web-push", "node-cron"];
    }
    return config;
  },

  // Le navigateur met en cache un fichier statique comme /sw.js jusqu'à 24h
  // par défaut, ce qui retarderait d'autant la détection de chaque nouvelle
  // version par les agents de terrain (mise à jour automatique, voir
  // ServiceWorkerRegister.tsx). On force une revérification à chaque visite.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
