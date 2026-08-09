/**
 * instrumentation.ts — point d'entrée exécuté UNE FOIS au démarrage du serveur.
 *
 * Sert à faire partir les relances calendaires (rappel du 27, retard du 28…)
 * depuis le processus de l'application, faute d'un second service sur Railway.
 *
 * Rien ici ne doit jamais empêcher le démarrage : l'import est dynamique et
 * l'erreur est avalée. Une relance manquée est un désagrément ; un service qui
 * refuse de démarrer est une panne pour six arrondissements.
 */
export async function register() {
  // Le runtime « edge » n'a ni accès à la base ni aux minuteries longues.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { demarrerPlanificateur } = await import("@/server/cron/planificateur");
    demarrerPlanificateur();
  } catch (e) {
    console.error("[instrumentation] planificateur des relances non démarré :", e);
  }
}
