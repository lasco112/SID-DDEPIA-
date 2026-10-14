/**
 * La note de situation en PRÉSENTATION PowerPoint — le format que le Délégué
 * projette (demande du 14 octobre 2026) : huit diapositives au plus, dix
 * minutes. Les graphiques sont de vrais graphiques PowerPoint, modifiables ;
 * une case sans chiffre reste vide, jamais un zéro.
 */
import PptxGenJS from "pptxgenjs";
import type { DonneesGraphique } from "@/server/trimestre/canevas/graphiques";
import type { Indicateur, NoteSituation } from "./noteSituation";
import { nb } from "./noteSituation";
/** « 1 foyer déclaré », « 3 163 foyers déclarés », « aucun foyer déclaré ». */
const pluriel = (n: number, un: string, plusieurs: string) => (n === 0 ? `aucun ${un}` : `${nb(n)} ${n > 1 ? plusieurs : un}`);
import {
  COULEURS, evolutionTexte, faitsRetenus, indicateursAffiches, indicateursDe, phraseComparaison, phraseCouverture,
  sousTitreNote, titreNote, valeurTexte, type Retouches,
} from "./presentation";

const LARGEUR = 13.333;
const POLICE = "Calibri";

type Diapo = ReturnType<PptxGenJS["addSlide"]>;

function cadre(pptx: PptxGenJS, note: NoteSituation, titre: string, sousTitre?: string): Diapo {
  const s = pptx.addSlide();
  s.background = { color: "FFFFFF" };
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: LARGEUR, h: 0.95, fill: { color: COULEURS.primaire }, line: { color: COULEURS.primaire } });
  s.addText(titre, { x: 0.5, y: 0.12, w: LARGEUR - 1, h: 0.72, fontFace: POLICE, fontSize: 26, bold: true, color: "FFFFFF" });
  if (sousTitre) s.addText(sousTitre, { x: 0.5, y: 1.0, w: LARGEUR - 1, h: 0.4, fontFace: POLICE, fontSize: 13, italic: true, color: COULEURS.gris });
  s.addText(`${note.departement.sigle} · Note de situation · ${note.periode.libelle}`, {
    x: 0.5, y: 7.05, w: 9, h: 0.3, fontFace: POLICE, fontSize: 10, color: COULEURS.gris,
  });
  s.slideNumber = { x: 12.4, y: 7.05, w: 0.6, h: 0.3, fontFace: POLICE, fontSize: 10, color: COULEURS.gris };
  return s;
}

function graphique(pptx: PptxGenJS, s: Diapo, g: DonneesGraphique, x: number, y: number, w: number, h: number) {
  const seule = g.series.length === 1;
  s.addChart(
    pptx.ChartType.bar,
    // Une case sans chiffre reste vide : la bibliothèque écrit une valeur absente sans zéro.
    g.series.map((serie) => ({ name: serie.nom, labels: g.categories, values: serie.valeurs as number[] })),
    {
      x, y, w, h,
      barDir: "col",
      barGrouping: "clustered",
      chartColors: COULEURS.series.slice(0, Math.max(1, g.series.length)),
      showTitle: true,
      title: g.titre,
      titleFontFace: POLICE,
      titleFontSize: 14,
      titleColor: COULEURS.fonce,
      showLegend: !seule,
      legendPos: "b",
      legendFontFace: POLICE,
      legendFontSize: 11,
      catAxisLabelFontFace: POLICE,
      catAxisLabelFontSize: 11,
      catAxisLabelColor: COULEURS.fonce,
      valAxisLabelFontSize: 10,
      valAxisLabelColor: COULEURS.gris,
      valAxisLabelFormatCode: "#,##0",
      valGridLine: { color: "E6ECEE", size: 0.5 },
      catGridLine: { style: "none" },
      showValue: seule,
      dataLabelFormatCode: "#,##0",
      dataLabelFontSize: 10,
      dataLabelColor: COULEURS.fonce,
      barGapWidthPct: seule ? 70 : 120,
    }
  );
}

/** Une colonne d'indicateurs à droite d'un graphique. */
function colonneChiffres(s: Diapo, indicateurs: Indicateur[], x: number, y: number, w: number) {
  indicateurs.slice(0, 4).forEach((i, k) => {
    const top = y + k * 1.32;
    const e = evolutionTexte(i);
    s.addText(
      [
        { text: i.libelle, options: { fontSize: 12, color: COULEURS.gris, breakLine: true } },
        { text: valeurTexte(i), options: { fontSize: 24, bold: true, color: COULEURS.primaire } },
        { text: ` ${i.unite}`, options: { fontSize: 11, color: COULEURS.fonce, breakLine: true } },
        { text: e.texte, options: { fontSize: 12, bold: true, color: e.couleur } },
      ],
      { x, y: top, w, h: 1.2, fontFace: POLICE, valign: "middle", fill: { color: COULEURS.clair }, margin: 8 }
    );
  });
}

export async function rendreNotePptx(note: NoteSituation, retouches: Retouches = {}): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = note.departement.sigle;
  pptx.company = "MINEPIA";
  pptx.title = `${titreNote} — ${note.periode.libelle}`;

  // 1. La couverture.
  const c = pptx.addSlide();
  c.background = { color: COULEURS.primaire };
  c.addText("RÉPUBLIQUE DU CAMEROUN · Paix – Travail – Patrie", { x: 0.6, y: 0.4, w: 12, h: 0.4, fontFace: POLICE, fontSize: 12, color: "E9F5F4" });
  c.addText("MINISTÈRE DE L'ÉLEVAGE, DES PÊCHES ET DES INDUSTRIES ANIMALES", { x: 0.6, y: 0.75, w: 12, h: 0.4, fontFace: POLICE, fontSize: 12, bold: true, color: "E9F5F4" });
  c.addText(titreNote, { x: 0.6, y: 2.2, w: 12.1, h: 1.6, fontFace: POLICE, fontSize: 38, bold: true, color: "FFFFFF", valign: "top" });
  c.addText(sousTitreNote(note), { x: 0.6, y: 3.9, w: 12.1, h: 0.6, fontFace: POLICE, fontSize: 24, color: "FFFFFF" });
  c.addShape(pptx.ShapeType.rect, { x: 0.6, y: 4.75, w: 1.6, h: 0.06, fill: { color: "D9A84E" }, line: { color: "D9A84E" } });
  c.addText(`Délégation départementale — ${note.departement.sigle}\nNote de situation du ${note.produitLe}`, {
    x: 0.6, y: 5.0, w: 12, h: 0.9, fontFace: POLICE, fontSize: 16, color: "E9F5F4",
  });
  c.addText(phraseCouverture(note), { x: 0.6, y: 6.6, w: 12, h: 0.4, fontFace: POLICE, fontSize: 12, italic: true, color: "E9F5F4" });

  // 2. L'essentiel en chiffres.
  const tuiles = indicateursAffiches(note).slice(0, 12);
  const s2 = cadre(pptx, note, "L'essentiel en chiffres", phraseComparaison(note));
  const colonnes = 4;
  const lt = 2.95;
  const ht = 1.68;
  tuiles.forEach((i, k) => {
    const x = 0.5 + (k % colonnes) * (lt + 0.18);
    const y = 1.5 + Math.floor(k / colonnes) * (ht + 0.14);
    const e = evolutionTexte(i);
    s2.addText(
      [
        { text: i.libelle, options: { fontSize: 13, color: COULEURS.gris, breakLine: true } },
        { text: valeurTexte(i), options: { fontSize: 28, bold: true, color: COULEURS.primaire, breakLine: true } },
        { text: i.unite, options: { fontSize: 11, color: COULEURS.fonce, breakLine: true } },
        { text: e.texte, options: { fontSize: 13, bold: true, color: e.couleur } },
      ],
      { x, y, w: lt, h: ht, fontFace: POLICE, valign: "middle", fill: { color: COULEURS.clair }, line: { color: COULEURS.ligne, width: 0.5 }, margin: 10 }
    );
  });

  // 3. Les faits saillants.
  const faits = faitsRetenus(note, retouches).slice(0, 8);
  if (faits.length) {
    const s3 = cadre(pptx, note, "Faits saillants");
    const puce: Record<string, string> = { hausse: COULEURS.vert, baisse: COULEURS.rouge, alerte: COULEURS.rouge, fiabilite: COULEURS.ambre, info: COULEURS.primaire };
    // Le carré de couleur dit la nature du fait : hausse, baisse ou alerte, fiabilité, information.
    s3.addText(
      faits.flatMap((f, k) => [
        // L'espacement d'un paragraphe se lit sur son premier morceau : il est porté ici.
        { text: "■  ", options: { color: puce[f.genre] ?? COULEURS.primaire, paraSpaceAfter: faits.length > 6 ? 14 : 20 } },
        { text: f.texte, options: { color: COULEURS.fonce, breakLine: k < faits.length - 1, paraSpaceAfter: faits.length > 6 ? 14 : 20 } },
      ]),
      { x: 0.6, y: 1.35, w: 12.1, h: 5.55, fontFace: POLICE, fontSize: faits.length > 6 ? 19 : 22, valign: "top", lineSpacingMultiple: 1.1 }
    );
  }

  // 4. Le cheptel.
  const chiffresCheptel = indicateursDe(note, ["bovins", "petitsRuminants", "porcins", "volaille"]);
  if (note.graphiques.cheptel || chiffresCheptel.length) {
    const s4 = cadre(pptx, note, "Le cheptel", "Effectifs déclarés au dernier mois de la période, par arrondissement.");
    if (note.graphiques.cheptel) graphique(pptx, s4, note.graphiques.cheptel, 0.4, 1.45, 8.9, 5.5);
    colonneChiffres(s4, chiffresCheptel, 9.6, 1.5, 3.3);
  }

  // 5. Abattages et productions.
  const chiffresProd = indicateursDe(note, ["viande", "lait", "oeufs", "poisson"]);
  if (note.graphiques.abattages || chiffresProd.length) {
    const s5 = cadre(pptx, note, "Abattages et productions", "Cumul de la période.");
    if (note.graphiques.abattages) graphique(pptx, s5, note.graphiques.abattages, 0.4, 1.45, 8.9, 5.5);
    colonneChiffres(s5, chiffresProd, 9.6, 1.5, 3.3);
  }

  // 6. La santé animale.
  const sante = note.sante;
  const s6 = cadre(pptx, note, "Santé animale", `${pluriel(sante.totalFoyers, "foyer déclaré", "foyers déclarés")} · ${pluriel(sante.totalVaccines, "animal vacciné", "animaux vaccinés")}`);
  if (sante.foyers.length) {
    const entete = ["Maladie", "Foyers", "Morts", "Arrondissements"].map((t) => ({
      text: t, options: { bold: true, color: "FFFFFF", fill: { color: COULEURS.primaire } },
    }));
    const lignes = sante.foyers.slice(0, 9).map((f) => [
      { text: f.maladie, options: {} },
      { text: nb(f.foyers), options: { align: "right" as const } },
      { text: f.morts ? nb(f.morts) : "—", options: { align: "right" as const } },
      { text: f.arrondissements.join(", "), options: { fontSize: 10 } },
    ]);
    s6.addTable([entete, ...lignes], {
      x: 0.4, y: 1.5, w: 6.6, colW: [2.2, 0.9, 0.9, 2.6], fontFace: POLICE, fontSize: 12, color: COULEURS.fonce,
      border: { type: "solid", pt: 0.5, color: COULEURS.ligne }, autoPage: false,
    });
    if (sante.foyers.length > 9) {
      s6.addText(`… et ${pluriel(sante.foyers.length - 9, "autre maladie", "autres maladies")}.`, { x: 0.4, y: 6.6, w: 6.6, h: 0.3, fontFace: POLICE, fontSize: 11, italic: true, color: COULEURS.gris });
    }
  } else {
    s6.addText("Aucun foyer de maladie déclaré sur la période.", { x: 0.4, y: 2.5, w: 6.6, h: 1, fontFace: POLICE, fontSize: 20, color: COULEURS.vert, bold: true });
  }
  if (note.graphiques.vaccinations) graphique(pptx, s6, note.graphiques.vaccinations, 7.3, 1.45, 5.7, 5.4);
  else s6.addText("Aucune vaccination déclarée sur la période.", { x: 7.3, y: 2.5, w: 5.7, h: 1, fontFace: POLICE, fontSize: 18, color: COULEURS.gris });

  // 7. La commercialisation.
  if (note.graphiques.ventes) {
    const ventes = note.indicateurs.find((i) => i.cle === "ventes");
    const s7 = cadre(pptx, note, "Commercialisation du bétail et de la volaille", ventes?.valeur != null ? `${valeurTexte(ventes)} animaux vendus sur les marchés · ${evolutionTexte(ventes).texte}` : undefined);
    graphique(pptx, s7, note.graphiques.ventes, 0.4, 1.45, 12.5, 5.5);
  }

  // 8. Ce que valent les chiffres, et les remarques du Délégué.
  const cv = note.couverture;
  const s8 = cadre(pptx, note, "Fiabilité des chiffres", phraseCouverture(note));
  const entete = [{ text: "Arrondissement", options: { bold: true, color: "FFFFFF", fill: { color: COULEURS.primaire } } },
    ...cv.mois.map((m) => ({ text: m, options: { bold: true, color: "FFFFFF", fill: { color: COULEURS.primaire }, align: "center" as const } }))];
  const lignes = cv.arrondissements.map((a, i) => [
    { text: a, options: {} },
    ...cv.transmis[i].map((ok) => ({
      text: ok ? "✓" : "✗",
      options: { align: "center" as const, bold: true, color: ok ? COULEURS.vert : COULEURS.rouge, fill: { color: ok ? "E6F5EF" : "FBEBEC" } },
    })),
  ]);
  const largeurMois = Math.min(1.2, 7.4 / Math.max(1, cv.mois.length));
  s8.addTable([entete, ...lignes], {
    x: 0.4, y: 1.5, w: 2.2 + largeurMois * cv.mois.length, colW: [2.2, ...cv.mois.map(() => largeurMois)],
    fontFace: POLICE, fontSize: cv.mois.length > 8 ? 10 : 12, color: COULEURS.fonce, border: { type: "solid", pt: 0.5, color: COULEURS.ligne }, autoPage: false,
  });
  const remarques = retouches.remarques?.trim();
  if (remarques) {
    s8.addText(
      [
        { text: "Remarques du Délégué", options: { bold: true, fontSize: 15, color: COULEURS.primaire, breakLine: true } },
        { text: remarques, options: { fontSize: 14, color: COULEURS.fonce } },
      ],
      { x: 0.4, y: 5.05, w: 12.5, h: 1.9, fontFace: POLICE, valign: "top", fill: { color: COULEURS.clair }, margin: 10 }
    );
  }

  return (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
}
