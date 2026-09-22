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
  webpack: (config, { isServer, nextRuntime, webpack }) => {
    if (isServer) {
      config.externals = [...(config.externals ?? []), "web-push", "node-cron"];
    }

    // Le paquet « edge » ne doit jamais contenir le planificateur.
    //
    // instrumentation.ts sort immédiatement quand NEXT_RUNTIME n'est pas
    // "nodejs" : ce module n'est donc JAMAIS exécuté en edge. Mais webpack
    // traverse tout de même le graphe de son import dynamique, atteint
    // journal.ts et bute sur son « node:crypto » :
    //
    //   UnhandledSchemeError: Reading from "node:crypto" is not handled by
    //   plugins (Unhandled scheme).
    //
    // Le compilateur edge ne sait pas lire le préfixe « node: », et TOUTE la
    // construction échoue — pour du code qui n'y tournerait jamais. Le préfixe
    // est la convention du projet (vingt fichiers l'emploient) et n'a pas à
    // être abandonné pour contourner cela.
    //
    // On retire donc ce seul module du seul paquet edge. La compilation nodejs
    // le garde intact : c'est elle qui fait réellement partir les relances.
    if (nextRuntime === "edge") {
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /server[\\/]cron[\\/]planificateur/,
        })
      );
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
