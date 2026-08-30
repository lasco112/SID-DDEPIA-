/**
 * Les tableaux du Bureau des Affaires Communes — lecture et saisie.
 *
 *   GET  /api/trimestre/bac?annee=&trimestre=   → les grilles et leurs valeurs
 *   PUT  /api/trimestre/bac                     → une cellule
 *
 * Réservé au chef BAC et au Délégué départemental : ce sont les tableaux
 * administratifs de la délégation (personnel, infrastructures, budget,
 * recettes), pas des données de terrain.
 *
 * La grille n'est pas décrite ici : elle vient du canevas, par les mêmes
 * fonctions que le rendu du document. L'écran et le rapport ne peuvent donc pas
 * diverger.
 */
import { NextResponse } from "next/server";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";
import { trimestrielle, libelleOfficiel } from "@/server/periodes/calendrier";
import { periodeTrimestrielle } from "@/server/trimestre/rubriques";
import {
  lireSaisiesCanevas,
  ecrireSaisieCanevas,
  estSaisiALaMain,
  cleCellule,
} from "@/server/trimestre/saisieCanevas";
import { grillesBac } from "@/server/trimestre/grilleBac";

const ROLES = ["CHEF_BAC", "DD"] as const;

function periodeDe(annee: unknown, trimestre: unknown) {
  const a = Number(annee);
  const t = Number(trimestre);
  if (!Number.isInteger(a) || a < 2000 || a > 2100) return null;
  if (![1, 2, 3, 4].includes(t)) return null;
  return trimestrielle(a, t);
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, [...ROLES]);

    const params = new URL(req.url).searchParams;
    const periode = periodeDe(params.get("annee"), params.get("trimestre"));
    if (!periode) return NextResponse.json({ message: "Période demandée invalide." }, { status: 400 });

    // On ne matérialise PAS la période à la simple consultation : ouvrir un
    // écran ne doit pas créer de ligne en base.
    const existante = await user.db.periodeReporting.findFirst({
      where: { type: "TRIMESTRIEL", annee: periode.annee, trimestre: periode.rang },
      select: { id: true },
    });
    const saisies = existante ? await lireSaisiesCanevas(user.db, existante.id) : new Map();

    const grilles = await grillesBac(user.db, periode, saisies);

    return NextResponse.json({
      periode: libelleOfficiel(periode),
      tableaux: grilles,
      // Les valeurs à plat : l'écran les retrouve par coordonnées.
      valeurs: Object.fromEntries(
        Array.from(saisies.entries()).map(([cle, v]) => [cle, v.texte ?? v.valeur])
      ),
      total: grilles.reduce((n, g) => n + g.lignes.length * g.colonnes.length, 0),
      renseignees: grilles.reduce((n, g) => n + g.renseignees, 0),
    });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, [...ROLES]);

    const body = (await req.json()) as {
      annee?: number;
      trimestre?: number;
      numeroTableau?: number;
      ligne?: string;
      colonne?: string;
      valeur?: string | number | null;
    };

    const periode = periodeDe(body.annee, body.trimestre);
    if (!periode) return NextResponse.json({ message: "Période demandée invalide." }, { status: 400 });
    if (!body.numeroTableau || !body.ligne || !body.colonne) {
      return NextResponse.json({ message: "Cellule non précisée." }, { status: 400 });
    }
    if (!estSaisiALaMain(body.numeroTableau)) {
      return NextResponse.json(
        {
          message:
            `Le tableau n° ${body.numeroTableau} se remplit à partir des rapports mensuels. ` +
            "Il ne se saisit pas ici.",
        },
        { status: 400 }
      );
    }

    // La cellule doit exister DANS LE CANEVAS. Sans ce contrôle, une coordonnée
    // fantaisiste créerait une valeur invisible à l'écran comme au document.
    const grilles = await grillesBac(user.db, periode, new Map());
    const grille = grilles.find((g) => g.numero === body.numeroTableau);
    if (!grille || !grille.lignes.includes(body.ligne) || !grille.colonnes.includes(body.colonne)) {
      return NextResponse.json(
        { message: `Cette case n'existe pas dans le tableau n° ${body.numeroTableau}.` },
        { status: 400 }
      );
    }

    const cellule = { numeroTableau: body.numeroTableau, ligne: body.ligne, colonne: body.colonne };

    // Une case vide EFFACE. Un texte non numérique est conservé tel quel : le
    // canevas porte aussi des cases d'observation.
    const brut = typeof body.valeur === "string" ? body.valeur.trim() : body.valeur;
    const nombre =
      brut === "" || brut == null
        ? null
        : Number(String(brut).replace(/\s/g, "").replace(",", "."));
    const estNombre = nombre != null && Number.isFinite(nombre);

    const periodeId = await periodeTrimestrielle(user.db, periode);
    const { enregistre } = await ecrireSaisieCanevas(
      user.db,
      user.transaction,
      periodeId,
      cellule,
      estNombre ? { valeur: nombre } : { texte: brut == null ? null : String(brut) },
      user.id
    );

    await user.db.auditLog.create({
      data: {
        userId: user.id,
        action: enregistre ? "SAISIE_TABLEAU_BAC" : "EFFACEMENT_TABLEAU_BAC",
        entite: "SaisieCanevas",
        entiteId: cleCellule(cellule),
        details: { ...cellule, annee: periode.annee, trimestre: periode.rang },
      },
    });

    return NextResponse.json({ enregistre });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}
