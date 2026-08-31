/**
 * Le banc d'essai, interruptible.
 *
 * Pourquoi cela existe
 * --------------------
 * Vingt cas se jugent en une quarantaine de minutes, mais rarement d'un trait :
 * on est appelé, on ferme l'onglet, on revient le lendemain. Sans conservation
 * de l'avancement, il faudrait tout recommencer — et un essai qu'on doit
 * refaire est un essai qu'on ne fait pas.
 *
 * Ce que ce module garantit
 * -------------------------
 * L'anonymat survit à la reprise, et il est garanti par le TYPE : `casSuivant`
 * ne peut pas rendre le nom d'un modèle, parce que son type de retour ne le
 * porte pas. Un écran ne peut donc pas le divulguer par mégarde, même en le
 * cherchant. Le dépouillement relit la colonne, mais seulement à la fin.
 *
 * Les lettres sont figées à la création du cas et jamais retirées au sort à la
 * reprise : sans cela, revenir sur un cas déjà vu montrerait les mêmes textes
 * sous d'autres lettres, et le Délégué croirait à une erreur.
 */
import type { PrismaClient } from "@prisma/client";
import type { PropositionModele } from "./passerelle";
import { anonymiser, depouiller, classer, type Lettre, type ChoixDepouille, type Classement } from "./bancEssai";

/** Ce qui est conservé pour un cas — le modèle inclus, côté serveur seulement. */
interface PropositionEnregistree {
  lettre: Lettre;
  texte: string;
  modele: string;
}

/**
 * Ce que le Délégué reçoit. Ce type ne porte AUCUN nom de modèle, et c'est
 * exprès : l'anonymat est ainsi garanti par le compilateur, pas par la
 * vigilance de celui qui écrira l'écran.
 */
export interface CasAJuger {
  id: string;
  ordre: number;
  intitule: string;
  candidats: { lettre: Lettre; texte: string }[];
  /** Où l'on en est : « cas 7 sur 20 ». */
  total: number;
  juges: number;
}

/**
 * Crée un cas et l'ajoute à l'essai. Les lettres sont tirées au sort ici, une
 * fois pour toutes.
 */
export async function ajouterCas(
  db: PrismaClient,
  essaiId: string,
  ordre: number,
  intitule: string,
  propositions: PropositionModele[]
): Promise<void> {
  const cas = anonymiser(propositions);
  const enregistrees: PropositionEnregistree[] = cas.candidats.map((c) => ({
    lettre: c.lettre,
    texte: c.texte,
    modele: cas.correspondance.get(c.lettre)!,
  }));

  await db.casBancEssai.create({
    data: { essaiId, ordre, intitule, propositions: enregistrees as never },
  });
}

/**
 * Le prochain cas à juger, ou `null` si l'essai est terminé.
 *
 * C'est la reprise : on repart du premier cas sans réponse, quel que soit le
 * temps écoulé.
 */
export async function casSuivant(db: PrismaClient, essaiId: string): Promise<CasAJuger | null> {
  const [total, juges, prochain] = await Promise.all([
    db.casBancEssai.count({ where: { essaiId } }),
    db.casBancEssai.count({ where: { essaiId, lettreChoisie: { not: null } } }),
    db.casBancEssai.findFirst({
      where: { essaiId, lettreChoisie: null },
      orderBy: { ordre: "asc" },
    }),
  ]);

  if (!prochain) return null;

  const propositions = prochain.propositions as unknown as PropositionEnregistree[];
  return {
    id: prochain.id,
    ordre: prochain.ordre,
    intitule: prochain.intitule,
    // Le nom du modèle est écarté ICI, à la seule frontière qui compte.
    candidats: propositions.map((p) => ({ lettre: p.lettre, texte: p.texte })),
    total,
    juges,
  };
}

/**
 * Enregistre le choix du Délégué sur un cas.
 *
 * Un cas déjà jugé n'est pas rejugé : revenir en arrière et changer d'avis
 * après avoir vu d'autres cas fausserait le décompte.
 */
export async function repondre(db: PrismaClient, casId: string, lettre: Lettre): Promise<void> {
  const cas = await db.casBancEssai.findUnique({ where: { id: casId } });
  if (!cas) throw new Error("Ce cas n'existe pas.");
  if (cas.lettreChoisie) throw new Error("Ce cas a déjà été jugé.");

  const propositions = cas.propositions as unknown as PropositionEnregistree[];
  if (!propositions.some((p) => p.lettre === lettre)) {
    throw new Error(`La lettre « ${lettre} » ne figure pas dans ce cas.`);
  }

  await db.casBancEssai.update({
    where: { id: casId },
    data: { lettreChoisie: lettre, repondueLe: new Date() },
  });
}

/**
 * Dépouille l'essai complet.
 *
 * C'est le seul endroit où la correspondance lettre → modèle est relue. Elle ne
 * l'est jamais avant, et jamais pour un cas non jugé.
 */
export async function classementDeLEssai(db: PrismaClient, essaiId: string): Promise<Classement> {
  const juges = await db.casBancEssai.findMany({
    where: { essaiId, lettreChoisie: { not: null } },
    orderBy: { ordre: "asc" },
  });

  const choix: ChoixDepouille[] = juges.map((cas) => {
    const propositions = cas.propositions as unknown as PropositionEnregistree[];
    const correspondance = new Map<Lettre, string>(propositions.map((p) => [p.lettre, p.modele]));
    return depouiller({ candidats: [], correspondance }, cas.lettreChoisie as Lettre);
  });

  return classer(choix);
}

/** Supprime un essai — pour reprendre à zéro, ou faire le ménage après coup. */
export async function supprimerEssai(db: PrismaClient, essaiId: string): Promise<number> {
  const { count } = await db.casBancEssai.deleteMany({ where: { essaiId } });
  return count;
}
