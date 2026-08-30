/**
 * Le client de base cloisonné par département.
 *
 * Pourquoi ce module
 * ------------------
 * Les politiques de sécurité par ligne de PostgreSQL comparent le département
 * d'une ligne à un réglage de session, `app.departement_id`. Prisma ne le pose
 * pas de lui-même, et il ne suffit PAS de le poser une fois à la connexion :
 * les connexions sont mutualisées entre les requêtes. Une valeur laissée
 * derrière soi serait lue par la requête suivante — c'est-à-dire par un autre
 * délégué, peut-être d'un autre département.
 *
 * Le réglage doit donc être posé **par transaction**, avec `set_config(..., true)`
 * — le `true` final signifiant « local à la transaction », effacé à sa fin.
 *
 * Ce que fait ce module
 * ---------------------
 * Il enveloppe chaque opération Prisma dans une transaction qui commence par
 * déclarer le département. L'appelant n'a rien à faire : toute route qui passe
 * par `user.db` est cloisonnée, y compris celles qu'on écrira demain et qui
 * auraient oublié le filtre. C'est le but même de la seconde barrière.
 *
 * Le piège de l'imbrication
 * -------------------------
 * PostgreSQL n'imbrique pas les transactions. Si le code applicatif ouvre
 * lui-même une transaction, les opérations qu'elle contient ne doivent PAS en
 * ouvrir une chacune. Un stockage de contexte asynchrone (`AsyncLocalStorage`)
 * retient la transaction en cours : les opérations s'y raccrochent au lieu
 * d'en créer une nouvelle. C'est aussi ce qui rend `transactionCloisonnee`
 * utilisable comme une transaction ordinaire.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { PrismaClient } from "@prisma/client";

/** La transaction en cours, si le code s'exécute déjà dans l'une des nôtres. */
const transactionCourante = new AsyncLocalStorage<{ tx: unknown }>();

/*
 * PISTE ÉCARTÉE, et pourquoi — à ne pas retenter.
 *
 * On a d'abord voulu attacher le département à la REQUÊTE, via un
 * `AsyncLocalStorage` posé par `requireUser` avec `enterWith`. L'attrait était
 * réel : le même client unique aurait été cloisonné pour tout le monde, y
 * compris les 36 fichiers qui importent `db` directement.
 *
 * Cela ne fonctionne pas. `enterWith` vaut pour le contexte asynchrone courant
 * et ses descendants, PAS pour l'appelant : `requireUser` étant `await`é par la
 * route, le réglage est perdu au retour. Mesuré :
 *
 *     async function identifier() { await …; entrerDansDepartement("dep_menoua"); }
 *     async function route() { await identifier(); return departementDeLaRequete(); }
 *     // → PERDU
 *
 * Et l'échec est SILENCIEUX : aucune erreur, simplement aucun cloisonnement.
 * C'est la forme de faille que ce lot existe pour éviter. Le département est
 * donc porté par le CLIENT, ci-dessous, ce qui ne dépend d'aucune propagation.
 */

/** Nom du réglage PostgreSQL lu par les politiques de sécurité par ligne. */
export const REGLAGE_DEPARTEMENT = "app.departement_id";

/**
 * Une transaction cloisonnée toute prête — le `user.transaction` d'une session.
 *
 * Ce type permet aux modules serveur d'exiger une vraie transaction sans
 * dépendre de `lib/permissions`, donc sans traîner next-auth derrière eux.
 */
export type Transactionnelle = <T>(travail: (tx: PrismaClient) => Promise<T>) => Promise<T>;

/**
 * Les clients fabriqués par `clientCloisonne`, pour pouvoir les reconnaître.
 *
 * Motif — mesuré, pas supposé. Passer un client DÉJÀ étendu à
 * `transactionCloisonnee` part en récursion infinie : la transaction ouverte
 * depuis un client étendu rend un `tx` lui-même étendu, chaque opération
 * repasse donc par l'extension, qui se rappelle sur le même `tx`, sans fin. Le
 * processus consomme toute la mémoire disponible avant d'être tué — sur
 * Railway, le service redémarre sans laisser d'erreur exploitable.
 *
 * Le garde-fou ci-dessous transforme cette panne en refus immédiat et lisible.
 */
const clientsEtendus = new WeakMap<object, string>();

/**
 * Le département qu'un client cloisonné déclare, ou `null` s'il n'en déclare
 * aucun (client de base, client de transaction).
 *
 * Sert à NOMMER le département sans avoir à le déduire des lignes qu'on voit :
 * la déduction par les arrondissements échouait pour un département qui n'en a
 * pas encore, et faisait alors échouer ses relances.
 */
export function departementDeClient(client: unknown): string | null {
  return (typeof client === "object" && client !== null && clientsEtendus.get(client)) || null;
}

/** Déclare le département auprès de la base, pour la durée de la transaction. */
async function declarer(tx: { $executeRawUnsafe: (s: string, ...a: unknown[]) => Promise<unknown> }, departementId: string) {
  // `true` : local à la transaction. Sans lui, la valeur survivrait sur la
  // connexion mutualisée et serait lue par la requête d'un autre utilisateur.
  await tx.$executeRawUnsafe(`SELECT set_config('${REGLAGE_DEPARTEMENT}', $1, true)`, departementId);
}

/** Le premier caractère en minuscule : « SaisieMatrice » → « saisieMatrice ». */
const enPropriete = (modele: string) => modele.charAt(0).toLowerCase() + modele.slice(1);

/**
 * Ouvre une transaction déclarant le département, et y exécute `travail`.
 * À utiliser partout où le code applicatif a besoin d'une vraie transaction —
 * à la place de `db.$transaction`, qui n'aurait pas déclaré le département et
 * dont les opérations seraient donc masquées par les politiques.
 */
export function transactionCloisonnee<T>(
  base: PrismaClient,
  departementId: string | null,
  travail: (tx: PrismaClient) => Promise<T>
): Promise<T> {
  if (clientsEtendus.has(base)) {
    throw new Error(
      "transactionCloisonnee attend le client de base, jamais un client déjà cloisonné " +
        "(`user.db`) : la transaction partirait en récursion infinie. Depuis une route, " +
        "utiliser `user.transaction(...)`."
    );
  }

  const dejaOuverte = transactionCourante.getStore();
  if (dejaOuverte) return travail(dejaOuverte.tx as PrismaClient);

  return base.$transaction(async (tx) => {
    if (departementId) await declarer(tx as never, departementId);
    return transactionCourante.run({ tx }, () => travail(tx as PrismaClient));
  });
}

/**
 * Enveloppe un client pour que CHAQUE opération déclare le département donné.
 * C'est `requireUser` qui le fabrique, à partir du département de
 * l'utilisateur, et le place dans `user.db`.
 *
 * `departementId` nul — l'ADMIN_TECH, qui n'a aucun droit métier — rend le
 * client tel quel.
 */
export function clientCloisonne(base: PrismaClient, departementId: string | null): PrismaClient {
  if (!departementId) return base;

  const etendu = base.$extends({
    query: {
      $allOperations({ model, operation, args, query }) {
        // Les opérations sans modèle — $queryRaw, $executeRaw, $connect — ne
        // passent pas par une table : les envelopper n'apporterait rien et
        // casserait les requêtes d'administration.
        if (!model) return query(args);

        const dejaOuverte = transactionCourante.getStore();
        if (dejaOuverte) {
          const tx = dejaOuverte.tx as Record<string, Record<string, (a: unknown) => Promise<unknown>>>;
          return tx[enPropriete(model)][operation](args);
        }

        return base.$transaction(async (tx) => {
          await declarer(tx as never, departementId);
          const client = tx as unknown as Record<string, Record<string, (a: unknown) => Promise<unknown>>>;
          return transactionCourante.run({ tx }, () => client[enPropriete(model)][operation](args));
        });
      },
    },
  }) as unknown as PrismaClient;

  clientsEtendus.set(etendu, departementId);
  return etendu;
}
