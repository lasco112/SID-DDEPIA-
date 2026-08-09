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
import { assertPeriodeModifiable } from "@/server/periodes/gel";
import { Prisma, type PrismaClient } from "@prisma/client";
import { recalculerTousLesDerives } from "@/server/derivation/champsDerives";
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
  /** Date de modification sur l'appareil (ISO) — arbitre les conflits entre appareils. */
  updatedAt?: string;
}

/**
 * Date de modification retenue pour l'arbitrage.
 *
 * Plafonnée à l'heure du serveur : une horloge d'appareil mal réglée (réglée
 * dans le futur) donnerait sinon à cet appareil un droit de dernier mot
 * permanent sur tous les autres. Une date absente ou illisible est ramenée à
 * l'heure du serveur, ce qui revient au comportement antérieur pour cette
 * ligne — jamais un rejet silencieux.
 */
function dateModification(brut: string | undefined, maintenant: Date): Date {
  if (!brut) return maintenant;
  const d = new Date(brut);
  if (Number.isNaN(d.getTime())) return maintenant;
  return d > maintenant ? maintenant : d;
}

/**
 * Vrai UNIQUEMENT si le refus porte sur la clé naturelle de la cellule
 * (rapport + champ [+ établissement]) : cela signifie que la ligne existe déjà
 * avec une version plus récente, cas légitime que l'on ignore.
 *
 * Un refus portant sur `clientId` est tout autre chose — un identifiant
 * d'appareil réutilisé pour une autre cellule — et doit remonter comme une
 * vraie erreur : le confondre avec le cas précédent reviendrait à jeter la
 * saisie sans que personne ne le sache.
 */
function estConflitSurLaCelluleExistante(e: unknown): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") return false;
  const cibles = e.meta?.target;
  const champs = Array.isArray(cibles) ? cibles.map(String) : typeof cibles === "string" ? [cibles] : [];
  return champs.includes("fieldCode") || champs.includes("rapportId");
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
    // Mois clôturé (§13) : on refuse AVANT d'écrire quoi que ce soit. L'appareil
    // conserve sa file — rien n'est confirmé, donc rien n'est perdu si le DD
    // rouvre la période ensuite.
    await assertPeriodeModifiable(db, periode.id);

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
    /** Saisies volontairement non appliquées : le serveur détenait une version plus récente. */
    let ignorees = 0;
    /** Heure de référence unique pour tout le lot (cohérence des comparaisons). */
    const maintenant = new Date();

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
      const modifieLe = dateModification(s.updatedAt, maintenant);
      // Une ligne du serveur SANS date de modification date d'avant cette
      // fonctionnalité : traitée comme la plus ancienne, donc remplaçable.
      const plusRecenteQueSurLeServeur = { OR: [{ modifieLe: null }, { modifieLe: { lte: modifieLe } }] };
      const champsCommuns = {
        valeur,
        valeurTexte,
        nonRenseigne: s.nonRenseigne,
        motifNonRenseigne: s.motifNonRenseigne ?? null,
        modifieLe,
        syncedAt: maintenant,
        saisiParId: user.id,
      };

      try {
        if (s.famille === "MATRICE" && s.fieldCode) {
          // Recherche par (rapport, champ) et NON par clientId : c'est là
          // l'identité réelle d'une cellule. Le clientId est propre à un
          // appareil ; dès que la même cellule était réécrite depuis un autre
          // appareil, depuis un autre compte (le DA après son agent) ou après
          // recréation de la base locale, l'upsert ne trouvait rien, tentait
          // une création et violait @@unique([rapportId, fieldCode]).
          //
          // La mise à jour ne s'applique QUE si la version reçue est plus
          // récente que celle du serveur : une saisie ancienne remontée
          // tardivement (appareil longtemps hors ligne) n'écrase plus une
          // correction faite entre-temps.
          const misAJour = await db.saisieMatrice.updateMany({
            where: { rapportId: rapport.id, fieldCode: s.fieldCode, ...plusRecenteQueSurLeServeur },
            data: champsCommuns,
          });
          if (misAJour.count === 0) {
            // Soit la cellule n'existe pas encore, soit le serveur détient
            // déjà une version plus récente — que l'on conserve alors.
            try {
              await db.saisieMatrice.create({
                data: { clientId: s.clientId, rapportId: rapport.id, fieldCode: s.fieldCode, ...champsCommuns },
              });
            } catch (e) {
              if (!estConflitSurLaCelluleExistante(e)) throw e;
              ignorees++; // version du serveur plus récente : conservée
            }
          }
          confirmedIds.push(s.clientId);
        } else if (s.famille === "NOMINATIF" && s.fieldCode && s.etablissementId) {
          const misAJour = await db.saisieNominative.updateMany({
            where: {
              rapportId: rapport.id,
              etablissementId: s.etablissementId,
              fieldCode: s.fieldCode,
              ...plusRecenteQueSurLeServeur,
            },
            data: champsCommuns,
          });
          if (misAJour.count === 0) {
            try {
              await db.saisieNominative.create({
                data: {
                  clientId: s.clientId,
                  rapportId: rapport.id,
                  templateId,
                  etablissementId: s.etablissementId,
                  fieldCode: s.fieldCode,
                  ...champsCommuns,
                },
              });
            } catch (e) {
              if (!estConflitSurLaCelluleExistante(e)) throw e;
              ignorees++;
            }
          }
          confirmedIds.push(s.clientId);
        } else if (s.famille === "EVENEMENT" && s.payload) {
          // Un événement (vaccination, foyer...) n'a pas de clé naturelle :
          // deux lignes identiques sont deux faits distincts. Le clientId
          // reste donc la bonne clé d'idempotence ici. L'arbitrage par date
          // s'applique quand même, pour le cas où la même ligne serait
          // corrigée depuis deux appareils.
          const payload = s.payload as Prisma.InputJsonValue;
          const misAJour = await db.saisieEvenement.updateMany({
            where: { clientId: s.clientId, ...plusRecenteQueSurLeServeur },
            data: { payload, modifieLe, syncedAt: maintenant, saisiParId: user.id },
          });
          if (misAJour.count === 0) {
            try {
              await db.saisieEvenement.create({
                data: {
                  clientId: s.clientId,
                  rapportId: rapport.id,
                  templateId,
                  payload,
                  modifieLe,
                  syncedAt: maintenant,
                  saisiParId: user.id,
                },
              });
            } catch (e) {
              if (!estConflitSurLaCelluleExistante(e)) throw e;
              ignorees++;
            }
          }
          confirmedIds.push(s.clientId);
        }
      } catch (erreurLigne) {
        // JAMAIS confirmée : une ligne refusée par la base n'est PAS
        // enregistrée, et la faire passer pour envoyée revient à la perdre
        // silencieusement — l'appareil vidait sa file et annonçait « tout est
        // enregistré sur le serveur » alors que rien ne l'était (cas constaté
        // sur le terrain à Fokoué). Elle reste donc en attente sur l'appareil,
        // visible en erreur, et repartira à la prochaine tentative.
        lignesEnEchec.push({
          clientId: s.clientId,
          templateCode: s.templateCode,
          fieldCode: s.fieldCode ?? null,
          erreur: erreurLigne instanceof Error ? erreurLigne.message.slice(0, 300) : "inconnue",
        });
      }
    }

    // Les cases du tableau 1.2 qui sont la somme de 1.4 / 1.5 sont recalculées
    // à CHAQUE envoi, sans regarder ce que contient le lot.
    //
    // L'appareil les a déjà calculées de son côté, mais avec les seules lignes
    // qu'il détient : deux appareils alimentant le même arrondissement n'ont
    // chacun qu'une somme partielle. Seul le serveur voit l'ensemble.
    //
    // Et surtout, la file part par lots de 200 : la case calculée et les
    // lignes qui l'alimentent peuvent voyager dans deux lots distincts. Ne
    // recalculer que d'après le contenu du lot laisserait alors passer une
    // somme partielle. Deux requêtes de plus par envoi valent mieux qu'un
    // effectif faux dans le rapport.
    //
    // La retouche est TRACÉE. Le report peut écraser une valeur que le DA
    // avait tapée à la main avant que la règle n'existe : sans trace, ce
    // chiffre disparaîtrait sans que personne ne puisse le retrouver ni
    // comprendre pourquoi le tableau 1.2 a changé. La trace n'est créée que
    // si la valeur bouge réellement.
    await recalculerTousLesDerives(db as PrismaClient, rapport.id, {
      auteurId: user.id,
      motif: "Report automatique depuis le tableau nominatif (1.4 / 1.5).",
    });

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: lignesEnEchec.length > 0 ? "SYNC_PARTIEL" : "SYNC",
        entite: "RapportArrondissement",
        entiteId: rapport.id,
        details: {
          count: confirmedIds.length,
          ...(ignorees > 0 ? { ignoreesCarPlusAnciennes: ignorees } : {}),
          ...(lignesEnEchec.length > 0 ? { enEchec: lignesEnEchec.length, detail: lignesEnEchec.slice(0, 20) } : {}),
        },
      },
    });

    return NextResponse.json({
      confirmedIds,
      // Renvoyées à l'appareil pour qu'il les CONSERVE en attente, avec le
      // motif : une saisie non enregistrée ne doit jamais disparaître de la
      // file en silence.
      echecs: lignesEnEchec.map((l) => ({ clientId: l.clientId, erreur: l.erreur })),
      ignorees,
    });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}
