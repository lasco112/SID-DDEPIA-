/**
 * GET /api/admin-systeme/departements — l'état de chaque département : allumé
 * ou non, ses arrondissements, ses comptes, ses modèles Word, ce qui manque
 * pour le lancer. Réservé à l'administrateur du système.
 */
import { NextResponse } from "next/server";
import { etatDesDepartements } from "@/server/administration/systeme";
import { administrateur, reponseErreur } from "../garde";

export async function GET() {
  try {
    const admin = await administrateur();
    return NextResponse.json({ departements: await etatDesDepartements(admin.departementId) });
  } catch (e) {
    return reponseErreur(e);
  }
}
