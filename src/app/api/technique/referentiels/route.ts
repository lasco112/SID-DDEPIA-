/**
 * GET/POST /api/technique/referentiels — gestion des listes de référence
 * (maladies, vaccins, espèces, actes vétérinaires, motifs de saisie, unités,
 * types d'établissement), réservé à ADMIN_TECH. Ce sont des listes de
 * configuration (alimentent les menus déroulants de saisie), pas des données
 * métier — d'où l'autorisation pour ce rôle (CDC §A.2).
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";
import { CATEGORIES_STRUCTURELLES } from "@/lib/categoriesStructurelles";

const CATEGORIES_VALIDES = [
  "ESPECE",
  "VOLAILLE",
  "CATEGORIE_ANIMALE",
  "MALADIE",
  "VACCIN",
  "ACTE_VETERINAIRE",
  "MOTIF_SAISIE",
  "ESPECE_HALIEUTIQUE",
  "UNITE",
  "TYPE_ETABLISSEMENT",
];

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, ["ADMIN_TECH"]);

    const { searchParams } = new URL(req.url);
    const categorie = searchParams.get("categorie");
    if (!categorie || !CATEGORIES_VALIDES.includes(categorie)) {
      return NextResponse.json({ message: "categorie invalide", categoriesValides: CATEGORIES_VALIDES }, { status: 400 });
    }

    const items = await db.referentielItem.findMany({
      where: { categorie: categorie as any },
      orderBy: [{ actif: "desc" }, { ordre: "asc" }, { libelle: "asc" }],
    });
    return NextResponse.json({ items, categoriesValides: CATEGORIES_VALIDES });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, ["ADMIN_TECH"]);

    const body = (await req.json()) as { categorie: string; code: string; libelle: string; libelleEn?: string };
    if (!body.categorie || !CATEGORIES_VALIDES.includes(body.categorie)) {
      return NextResponse.json({ message: "categorie invalide" }, { status: 400 });
    }
    if (!body.code?.trim() || !body.libelle?.trim()) {
      return NextResponse.json({ message: "Code et libellé requis" }, { status: 400 });
    }

    const existant = await db.referentielItem.findUnique({
      where: { categorie_code: { categorie: body.categorie as any, code: body.code.trim() } },
    });
    if (existant) {
      return NextResponse.json({ message: `Le code "${body.code}" existe déjà dans cette catégorie.` }, { status: 409 });
    }

    const structurelle = body.categorie in CATEGORIES_STRUCTURELLES;

    const item = await db.referentielItem.create({
      data: {
        categorie: body.categorie as any,
        code: body.code.trim(),
        libelle: body.libelle.trim(),
        libelleEn: body.libelleEn?.trim() || null,
        // Une catégorie "structurelle" crée de nouvelles colonnes dans le canevas
        // (1.1/1.2/1.7) : elle reste en attente tant que le DD ne l'a pas validée.
        enAttenteValidationDD: structurelle,
        proposeParId: structurelle ? user.id : null,
      },
    });

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: structurelle ? "PROPOSITION_REFERENTIEL" : "CREATION_REFERENTIEL",
        entite: "ReferentielItem",
        entiteId: item.id,
        details: { categorie: item.categorie, code: item.code },
      },
    });

    return NextResponse.json({
      item,
      message: structurelle ? "Proposition enregistrée — en attente de validation du DD avant de prendre effet." : undefined,
    }, { status: 201 });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}
