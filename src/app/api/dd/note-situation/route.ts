/**
 * La note de situation du département (demande du Délégué, 14 octobre 2026).
 *
 *   GET  /api/dd/note-situation                          → les mois qui ont des rapports transmis
 *   GET  /api/dd/note-situation?debut=2026-07&fin=2026-09 → la note, pour l'aperçu à l'écran
 *   POST /api/dd/note-situation { debut, fin, format, faits?, remarques? } → le fichier
 *
 * Réservée au DD (middleware : /api/dd ; et ici). Le mensuel n'est que LU. Les
 * chiffres sont TOUJOURS recalculés ici : seuls les faits saillants retouchés
 * et les remarques viennent de l'écran — c'est le texte du Délégué.
 */
import { NextResponse } from "next/server";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";
import { STATUTS_TRANSMIS } from "@/server/trimestre/agregation";
import { preparerNote, lireMois, ErreurNote, libelleMois, type FaitSaillant } from "@/server/note/noteSituation";
import { rendreNotePptx } from "@/server/note/notePptx";
import { rendreNoteDocx } from "@/server/note/noteDocx";
import { rendreNotePdf } from "@/server/note/notePdf";
import { nomFichierNote } from "@/server/note/presentation";

const erreur = (message: string, status: number) => NextResponse.json({ message }, { status });

const FORMATS = {
  pptx: { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation", rendre: rendreNotePptx },
  docx: { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", rendre: rendreNoteDocx },
  pdf: { type: "application/pdf", rendre: rendreNotePdf },
} as const;

const GENRES = new Set(["hausse", "baisse", "alerte", "info", "fiabilite"]);

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, ["DD"]);
    const params = new URL(req.url).searchParams;

    if (!params.get("debut")) {
      // Les mois que la note peut couvrir : ceux qui ont au moins un rapport transmis.
      const mois = await user.db.periodeReporting.findMany({
        where: { type: "MENSUEL", rapports: { some: { statut: { in: [...STATUTS_TRANSMIS] } } } },
        orderBy: [{ annee: "desc" }, { mois: "desc" }],
        select: { annee: true, mois: true },
      });
      return NextResponse.json({
        mois: mois.filter((m) => m.mois != null).map((m) => ({ annee: m.annee, mois: m.mois!, libelle: libelleMois({ annee: m.annee, mois: m.mois! }) })),
      });
    }

    const debut = lireMois(params.get("debut"));
    const fin = lireMois(params.get("fin") ?? params.get("debut"));
    if (!debut || !fin) return erreur("Mois demandés illisibles.", 400);
    return NextResponse.json(await preparerNote(user.db, debut, fin));
  } catch (e) {
    if (e instanceof ErreurNote) return erreur(e.message, 400);
    const { status, message } = permissionErrorResponse(e);
    return erreur(message, status);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, ["DD"]);
    const body = (await req.json()) as { debut?: string; fin?: string; format?: string; faits?: unknown; remarques?: unknown };
    const format = FORMATS[body.format as keyof typeof FORMATS];
    if (!format) return erreur("Format attendu : pptx, docx ou pdf.", 400);
    const debut = lireMois(body.debut);
    const fin = lireMois(body.fin ?? body.debut);
    if (!debut || !fin) return erreur("Mois demandés illisibles.", 400);

    // Les faits retouchés : du texte, en quantité raisonnable.
    let faits: FaitSaillant[] | undefined;
    if (body.faits !== undefined) {
      if (!Array.isArray(body.faits) || body.faits.length > 15) return erreur("Faits saillants illisibles.", 400);
      faits = [];
      for (const f of body.faits as { texte?: unknown; genre?: unknown }[]) {
        const texte = typeof f?.texte === "string" ? f.texte.trim().slice(0, 500) : "";
        if (!texte) continue;
        faits.push({ texte, genre: (GENRES.has(String(f.genre)) ? f.genre : "info") as FaitSaillant["genre"] });
      }
    }
    const remarques = typeof body.remarques === "string" ? body.remarques.slice(0, 3000) : undefined;

    const note = await preparerNote(user.db, debut, fin);
    const fichier = await format.rendre(note, { faits, remarques });

    await user.db.auditLog.create({
      data: {
        userId: user.id,
        action: "EXPORT_NOTE_SITUATION",
        entite: "NoteSituation",
        details: { debut: body.debut ?? null, fin: body.fin ?? null, format: body.format ?? null, faitsRetouches: faits?.length ?? null },
      },
    });

    const nom = nomFichierNote(note, body.format!);
    return new NextResponse(new Uint8Array(fichier), {
      status: 200,
      headers: { "Content-Type": format.type, "Content-Disposition": `attachment; filename="${nom}"` },
    });
  } catch (e) {
    if (e instanceof ErreurNote) return erreur(e.message, 400);
    const { status, message } = permissionErrorResponse(e);
    return erreur(message, status);
  }
}
