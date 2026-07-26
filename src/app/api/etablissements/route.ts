/**
 * GET/POST /api/etablissements — registre des établissements NOMINATIF
 * (couvoirs, fermes de ponte, fermes de poulets de chair, provenderies).
 * CDC §B.5.3 : ce registre était en données de démonstration, remplacé ici
 * par un vrai module de gestion (ajout + modification, jamais de suppression
 * définitive — cf. Etablissement.actif).
 *
 * DA / AGENT_SAISIE : uniquement SON arrondissement (jamais un autre — §A.2) —
 * l'agent partage le registre de son DA, jamais celui d'un autre arrondissement.
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
    assertRole(user, ["DA", "DD", "AGENT_SAISIE"]);

    const { searchParams } = new URL(req.url);
    const typeCode = searchParams.get("typeCode");
    const arrondissementIdParam = searchParams.get("arrondissementId");
    if (!typeCode || !TYPES_VALIDES.includes(typeCode)) {
      return NextResponse.json({ message: "typeCode invalide" }, { status: 400 });
    }

    let arrondissementId: string;
    if (user.role === "DA" || user.role === "AGENT_SAISIE") {
      if (!user.arrondissementId) return NextResponse.json({ message: "Compte sans arrondissement assigné" }, { status: 400 });
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
    assertRole(user, ["DA", "DD", "AGENT_SAISIE"]);

    const body = (await req.json()) as {
      /**
       * Identifiant généré sur l'appareil (UUID) quand la création a eu lieu
       * hors ligne. On l'utilise comme clé primaire pour rendre l'envoi
       * IDEMPOTENT : si le réseau coupe après l'enregistrement mais avant la
       * réponse, l'appareil rejouera l'opération sans créer de doublon.
       */
      id?: string;
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
    if (user.role === "DA" || user.role === "AGENT_SAISIE") {
      if (!user.arrondissementId) return NextResponse.json({ message: "Compte sans arrondissement assigné" }, { status: 400 });
      arrondissementId = user.arrondissementId;
    } else {
      if (!body.arrondissementId) return NextResponse.json({ message: "arrondissementId requis" }, { status: 400 });
      arrondissementId = body.arrondissementId;
    }

    const donnees = {
      typeCode: body.typeCode,
      nom: body.nom.trim(),
      localite: body.localite.trim(),
      proprietaire: body.proprietaire?.trim() || null,
      telephone: body.telephone?.trim() || null,
      arrondissementId,
    };

    // upsert plutôt que create quand l'appareil fournit son identifiant :
    // un même envoi rejoué après une coupure réseau met simplement à jour la
    // ligne déjà créée, au lieu d'ajouter un doublon.
    const etablissement = body.id
      ? await db.etablissement.upsert({
          where: { id: body.id },
          create: { id: body.id, ...donnees },
          update: donnees,
        })
      : await db.etablissement.create({ data: donnees });

    await db.auditLog.create({
      data: { userId: user.id, action: "CREATION_ETABLISSEMENT", entite: "Etablissement", entiteId: etablissement.id, details: { nom: etablissement.nom, typeCode: etablissement.typeCode } },
    });

    return NextResponse.json({ etablissement }, { status: 201 });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}
