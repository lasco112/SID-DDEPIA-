/**
 * Les notifications sur le téléphone, côté navigateur : où en est CET
 * appareil, et l'abonnement après le consentement de l'agent.
 *
 * Partagé par la cloche du bandeau et par l'invitation qui suit la
 * connexion (InvitationNotifications.tsx). Le navigateur ne pose sa question
 * d'autorisation qu'à la suite d'un geste de l'agent : `activer()` ne doit
 * être appelée que depuis un clic.
 *
 * iPhone : les notifications n'existent que pour l'application ajoutée à
 * l'écran d'accueil (iOS 16.4 et suivants). Dans Safari, l'état est
 * « indisponible » et rien n'est proposé.
 */

export type EtatNotifications = "indisponible" | "proposable" | "actif" | "refuse";

export async function etatNotifications(): Promise<EtatNotifications> {
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return "indisponible";
  }
  if (Notification.permission === "denied") return "refuse";
  try {
    const res = await fetch("/api/notifications/abonnement");
    if (!res.ok) return "indisponible";
    const { disponible } = await res.json();
    if (!disponible) return "indisponible";
    const reg = await navigator.serviceWorker.ready;
    const abo = await reg.pushManager.getSubscription();
    if (!abo) return "proposable";
    // L'appareil est abonné ; on redonne l'adresse au serveur, qui la
    // rattache au compte connecté (un autre agent a pu se servir du téléphone).
    await enregistrer(abo);
    return "actif";
  } catch {
    return "indisponible";
  }
}

async function enregistrer(abo: PushSubscription) {
  const json = abo.toJSON();
  await fetch("/api/notifications/abonnement", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, appareil: navigator.userAgent.slice(0, 120) }),
  });
}

/** À appeler depuis un clic : le navigateur pose alors sa propre question. */
export async function activerNotifications(): Promise<EtatNotifications> {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return permission === "denied" ? "refuse" : "proposable";

    const { clePublique } = await (await fetch("/api/notifications/abonnement")).json();
    if (!clePublique) return "indisponible";

    const reg = await navigator.serviceWorker.ready;
    const abo =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64EnTableau(clePublique) }));
    await enregistrer(abo);
    return "actif";
  } catch (e) {
    console.error("[push] abonnement impossible", e);
    return "indisponible";
  }
}

/** La clé VAPID voyage en base64url ; l'API du navigateur attend des octets. */
function base64EnTableau(base64url: string): ArrayBuffer {
  const rembourrage = "=".repeat((4 - (base64url.length % 4)) % 4);
  const brut = atob((base64url + rembourrage).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(brut, (c) => c.charCodeAt(0)).buffer;
}

/** Prévient les autres composants (la cloche) qu'un appareil vient de changer d'état. */
export const EVENEMENT_ETAT_NOTIFICATIONS = "sid:etat-notifications";
