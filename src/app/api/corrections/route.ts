/**
 * POST /api/corrections — correction tracée d'une saisie (CDC §4.4 et §13.2) :
 * valeur avant/après + motif obligatoire.
 *
 * Deux profils y accèdent :
 *  - un chef de section, limité aux tableaux de SA section ;
 *  - le Délégué Départemental, sur n'importe quel tableau de n'importe quel
 *    arrondissement. Le DD est le responsable hiérarchique du rapport : il doit
 *    pouvoir corriger lui-même une erreur avant consolidation sans attendre le
 *    chef compétent. Sa correction est tracée exactement comme les autres.
 */
import { NextResponse } from "next/server";
import { assertPeriodeModifiable } from "@/server/periodes/gel";
import { notifierEvenement } from "@/server/notifications/evenements";
import { Prisma, type PrismaClient } from "@prisma/client";
import { recalculerDerivesPourTemplate } from "@/server/derivation/champsDerives";
import { requireUser, assertProprietaireSection, permissionErrorResponse, type SessionUser } from "@/lib/permissions";

/**
 * Le DD n'a pas de section propre : lui appliquer assertProprietaireSection
 * le bloquerait sur TOUS les tableaux. Son périmètre est le département
 * entier, il n'y a donc rien de plus fin à vérifier ici.
 */
function assertPeutCorriger(user: SessionUser, sectionId: string) {
  if (user.role === "DD") return;
  assertProprietaireSection(user, sectionId);
}

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
    const db = user.db;
    const body = (await req.json()) as Body;
    if (!body.motif || !body.motif.trim()) {
      return NextResponse.json({ message: "Le motif de correction est obligatoire." }, { status: 400 });
    }

    if (body.famille === "MATRICE") {
      const saisie = await db.saisieMatrice.findUnique({
        where: { id: body.saisieId },
        include: { field: { include: { template: true } }, rapport: { select: { periodeId: true, arrondissementId: true } } },
      });
      if (!saisie) return NextResponse.json({ message: "Saisie introuvable" }, { status: 404 });
      assertPeutCorriger(user, saisie.field.template.sectionId);

      await assertPeriodeModifiable(db, saisie.rapport.periodeId); // §13

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

      await notifierEvenement(
        db as PrismaClient,
        { arrondissementId: saisie.rapport.arrondissementId, saufUserId: user.id },
        {
          declencheur: "CORRECTION",
          message: `${user.username} a modifié une donnée de votre rapport (${saisie.field.libelle}). Motif : ${body.motif}`,
          lien: "/da/saisie",
        }
      );

      return NextResponse.json({ saisie: updated });
    }

    if (body.famille === "NOMINATIF") {
      const saisie = await db.saisieNominative.findUnique({
        where: { id: body.saisieId },
        include: { template: true, rapport: { select: { periodeId: true, arrondissementId: true } } },
      });
      if (!saisie) return NextResponse.json({ message: "Saisie introuvable" }, { status: 404 });
      assertPeutCorriger(user, saisie.template.sectionId);

      await assertPeriodeModifiable(db, saisie.rapport.periodeId); // §13

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

      // Certaines cases du tableau 1.2 sont la somme de ce tableau. Sans ce
      // recalcul, corriger une ferme dans 1.4 laisserait 1.2 sur l'ancien
      // total et le rapport se contredirait. La retouche est tracée.
      await recalculerDerivesPourTemplate(db as PrismaClient, saisie.rapportId, saisie.template.code, {
        auteurId: user.id,
        motif: `Recalcul automatique après correction du tableau ${saisie.template.numero}.`,
      });


      await notifierEvenement(
        db as PrismaClient,
        { arrondissementId: saisie.rapport.arrondissementId, saufUserId: user.id },
        {
          declencheur: "CORRECTION",
          message: `${user.username} a modifié une donnée de votre rapport (tableau ${saisie.template.numero}). Motif : ${body.motif}`,
          lien: "/da/saisie",
        }
      );

      return NextResponse.json({ saisie: updated });
    }

    if (body.famille === "EVENEMENT") {
      const saisie = await db.saisieEvenement.findUnique({
        where: { id: body.saisieId },
        include: { template: true, rapport: { select: { periodeId: true, arrondissementId: true } } },
      });
      if (!saisie) return NextResponse.json({ message: "Saisie introuvable" }, { status: 404 });
      assertPeutCorriger(user, saisie.template.sectionId);

      await assertPeriodeModifiable(db, saisie.rapport.periodeId); // §13

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

      await notifierEvenement(
        db as PrismaClient,
        { arrondissementId: saisie.rapport.arrondissementId, saufUserId: user.id },
        {
          declencheur: "CORRECTION",
          message: `${user.username} a modifié une donnée de votre rapport (tableau ${saisie.template.numero}). Motif : ${body.motif}`,
          lien: "/da/saisie",
        }
      );

      return NextResponse.json({ saisie: updated });
    }

    return NextResponse.json({ message: "Famille inconnue" }, { status: 400 });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}
