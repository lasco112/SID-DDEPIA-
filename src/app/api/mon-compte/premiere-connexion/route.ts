/**
 * POST /api/mon-compte/premiere-connexion — la personne concernée complète
 * ses informations personnelles et choisit son mot de passe définitif après
 * avoir été autorisée par le DD (CDC §4.1 : changement obligatoire à la
 * première connexion).
 */
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { clientCloisonne } from "@/lib/dbCloisonne";
import { compteParId } from "@/lib/comptes";

interface Body {
  nom: string;
  telephone?: string;
  whatsapp?: string;
  email?: string;
  nouveauMotDePasse: string;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Non authentifié" }, { status: 401 });
  }

  const body = (await req.json()) as Body;
  if (!body.nom?.trim()) {
    return NextResponse.json({ message: "Le nom est obligatoire." }, { status: 400 });
  }
  if (!body.nouveauMotDePasse || body.nouveauMotDePasse.length < 8) {
    return NextResponse.json({ message: "Le mot de passe doit contenir au moins 8 caractères." }, { status: 400 });
  }

  const userId = (session.user as any).id as string;

  /*
   * Pas `requireUser()` ici : pendant une démonstration globale, il remappe le
   * compte réel sur son jumeau fictif — le mot de passe changerait alors sur la
   * mauvaise base, et le compte réel resterait bloqué en première connexion.
   *
   * On reste donc sur le compte de la session, dont on lit le département pour
   * déclarer le cloisonnement au moment d'écrire. Cette lecture-là est la seule
   * qui précède le cloisonnement, exactement comme celle que `resoudreContexte`
   * fait à chaque requête (voir docs/CLOISONNEMENT.md).
   */
  const compte = await compteParId(db, userId);
  if (!compte) {
    return NextResponse.json({ message: "Compte introuvable" }, { status: 401 });
  }
  const base = clientCloisonne(db, compte.departementId);

  const passwordHash = await bcrypt.hash(body.nouveauMotDePasse, 10);

  await base.user.update({
    where: { id: userId },
    data: {
      nom: body.nom.trim(),
      telephone: body.telephone || null,
      whatsapp: body.whatsapp || null,
      email: body.email || null,
      passwordHash,
      mustChangePassword: false,
    },
  });

  await base.auditLog.create({
    data: { userId, action: "PREMIERE_CONNEXION_COMPLETEE", entite: "User", entiteId: userId },
  });

  return NextResponse.json({ ok: true });
}
