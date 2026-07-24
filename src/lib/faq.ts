/**
 * faq.ts — questions fréquentes de l'aide contextuelle (bouton « Aide »).
 * Chaque entrée peut être limitée à certains rôles et/ou certains types de
 * tableau (`contexte`), pour que l'aide affichée quand quelqu'un est bloqué
 * sur un tableau précis parle de CE tableau, pas de tout le système à la fois.
 * Les questions sans `roles`/`typeTableau` s'affichent toujours en général.
 */

export interface QuestionFAQ {
  question: string;
  reponse: string;
  roles?: string[];
  typeTableau?: Array<"MATRICE" | "NOMINATIF" | "EVENEMENT">;
}

export const FAQ: QuestionFAQ[] = [
  {
    question: "Que veut dire « N/D » et pourquoi dois-je donner un motif ?",
    reponse:
      "N/D signifie « non renseigné » : la donnée n'a pas pu être collectée ce mois-ci (différent de zéro, qui est une vraie valeur mesurée). Le motif est obligatoire pour que le DD comprenne pourquoi, au lieu d'un simple vide.",
    typeTableau: ["MATRICE", "NOMINATIF"],
  },
  {
    question: "Comment ajouter un établissement qui n'existe pas encore dans la liste ?",
    reponse:
      "Cliquez sur « + Ajouter un établissement » en haut du tableau (couvoirs, fermes, provenderies) : il apparaît immédiatement dans la liste, sans quitter la page.",
    typeTableau: ["NOMINATIF"],
  },
  {
    question: "Comment ajouter un événement (foyer, vaccination, saisie...) ?",
    reponse: "Cliquez sur « + Ajouter un événement » en bas du tableau : une nouvelle ligne vide apparaît à remplir.",
    typeTableau: ["EVENEMENT"],
  },
  {
    question: "Mes données sont-elles perdues si je n'ai pas de réseau ?",
    reponse:
      "Non. Tout ce que vous saisissez est d'abord enregistré sur votre appareil (statut « Enregistrée sur l'appareil »). Dès que le réseau revient, l'envoi se fait automatiquement — rien ne se perd, même après avoir fermé l'application.",
  },
  {
    question: "Que veulent dire les statuts à côté de chaque valeur saisie ?",
    reponse:
      "Enregistrée sur l'appareil = pas encore envoyée ; En attente de synchronisation = en file d'envoi ; Synchronisée = bien reçue par le serveur ; Erreur de synchronisation = l'envoi a échoué (le message exact apparaît au survol), la donnée reste sur l'appareil et sera renvoyée automatiquement.",
  },
  {
    question: "Comment retrouver rapidement une page ou un tableau ?",
    reponse: "Utilisez l'icône de recherche (loupe) dans l'en-tête, ou le raccourci Ctrl+K, et tapez quelques lettres.",
  },
  {
    question: "J'ai oublié mon mot de passe, que faire ?",
    reponse: "Contactez le Délégué Départemental : il peut réinitialiser votre mot de passe depuis « Comptes utilisateurs ».",
    roles: ["DA", "AGENT_SAISIE", "CHEF_BAC", "CHEF_SSV", "CHEF_PSA", "CHEF_SPAIH", "ADMIN_TECH"],
  },
  {
    question: "Comment attribuer un tableau ou une section à un agent de saisie ?",
    reponse:
      "Depuis « Organisation du travail » (menu latéral), choisissez l'agent responsable tableau par tableau, ou attribuez toute une section en une fois. Ceci reste indicatif : tout agent de l'arrondissement peut quand même intervenir si besoin.",
    roles: ["DA"],
  },
  {
    question: "Un code PIN peut-il verrouiller l'application sur un appareil partagé ?",
    reponse: "Oui, depuis l'icône cadenas dans l'en-tête (« Sécurité de l'appareil »). Optionnel, purement local à cet appareil.",
  },
];

export function faqPertinente(role: string, typeTableau?: string | null): QuestionFAQ[] {
  const specifiques = FAQ.filter(
    (q) => (q.typeTableau && typeTableau && q.typeTableau.includes(typeTableau as any)) || (q.roles && q.roles.includes(role) && !q.typeTableau)
  );
  const generales = FAQ.filter((q) => !q.typeTableau && !q.roles);
  // Les questions liées au contexte courant (tableau ouvert, rôle) d'abord.
  return [...specifiques, ...generales.filter((q) => !specifiques.includes(q))];
}
