/**
 * La photo d'un établissement (21 octobre 2026) — prise par le téléphone,
 * compressée sur l'appareil, gardée en base (jamais sur le disque du serveur).
 *
 *   GET    /api/etablissements/[id]/photo   l'image
 *   PUT    /api/etablissements/[id]/photo   { image: "data:image/jpeg;base64,…" }
 *   DELETE /api/etablissements/[id]/photo
 *
 * Même ressort que le registre : le DD tout son département, un DA ou un agent
 * son arrondissement. Le cloisonnement du département s'applique (user.db).
 */
import { NextResponse } from "next/server";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";

const TAILLE_MAX = 900 * 1024; // une photo compressée sur le téléphone pèse 100 à 300 Ko

async function etablissementDuRessort(user: Awaited<ReturnType<typeof requireUser>>, id: string) {
  const e = await user.db.etablissement.findUnique({ where: { id }, select: { id: true, nom: true, arrondissementId: true } });
  if (!e) return { refus: NextResponse.json({ message: "Établissement introuvable" }, { status: 404 }) };
  if (user.role !== "DD" && e.arrondissementId !== user.arrondissementId) {
    return { refus: NextResponse.json({ message: "Cet établissement n'est pas dans votre arrondissement." }, { status: 403 }) };
  }
  return { e };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    assertRole(user, ["DA", "DD", "AGENT_SAISIE"]);
    const r = await etablissementDuRessort(user, params.id);
    if ("refus" in r) return r.refus;
    const photo = await user.db.photoEtablissement.findUnique({ where: { etablissementId: params.id }, select: { contenu: true, typeMime: true } });
    if (!photo) return NextResponse.json({ message: "Pas de photo." }, { status: 404 });
    return new NextResponse(Buffer.from(photo.contenu), {
      headers: { "Content-Type": photo.typeMime, "Cache-Control": "private, max-age=0, must-revalidate" },
    });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    assertRole(user, ["DA", "DD", "AGENT_SAISIE"]);
    const r = await etablissementDuRessort(user, params.id);
    if ("refus" in r) return r.refus;
    const { image } = (await req.json()) as { image?: string };
    const m = typeof image === "string" ? /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(image) : null;
    if (!m) return NextResponse.json({ message: "Photo illisible." }, { status: 400 });
    const contenu = Buffer.from(m[2], "base64");
    if (contenu.length > TAILLE_MAX) return NextResponse.json({ message: "Photo trop lourde." }, { status: 413 });

    await user.db.photoEtablissement.upsert({
      where: { etablissementId: params.id },
      create: { etablissementId: params.id, contenu, typeMime: m[1], auteurId: user.id },
      update: { contenu, typeMime: m[1], auteurId: user.id, prisLe: new Date() },
    });
    await user.db.auditLog.create({
      data: { userId: user.id, action: "PHOTO_ETABLISSEMENT", entite: "Etablissement", entiteId: params.id, details: { nom: r.e.nom, octets: contenu.length } },
    });
    return NextResponse.json({ enregistre: true });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    assertRole(user, ["DA", "DD", "AGENT_SAISIE"]);
    const r = await etablissementDuRessort(user, params.id);
    if ("refus" in r) return r.refus;
    await user.db.photoEtablissement.deleteMany({ where: { etablissementId: params.id } });
    await user.db.auditLog.create({
      data: { userId: user.id, action: "PHOTO_ETABLISSEMENT_RETIREE", entite: "Etablissement", entiteId: params.id, details: { nom: r.e.nom } },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}
