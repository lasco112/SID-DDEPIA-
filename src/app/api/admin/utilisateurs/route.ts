/**
 * GET/POST /api/admin/utilisateurs — administration des comptes (CDC §M1,
 * §4.1). Réservé au DD. Un compte créé démarre INACTIF (en attente
 * d'autorisation) : la personne concernée ne peut se connecter qu'après que
 * le DD l'ait explicitement autorisée (POST .../statut). À sa première
 * connexion, elle complète elle-même ses informations personnelles et choisit
 * son mot de passe définitif (CDC §4.1 : changement obligatoire).
 */
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";
import { genererIdentifiant, genererMotDePasseTemporaire } from "@/lib/generateCredentials";

export async function GET() {
  try {
    const user = await requireUser();
    assertRole(user, ["DD"]);

    const [users, arrondissements, sections] = await Promise.all([
      db.user.findMany({ orderBy: [{ role: "asc" }, { nom: "asc" }], include: { arrondissement: true, section: true } }),
      db.arrondissement.findMany({ orderBy: { ordre: "asc" } }),
      db.section.findMany({ orderBy: { ordre: "asc" } }),
    ]);

    return NextResponse.json({
      arrondissements,
      sections,
      users: users.map((u) => ({
        id: u.id,
        nom: u.nom,
        username: u.username,
        role: u.role,
        arrondissement: u.arrondissement?.nom ?? null,
        section: u.section?.nom ?? null,
        telephone: u.telephone,
        actif: u.actif,
        enAttente: u.actif === false && u.lastLoginAt == null,
        lastLoginAt: u.lastLoginAt,
        createdAt: u.createdAt,
      })),
    });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

interface CreateBody {
  nom: string;
  role: string;
  arrondissementId?: string;
  sectionId?: string;
  telephone?: string;
  whatsapp?: string;
  email?: string;
}

const ROLES_VALIDES = ["DD", "DA", "AGENT_SAISIE", "CHEF_BAC", "CHEF_SSV", "CHEF_PSA", "CHEF_SPAIH", "ADMIN_TECH"];

export async function POST(req: Request) {
  try {
    const admin = await requireUser();
    assertRole(admin, ["DD"]);

    const body = (await req.json()) as CreateBody;
    if (!body.nom?.trim()) {
      return NextResponse.json({ message: "Le nom est obligatoire." }, { status: 400 });
    }
    if (!ROLES_VALIDES.includes(body.role)) {
      return NextResponse.json({ message: "Rôle invalide." }, { status: 400 });
    }
    if ((body.role === "DA" || body.role === "AGENT_SAISIE") && !body.arrondissementId) {
      return NextResponse.json({ message: "Un DA ou un agent de saisie doit être rattaché à un arrondissement." }, { status: 400 });
    }
    if (body.role.startsWith("CHEF_") && !body.sectionId) {
      return NextResponse.json({ message: "Un chef de section doit être rattaché à une section." }, { status: 400 });
    }

    let arrondissementNom: string | undefined;
    if (body.arrondissementId) {
      const arr = await db.arrondissement.findUnique({ where: { id: body.arrondissementId } });
      if (!arr) return NextResponse.json({ message: "Arrondissement introuvable." }, { status: 404 });
      arrondissementNom = arr.nom;
    }
    let sectionCode: string | undefined;
    if (body.sectionId) {
      const sec = await db.section.findUnique({ where: { id: body.sectionId } });
      if (!sec) return NextResponse.json({ message: "Section introuvable." }, { status: 404 });
      sectionCode = sec.code;
    }

    const username = await genererIdentifiant({ role: body.role, arrondissementNom, sectionCode, nom: body.nom });
    const motDePasseTemporaire = genererMotDePasseTemporaire();
    const passwordHash = await bcrypt.hash(motDePasseTemporaire, 10);

    const created = await db.user.create({
      data: {
        nom: body.nom.trim(),
        username,
        passwordHash,
        role: body.role as any,
        arrondissementId: body.role === "DA" || body.role === "AGENT_SAISIE" ? body.arrondissementId : null,
        sectionId: body.role.startsWith("CHEF_") ? body.sectionId : null,
        telephone: body.telephone || null,
        whatsapp: body.whatsapp || null,
        email: body.email || null,
        mustChangePassword: true,
        actif: false, // en attente d'autorisation DD
      },
    });

    await db.auditLog.create({
      data: { userId: admin.id, action: "CREATION_COMPTE", entite: "User", entiteId: created.id, details: { role: body.role, username } },
    });

    return NextResponse.json({ user: { id: created.id, username, nom: created.nom }, motDePasseTemporaire });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}
