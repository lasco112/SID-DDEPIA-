/**
 * POST /api/sync — réception idempotente des saisies offline (CDC §11).
 * ---------------------------------------------------------------------------
 * Contrat : { periodeId, saisies: SaisieOffline[] } → { confirmedIds: string[] }
 *  - Idempotent par clientId (upsert) : un renvoi après coupure ne duplique rien.
 *  - Refuse (423) si la période est verrouillée pour ce rapport et qu'aucun
 *    déverrouillage exceptionnel n'a été accordé, ou si le rapport est déjà
 *    SOUMIS/CLOTURE (verrouillage à la soumission, CDC §4.3).
 *  - `0 ≠ non renseigné` : nonRenseigne=true exige motifNonRenseigne, et
 *    valeur est alors ignorée (jamais convertie en 0 silencieusement).
 */
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";

interface SaisieOfflineIn {
  clientId: string;
  templateCode: string;
  famille: "MATRICE" | "NOMINATIF" | "EVENEMENT";
  fieldCode?: string;
  etablissementId?: string;
  valeur?: number | null;
  valeurTexte?: string | null;
  payload?: Record<string, unknown>;
  nonRenseigne: boolean;
  motifNonRenseigne?: string | null;
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const db = user.db;
    assertRole(user, ["DA", "AGENT_SAISIE"]);

    const body = (await req.json()) as { periodeId: string; saisies: SaisieOfflineIn[] };
    if (!body?.periodeId || !Array.isArray(body.saisies)) {
      return NextResponse.json({ message: "Format invalide" }, { status: 400 });
    }
    if (!user.arrondissementId) {
      return NextResponse.json({ message: "Compte DA sans arrondissement assigné" }, { status: 400 });
    }

    const periode = await db.periodeReporting.findUnique({ where: { id: body.periodeId } });
    if (!periode) {
      return NextResponse.json({ message: "Période introuvable" }, { status: 404 });
    }

    let rapport = await db.rapportArrondissement.upsert({
      where: {
        periodeId_arrondissementId: {
          periodeId: periode.id,
          arrondissementId: user.arrondissementId,
        },
      },
      update: {},
      create: {
        periodeId: periode.id,
        arrondissementId: user.arrondissementId,
        statut: "EN_SAISIE",
      },
    });

    // Un rejet est levé dès que le DA reprend la saisie (CDC : REJETE → EN_SAISIE)
    if (rapport.statut === "REJETE") {
      rapport = await db.rapportArrondissement.update({
        where: { id: rapport.id },
        data: { statut: "EN_SAISIE" },
      });
    }

    if (rapport.statut === "SOUMIS" || rapport.statut === "CLOTURE") {
      return NextResponse.json(
        { message: "Rapport déjà soumis : verrouillé pour la saisie DA." },
        { status: 423 }
      );
    }
    if (periode.statut === "VERROUILLEE_DA" && !rapport.deverrouillePar) {
      return NextResponse.json(
        {
          message:
            "Période verrouillée. Contactez le Délégué Départemental pour un déverrouillage exceptionnel.",
        },
        { status: 423 }
      );
    }

    const templates = await db.formTemplate.findMany({ select: { id: true, code: true } });
    const templateIdByCode = new Map(templates.map((t) => [t.code, t.id]));

    const confirmedIds: string[] = [];
    /** Lignes refusées par la base : tracées à l'audit, jamais fatales pour le lot. */
    const lignesEnEchec: Array<{ clientId: string; templateCode: string; fieldCode: string | null; erreur: string }> = [];

    for (const s of body.saisies) {
      if (s.nonRenseigne && !s.motifNonRenseigne) {
        continue; // motif obligatoire (CDC §4.4) — rejeté silencieusement de ce lot
      }
      const templateId = templateIdByCode.get(s.templateCode);
      if (!templateId) continue;

      const valeur = s.nonRenseigne ? null : s.valeur ?? null;
      const valeurTexte = s.nonRenseigne ? null : s.valeurTexte ?? null;

      // Chaque saisie est isolée : une ligne en échec ne doit JAMAIS emporter
      // le lot entier. Auparavant une seule ligne fautive faisait échouer les
      // 200 autres, qui repartaient en erreur à chaque tentative — la file ne
      // se vidait plus jamais et grossissait à chaque saisie (cas constaté sur
      // le terrain : 66 saisies bloquées).
      try {
        if (s.famille === "MATRICE" && s.fieldCode) {
          // Recherche par (rapport, champ) et NON par clientId : c'est là
          // l'identité réelle d'une cellule. Le clientId est propre à un
          // appareil ; dès que la même cellule était réécrite depuis un autre
          // appareil, depuis un autre compte (le DA après son agent) ou après
          // recréation de la base locale, l'upsert ne trouvait rien, tentait
          // une création et violait @@unique([rapportId, fieldCode]).
          await db.saisieMatrice.upsert({
            where: { rapportId_fieldCode: { rapportId: rapport.id, fieldCode: s.fieldCode } },
            update: { valeur, valeurTexte, nonRenseigne: s.nonRenseigne, motifNonRenseigne: s.motifNonRenseigne ?? null, syncedAt: new Date(), saisiParId: user.id },
            create: {
              clientId: s.clientId,
              rapportId: rapport.id,
              fieldCode: s.fieldCode,
              valeur,
              valeurTexte,
              nonRenseigne: s.nonRenseigne,
              motifNonRenseigne: s.motifNonRenseigne ?? null,
              saisiParId: user.id,
            },
          });
          confirmedIds.push(s.clientId);
        } else if (s.famille === "NOMINATIF" && s.fieldCode && s.etablissementId) {
          await db.saisieNominative.upsert({
            where: {
              rapportId_etablissementId_fieldCode: {
                rapportId: rapport.id,
                etablissementId: s.etablissementId,
                fieldCode: s.fieldCode,
              },
            },
            update: { valeur, valeurTexte, nonRenseigne: s.nonRenseigne, motifNonRenseigne: s.motifNonRenseigne ?? null, syncedAt: new Date(), saisiParId: user.id },
            create: {
              clientId: s.clientId,
              rapportId: rapport.id,
              templateId,
              etablissementId: s.etablissementId,
              fieldCode: s.fieldCode,
              valeur,
              valeurTexte,
              nonRenseigne: s.nonRenseigne,
              motifNonRenseigne: s.motifNonRenseigne ?? null,
              saisiParId: user.id,
            },
          });
          confirmedIds.push(s.clientId);
        } else if (s.famille === "EVENEMENT" && s.payload) {
          // Un événement (vaccination, foyer...) n'a pas de clé naturelle :
          // deux lignes identiques sont deux faits distincts. Le clientId
          // reste donc la bonne clé d'idempotence ici.
          const payload = s.payload as Prisma.InputJsonValue;
          await db.saisieEvenement.upsert({
            where: { clientId: s.clientId },
            update: { payload, syncedAt: new Date(), saisiParId: user.id },
            create: {
              clientId: s.clientId,
              rapportId: rapport.id,
              templateId,
              payload,
              saisiParId: user.id,
            },
          });
          confirmedIds.push(s.clientId);
        }
      } catch (erreurLigne) {
        // Confirmée malgré tout : sans cela l'appareil la renverrait
        // indéfiniment et resterait bloqué sur cette seule ligne. La saisie
        // reste consultable sur l'appareil, et l'incident est tracé.
        confirmedIds.push(s.clientId);
        lignesEnEchec.push({
          clientId: s.clientId,
          templateCode: s.templateCode,
          fieldCode: s.fieldCode ?? null,
          erreur: erreurLigne instanceof Error ? erreurLigne.message.slice(0, 300) : "inconnue",
        });
      }
    }

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: lignesEnEchec.length > 0 ? "SYNC_PARTIEL" : "SYNC",
        entite: "RapportArrondissement",
        entiteId: rapport.id,
        details: {
          count: confirmedIds.length,
          ...(lignesEnEchec.length > 0 ? { enEchec: lignesEnEchec.length, detail: lignesEnEchec.slice(0, 20) } : {}),
        },
      },
    });

    return NextResponse.json({ confirmedIds, enEchec: lignesEnEchec.length });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}
