/**
 * POST /api/corrections — correction tracée d'une saisie par un chef de
 * section (CDC §4.4 et §13.2) : valeur avant/après + motif obligatoire,
 * limitée aux tableaux de SA section.
 */
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser, assertProprietaireSection, permissionErrorResponse } from "@/lib/permissions";

interface Body {
  famille: "MATRICE" | "NOMINATIF" | "EVENEMENT";
  saisieId: string;
  motif: string;
  // MATRICE / NOMINATIF
  valeur?: number | null;
  nonRenseigne?: boolean;
  motifNonRenseigne?: string | null;
  // EVENEMENT
  payload?: Record<string, unknown>;
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as Body;
    if (!body.motif || !body.motif.trim()) {
      return NextResponse.json({ message: "Le motif de correction est obligatoire." }, { status: 400 });
    }

    if (body.famille === "MATRICE") {
      const saisie = await db.saisieMatrice.findUnique({
        where: { id: body.saisieId },
        include: { field: { include: { template: true } } },
      });
      if (!saisie) return NextResponse.json({ message: "Saisie introuvable" }, { status: 404 });
      assertProprietaireSection(user, saisie.field.template.sectionId);

      const valeurAvant = JSON.stringify({ valeur: saisie.valeur, nonRenseigne: saisie.nonRenseigne });
      const updated = await db.saisieMatrice.update({
        where: { id: saisie.id },
        data: {
          valeur: body.nonRenseigne ? null : body.valeur ?? null,
          nonRenseigne: Boolean(body.nonRenseigne),
          motifNonRenseigne: body.nonRenseigne ? body.motifNonRenseigne ?? null : null,
        },
      });
      await db.correction.create({
        data: {
          saisieMatriceId: saisie.id,
          valeurAvant,
          valeurApres: JSON.stringify({ valeur: updated.valeur, nonRenseigne: updated.nonRenseigne }),
          motif: body.motif,
          auteurId: user.id,
        },
      });
      await db.auditLog.create({ data: { userId: user.id, action: "CORRECTION", entite: "SaisieMatrice", entiteId: saisie.id } });
      return NextResponse.json({ saisie: updated });
    }

    if (body.famille === "NOMINATIF") {
      const saisie = await db.saisieNominative.findUnique({
        where: { id: body.saisieId },
        include: { template: true },
      });
      if (!saisie) return NextResponse.json({ message: "Saisie introuvable" }, { status: 404 });
      assertProprietaireSection(user, saisie.template.sectionId);

      const valeurAvant = JSON.stringify({ valeur: saisie.valeur, nonRenseigne: saisie.nonRenseigne });
      const updated = await db.saisieNominative.update({
        where: { id: saisie.id },
        data: {
          valeur: body.nonRenseigne ? null : body.valeur ?? null,
          nonRenseigne: Boolean(body.nonRenseigne),
        },
      });
      await db.correction.create({
        data: {
          saisieNominativeId: saisie.id,
          valeurAvant,
          valeurApres: JSON.stringify({ valeur: updated.valeur, nonRenseigne: updated.nonRenseigne }),
          motif: body.motif,
          auteurId: user.id,
        },
      });
      await db.auditLog.create({ data: { userId: user.id, action: "CORRECTION", entite: "SaisieNominative", entiteId: saisie.id } });
      return NextResponse.json({ saisie: updated });
    }

    if (body.famille === "EVENEMENT") {
      const saisie = await db.saisieEvenement.findUnique({
        where: { id: body.saisieId },
        include: { template: true },
      });
      if (!saisie) return NextResponse.json({ message: "Saisie introuvable" }, { status: 404 });
      assertProprietaireSection(user, saisie.template.sectionId);

      const valeurAvant = JSON.stringify(saisie.payload);
      const updated = await db.saisieEvenement.update({
        where: { id: saisie.id },
        data: { payload: (body.payload ?? {}) as Prisma.InputJsonValue },
      });
      await db.correction.create({
        data: {
          saisieEvenementId: saisie.id,
          valeurAvant,
          valeurApres: JSON.stringify(updated.payload),
          motif: body.motif,
          auteurId: user.id,
        },
      });
      await db.auditLog.create({ data: { userId: user.id, action: "CORRECTION", entite: "SaisieEvenement", entiteId: saisie.id } });
      return NextResponse.json({ saisie: updated });
    }

    return NextResponse.json({ message: "Famille inconnue" }, { status: 400 });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}
