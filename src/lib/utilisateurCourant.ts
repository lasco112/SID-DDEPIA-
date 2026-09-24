import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * Le nom de compte de la session, côté serveur — pour les écrans qui gardent
 * des données sur l'appareil (copie hors ligne, file d'attente) : elles sont
 * cloisonnées par compte, plusieurs comptes pouvant se succéder sur un
 * téléphone.
 */
export async function nomDeCompte(): Promise<string> {
  const session = await getServerSession(authOptions);
  return ((session?.user as { username?: string } | undefined)?.username ?? "") as string;
}
