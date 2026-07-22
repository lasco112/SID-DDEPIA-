/**
 * GET /api/demo/etat — la requête courante est-elle servie par l'environnement
 * de démonstration ? Source de vérité unique du bandeau (correction n°10,
 * §10.2), car il existe deux façons d'être en démo :
 *   - session dédiée ouverte depuis /demo (le JWT porte isDemo) ;
 *   - compte RÉEL basculé par la démonstration globale du Super Administrateur
 *     (le JWT dit isDemo=false — seul le serveur sait qu'il est remappé).
 * Le client ne peut donc pas se fier au seul jeton : il demande au serveur.
 */
import { NextResponse } from "next/server";
import { requireUser, permissionErrorResponse } from "@/lib/permissions";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json({ demo: user.isDemo, role: user.role });
  } catch (e) {
    const { status } = permissionErrorResponse(e);
    // Non connecté : pas de bandeau, mais pas d'erreur bruyante côté client.
    return NextResponse.json({ demo: false }, { status: status === 401 ? 200 : status });
  }
}
