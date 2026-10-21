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
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";
import type { Prisma } from "@prisma/client";
import { CODES_ACTEURS } from "@/lib/acteurs";
import { identiteDepartement } from "@/lib/departement";
import { SELECTION_ETABLISSEMENT, TYPE_MARCHE, preparerEcriture, versClient } from "@/server/etablissements/donnees";

// Les neuf types d'acteurs de la liste de référence (20 octobre 2026) — les
// quatre premiers servent aux tableaux nominatifs du mensuel, les autres
// (marchés, abattoirs, étangs…) au registre et à ses listes.
const TYPES_VALIDES = CODES_ACTEURS;

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

    const etablissements = await user.db.etablissement.findMany({
      where: { typeCode, arrondissementId },
      orderBy: [{ actif: "desc" }, { nom: "asc" }],
      select: SELECTION_ETABLISSEMENT,
    });
    return NextResponse.json({ etablissements: etablissements.map(versClient) });
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
      latitude?: number | string | null;
      longitude?: number | string | null;
      especes?: string[];
      joursMarche?: string[];
      infrastructures?: string[];
      observations?: string | null;
      precisionGPS?: number | null;
      dateCollecteGPS?: string | null;
      fiche?: unknown;
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

    // Un renvoi d'appareil réécrit SA création — jamais l'établissement d'un
    // autre arrondissement dont on aurait repris l'identifiant.
    if (body.id) {
      const deja = await user.db.etablissement.findUnique({ where: { id: body.id }, select: { arrondissementId: true } });
      if (deja && deja.arrondissementId !== arrondissementId) {
        return NextResponse.json({ message: "Cet identifiant appartient à un établissement d'un autre arrondissement." }, { status: 403 });
      }
    }

    const prepare = preparerEcriture(body as unknown as Record<string, unknown>, {
      typeCode: body.typeCode,
      codeDepartement: (await identiteDepartement(user.db)).code,
      username: user.username,
    });
    if ("erreur" in prepare) return NextResponse.json({ message: prepare.erreur }, { status: 400 });

    const estMarche = body.typeCode === TYPE_MARCHE;
    const donnees = {
      ...prepare.data,
      typeCode: body.typeCode,
      nom: body.nom.trim(),
      localite: body.localite.trim(),
      // Un marché n'a ni propriétaire ni téléphone : c'est la commune qui le gère.
      proprietaire: estMarche ? null : body.proprietaire?.trim() || null,
      telephone: estMarche ? null : body.telephone?.trim() || null,
      arrondissementId,
    } as Prisma.EtablissementUncheckedCreateInput;

    // upsert plutôt que create quand l'appareil fournit son identifiant :
    // un même envoi rejoué après une coupure réseau met simplement à jour la
    // ligne déjà créée, au lieu d'ajouter un doublon.
    const etablissement = body.id
      ? await user.db.etablissement.upsert({
          where: { id: body.id },
          create: { id: body.id, ...donnees },
          update: donnees,
          select: SELECTION_ETABLISSEMENT,
        })
      : await user.db.etablissement.create({ data: donnees, select: SELECTION_ETABLISSEMENT });

    await user.db.auditLog.create({
      data: { userId: user.id, action: "CREATION_ETABLISSEMENT", entite: "Etablissement", entiteId: etablissement.id, details: { nom: etablissement.nom, typeCode: etablissement.typeCode } },
    });

    return NextResponse.json({ etablissement: versClient(etablissement) }, { status: 201 });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}
