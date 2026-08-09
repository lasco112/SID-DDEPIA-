/**
 * GET /api/dd/corrections?periodeId=…&templateCode=…&arrondissementId=…
 * Historique des corrections apportées aux données d'une période (CDC §4) :
 * quelle donnée, ancienne valeur, nouvelle valeur, auteur, date et heure.
 *
 * Sert au DD à contrôler ce qui a été retouché après la saisie initiale, que
 * la retouche vienne d'un chef de section ou de lui-même.
 */
import { NextResponse } from "next/server";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";

const LIBELLE_ROLE: Record<string, string> = {
  DD: "Délégué Départemental",
  DA: "Délégué d'Arrondissement",
  AGENT_SAISIE: "Agent de saisie",
  CHEF_BAC: "Chef BAC",
  CHEF_SSV: "Chef SSV",
  CHEF_PSA: "Chef PSA",
  CHEF_SPAIH: "Chef SPAIH",
  ADMIN_TECH: "Administrateur technique",
};

/**
 * Les valeurs sont stockées sérialisées ({"valeur":12,"nonRenseigne":false} ou
 * le payload d'un événement). On les rend lisibles ici plutôt que d'imposer au
 * DD de lire du JSON brut.
 */
function lisible(brut: string): string {
  try {
    const o = JSON.parse(brut);
    if (o && typeof o === "object" && "valeur" in o) {
      if (o.nonRenseigne) return "Non renseigné";
      return o.valeur == null ? "—" : String(o.valeur);
    }
    if (o && typeof o === "object") {
      return Object.entries(o)
        .filter(([, v]) => v !== null && v !== "")
        .map(([k, v]) => `${k} : ${v}`)
        .join(" · ");
    }
    return String(o);
  } catch {
    return brut;
  }
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, ["DD"]);
    const db = user.db;

    const { searchParams } = new URL(req.url);
    const periodeId = searchParams.get("periodeId");
    const templateCode = searchParams.get("templateCode");
    const arrondissementId = searchParams.get("arrondissementId");
    if (!periodeId) return NextResponse.json({ message: "periodeId requis" }, { status: 400 });

    // Le filtre porte sur le rapport (période + arrondissement) de la saisie
    // corrigée, quelle que soit sa famille.
    const filtreRapport = { periodeId, ...(arrondissementId ? { arrondissementId } : {}) };

    const corrections = await db.correction.findMany({
      where: {
        OR: [
          {
            saisieMatrice: {
              rapport: filtreRapport,
              ...(templateCode ? { field: { template: { code: templateCode } } } : {}),
            },
          },
          {
            saisieNominative: {
              rapport: filtreRapport,
              ...(templateCode ? { template: { code: templateCode } } : {}),
            },
          },
          {
            saisieEvenement: {
              rapport: filtreRapport,
              ...(templateCode ? { template: { code: templateCode } } : {}),
            },
          },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        auteur: { select: { nom: true, role: true } },
        saisieMatrice: {
          include: { field: { include: { template: true } }, rapport: { include: { arrondissement: true } } },
        },
        saisieNominative: {
          include: { field: true, template: true, etablissement: true, rapport: { include: { arrondissement: true } } },
        },
        saisieEvenement: { include: { template: true, rapport: { include: { arrondissement: true } } } },
      },
    });

    return NextResponse.json({
      corrections: corrections.map((c) => {
        const m = c.saisieMatrice;
        const n = c.saisieNominative;
        const e = c.saisieEvenement;
        const tableau = m?.field.template ?? n?.template ?? e?.template ?? null;
        const arrondissement = m?.rapport.arrondissement ?? n?.rapport.arrondissement ?? e?.rapport.arrondissement ?? null;
        const donnee = m
          ? m.field.libelle
          : n
            ? `${n.etablissement.nom} — ${n.field.libelle}`
            : "Ligne d'événement";

        return {
          id: c.id,
          date: c.createdAt,
          auteur: c.auteur.nom,
          fonction: LIBELLE_ROLE[c.auteur.role] ?? c.auteur.role,
          parLeDD: c.auteur.role === "DD",
          arrondissement: arrondissement?.nom ?? "—",
          tableau: tableau ? `${tableau.numero} ${tableau.titre}` : "—",
          donnee,
          avant: lisible(c.valeurAvant),
          apres: lisible(c.valeurApres),
          motif: c.motif,
        };
      }),
    });
  } catch (err) {
    const { status, message } = permissionErrorResponse(err);
    return NextResponse.json({ message }, { status });
  }
}
