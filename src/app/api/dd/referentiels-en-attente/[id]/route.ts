/**
 * POST /api/dd/referentiels-en-attente/[id] — le DD valide ou rejette une
 * proposition de référentiel structurel (CDC : aucun changement du rapport
 * final sans l'accord du DD).
 *
 * Validation : crée les FormField correspondants (cf. categoriesStructurelles.ts)
 * — c'est à ce moment précis, et seulement à ce moment, que la nouvelle
 * espèce/volaille/poisson devient une vraie colonne de saisie et de rapport.
 * Rejet : l'item est désactivé, jamais supprimé (§A.7 règle 1).
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";
import { CATEGORIES_STRUCTURELLES, suffixeDepuisCode } from "@/lib/categoriesStructurelles";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    assertRole(user, ["DD"]);

    const item = await db.referentielItem.findUnique({ where: { id: params.id } });
    if (!item) return NextResponse.json({ message: "Item introuvable" }, { status: 404 });
    if (!item.enAttenteValidationDD) {
      return NextResponse.json({ message: "Cet item n'est pas en attente de validation." }, { status: 400 });
    }

    const body = (await req.json()) as { decision: "VALIDE" | "REJETE" };
    if (body.decision !== "VALIDE" && body.decision !== "REJETE") {
      return NextResponse.json({ message: "decision doit être VALIDE ou REJETE" }, { status: 400 });
    }

    if (body.decision === "REJETE") {
      await db.referentielItem.update({
        where: { id: item.id },
        data: { enAttenteValidationDD: false, actif: false, disabledAt: new Date() },
      });
      await db.auditLog.create({
        data: { userId: user.id, action: "REJET_REFERENTIEL", entite: "ReferentielItem", entiteId: item.id, details: { categorie: item.categorie, code: item.code } },
      });
      return NextResponse.json({ ok: true, decision: "REJETE" });
    }

    const mappings = CATEGORIES_STRUCTURELLES[item.categorie];
    if (!mappings) {
      return NextResponse.json({ message: `Aucun mapping connu pour la catégorie ${item.categorie}` }, { status: 500 });
    }
    const suffixe = suffixeDepuisCode(item.code);

    const champsCrees: string[] = [];
    for (const m of mappings) {
      const template = await db.formTemplate.findUnique({ where: { code: m.templateCode } });
      if (!template) continue;
      const code = `${m.codePrefix}${suffixe}`;
      const dernier = await db.formField.findFirst({ where: { templateId: template.id }, orderBy: { ordre: "desc" } });
      await db.formField.upsert({
        where: { code },
        update: { actif: true, disabledAt: null },
        create: {
          templateId: template.id,
          code,
          libelle: `${item.libelle}${m.libelleSuffixe ?? ""}`,
          uniteCode: m.uniteCode,
          typeValeur: m.typeValeur,
          ordre: (dernier?.ordre ?? 0) + 1,
        },
      });
      champsCrees.push(code);
    }

    const mis_a_jour = await db.referentielItem.update({
      where: { id: item.id },
      data: { enAttenteValidationDD: false, valideParDDId: user.id, valideLe: new Date() },
    });

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "VALIDATION_REFERENTIEL",
        entite: "ReferentielItem",
        entiteId: item.id,
        details: { categorie: item.categorie, code: item.code, champsCrees },
      },
    });

    return NextResponse.json({ ok: true, decision: "VALIDE", item: mis_a_jour, champsCrees });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}
