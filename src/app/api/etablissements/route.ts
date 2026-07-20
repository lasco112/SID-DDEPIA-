/**
 * GET/POST /api/etablissements — registre des établissements NOMINATIF
 * (couvoirs, fermes de ponte, fermes de poulets de chair, provenderies).
 * CDC §B.5.3 : ce registre était en données de démonstration, remplacé ici
 * par un vrai module de gestion (ajout + modification, jamais de suppression
 * définitive — cf. Etablissement.actif).
 *
 * DA : uniquement SON arrondissement (jamais un autre — §A.2).
 * DD : n'importe quel arrondissement (doit le préciser explicitement).
 * ADMIN_TECH exclu (aucun droit métier, CDC §A.2).
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";

const TYPES_VALIDES = ["ETAB_COUVOIR", "ETAB_FERME_PONTE", "ETAB_FERME_CHAIR", "ETAB_PROVENDERIE"];

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, ["DA", "DD"]);

    const { searchParams } = new URL(req.url);
    const typeCode = searchParams.get("typeCode");
    const arrondissementIdParam = searchParams.get("arrondissementId");
    if (!typeCode || !TYPES_VALIDES.includes(typeCode)) {
      return NextResponse.json({ message: "typeCode invalide" }, { status: 400 });
    }

    let arrondissementId: string;
    if (user.role === "DA") {
      if (!user.arrondissementId) return NextResponse.json({ message: "Compte DA sans arrondissement assigné" }, { status: 400 });
      arrondissementId = user.arrondissementId;
    } else {
      if (!arrondissementIdParam) return NextResponse.json({ message: "arrondissementId requis" }, { status: 400 });
      arrondissementId = arrondissementIdParam;
    }

    const etablissements = await db.etablissement.findMany({
      where: { typeCode, arrondissementId },
      orderBy: [{ actif: "desc" }, { nom: "asc" }],
    });
    return NextResponse.json({ etablissements });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, ["DA", "DD"]);

    const body = (await req.json()) as {
      typeCode: string;
      nom: string;
      localite: string;
      proprietaire?: string;
      telephone?: string;
      arrondissementId?: string;
    };

    if (!body.typeCode || !TYPES_VALIDES.includes(body.typeCode)) {
      return NextResponse.json({ message: "typeCode invalide" }, { status: 400 });
    }
    if (!body.nom?.trim() || !body.localite?.trim()) {
      return NextResponse.json({ message: "Nom et localité requis" }, { status: 400 });
    }

    let arrondissementId: string;
    if (user.role === "DA") {
      if (!user.arrondissementId) return NextResponse.json({ message: "Compte DA sans arrondissement assigné" }, { status: 400 });
      arrondissementId = user.arrondissementId;
    } else {
      if (!body.arrondissementId) return NextResponse.json({ message: "arrondissementId requis" }, { status: 400 });
      arrondissementId = body.arrondissementId;
    }

    const etablissement = await db.etablissement.create({
      data: {
        typeCode: body.typeCode,
        nom: body.nom.trim(),
        localite: body.localite.trim(),
        proprietaire: body.proprietaire?.trim() || null,
        telephone: body.telephone?.trim() || null,
        arrondissementId,
      },
    });

    await db.auditLog.create({
      data: { userId: user.id, action: "CREATION_ETABLISSEMENT", entite: "Etablissement", entiteId: etablissement.id, details: { nom: etablissement.nom, typeCode: etablissement.typeCode } },
    });

    return NextResponse.json({ etablissement }, { status: 201 });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}
