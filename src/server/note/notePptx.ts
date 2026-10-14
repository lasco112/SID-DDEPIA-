/**
 * La note de situation en PRÉSENTATION PowerPoint — le format que le Délégué
 * projette (demandes des 14 et 15 octobre 2026) : en-tête officiel bilingue et
 * logo du ministère, plan, une section par diapositive, numérotées « 3 / 12 »,
 * pour tenir en une dizaine de minutes. Les graphiques sont de vrais
 * graphiques PowerPoint, modifiables ; une case sans chiffre reste vide.
 *
 * Une diapositive sans matière (pas de marché saisi, pas d'événement) n'est
 * pas produite : le plan ne montre que ce qui sera présenté.
 */
import PptxGenJS from "pptxgenjs";
import type { DonneesGraphique } from "@/server/trimestre/canevas/graphiques";
import type { Indicateur, NoteSituation } from "./noteSituation";
import { nb } from "./noteSituation";
import {
  COULEURS, ENTETE, evolutionTexte, faitsRetenus, indicateursAffiches, indicateursDe, logoMinepia, phraseComparaison,
  phraseCouverture, sousTitreNote, titreNote, valeurTexte, type Retouches,
} from "./presentation";

const LARGEUR = 13.333;
const POLICE = "Calibri";
type Diapo = ReturnType<PptxGenJS["addSlide"]>;

/** « 1 foyer déclaré », « 3 163 foyers déclarés », « aucun foyer déclaré ». */
const pluriel = (n: number, un: string, plusieurs: string) => (n === 0 ? `aucun ${un}` : `${nb(n)} ${n > 1 ? plusieurs : un}`);

/** Une section de la présentation : son titre (au plan), et ce qu'elle dessine. */
interface Section {
  titre: string;
  sousTitre?: string;
  dessiner: (s: Diapo) => void;
}

export async function rendreNotePptx(note: NoteSituation, retouches: Retouches = {}): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = note.departement.sigle;
  pptx.company = "MINEPIA";
  pptx.title = `${titreNote} — ${note.periode.libelle}`;
  const logo = logoMinepia();
  const image = logo ? `image/png;base64,${logo.toString("base64")}` : null;

  // ---------------------------------------------------------------- outils

  const graphique = (s: Diapo, g: DonneesGraphique, x: number, y: number, w: number, h: number) => {
    const seule = g.series.length === 1;
    s.addChart(
      pptx.ChartType.bar,
      g.series.map((serie) => ({ name: serie.nom, labels: g.categories, values: serie.valeurs as number[] })),
      {
        x, y, w, h,
        barDir: "col", barGrouping: "clustered",
        chartColors: COULEURS.series.slice(0, Math.max(1, g.series.length)),
        showTitle: true, title: g.titre, titleFontFace: POLICE, titleFontSize: 14, titleColor: COULEURS.fonce,
        showLegend: !seule, legendPos: "b", legendFontFace: POLICE, legendFontSize: 11,
        catAxisLabelFontFace: POLICE, catAxisLabelFontSize: 11, catAxisLabelColor: COULEURS.fonce,
        valAxisLabelFontSize: 10, valAxisLabelColor: COULEURS.gris, valAxisLabelFormatCode: "#,##0",
        valGridLine: { color: "E6ECEE", size: 0.5 }, catGridLine: { style: "none" },
        showValue: seule, dataLabelFormatCode: "#,##0", dataLabelFontSize: 10, dataLabelColor: COULEURS.fonce,
        barGapWidthPct: seule ? 70 : 120,
      }
    );
  };

  const tuile = (s: Diapo, i: Indicateur, x: number, y: number, w: number, h: number, grand = true) => {
    const e = evolutionTexte(i);
    s.addText(
      [
        { text: i.libelle, options: { fontSize: grand ? 13 : 12, color: COULEURS.gris, breakLine: true } },
        { text: valeurTexte(i), options: { fontSize: grand ? 28 : 24, bold: true, color: COULEURS.primaire, breakLine: grand } },
        { text: grand ? i.unite : ` ${i.unite}`, options: { fontSize: 11, color: COULEURS.fonce, breakLine: true } },
        ...(i.sansComparaison ? [] : [{ text: e.texte, options: { fontSize: grand ? 13 : 12, bold: true, color: e.couleur } }]),
      ],
      { x, y, w, h, fontFace: POLICE, valign: "middle", fill: { color: COULEURS.clair }, line: { color: COULEURS.ligne, width: 0.5 }, margin: 10 }
    );
  };
  const colonneChiffres = (s: Diapo, indicateurs: Indicateur[], x: number, y: number, w: number) =>
    indicateurs.slice(0, 4).forEach((i, k) => tuile(s, i, x, y + k * 1.32, w, 1.2, false));

  const entete = (cellules: string[]) =>
    cellules.map((t) => ({ text: t, options: { bold: true, color: "FFFFFF", fill: { color: COULEURS.primaire } } }));
  const tableau = (s: Diapo, lignes: unknown[], x: number, y: number, w: number, colW: number[], taille = 12) =>
    s.addTable(lignes as never, {
      x, y, w, colW, fontFace: POLICE, fontSize: taille, color: COULEURS.fonce,
      border: { type: "solid", pt: 0.5, color: COULEURS.ligne }, autoPage: false, valign: "middle",
    });

  // ---------------------------------------------------------------- les sections

  const sections: Section[] = [];

  sections.push({
    titre: "L'essentiel en chiffres",
    sousTitre: phraseComparaison(note),
    dessiner: (s) => {
      const tuiles = indicateursAffiches(note).slice(0, 12);
      tuiles.forEach((i, k) => tuile(s, i, 0.5 + (k % 4) * 3.13, 1.5 + Math.floor(k / 4) * 1.82, 2.95, 1.68));
    },
  });

  const faits = faitsRetenus(note, retouches).slice(0, 8);
  if (faits.length) {
    const puce: Record<string, string> = { hausse: COULEURS.vert, baisse: COULEURS.rouge, alerte: COULEURS.rouge, fiabilite: COULEURS.ambre, info: COULEURS.primaire };
    sections.push({
      titre: "Faits saillants",
      dessiner: (s) =>
        s.addText(
          faits.flatMap((f, k) => [
            { text: "■  ", options: { color: puce[f.genre] ?? COULEURS.primaire, paraSpaceAfter: faits.length > 6 ? 14 : 20 } },
            { text: f.texte, options: { color: COULEURS.fonce, breakLine: k < faits.length - 1, paraSpaceAfter: faits.length > 6 ? 14 : 20 } },
          ]),
          { x: 0.6, y: 1.35, w: 12.1, h: 5.55, fontFace: POLICE, fontSize: faits.length > 6 ? 19 : 22, valign: "top" }
        ),
    });
  }

  const chiffresCheptel = indicateursDe(note, ["bovins", "petitsRuminants", "porcins", "volaille"]);
  if (note.graphiques.cheptel || chiffresCheptel.length) {
    sections.push({
      titre: "Le cheptel",
      sousTitre: "Effectifs déclarés au dernier mois de la période, par arrondissement.",
      dessiner: (s) => {
        if (note.graphiques.cheptel) graphique(s, note.graphiques.cheptel, 0.4, 1.45, 8.9, 5.5);
        colonneChiffres(s, chiffresCheptel, 9.6, 1.5, 3.3);
      },
    });
  }

  const chiffresProd = indicateursDe(note, ["viande", "lait", "oeufs", "poisson"]);
  if (note.graphiques.abattages || chiffresProd.length) {
    sections.push({
      titre: "Abattages et productions",
      sousTitre: "Cumul de la période.",
      dessiner: (s) => {
        if (note.graphiques.abattages) graphique(s, note.graphiques.abattages, 0.4, 1.45, 8.9, 5.5);
        colonneChiffres(s, chiffresProd, 9.6, 1.5, 3.3);
      },
    });
  }

  if (note.graphiques.ventes) {
    const ventes = note.indicateurs.find((i) => i.cle === "ventes");
    sections.push({
      titre: "Commercialisation",
      sousTitre: ventes?.valeur != null ? `${valeurTexte(ventes)} animaux vendus sur les marchés · ${evolutionTexte(ventes).texte}` : undefined,
      dessiner: (s) => graphique(s, note.graphiques.ventes!, 0.4, 1.45, 12.5, 5.5),
    });
  }

  const sante = note.sante;
  sections.push({
    titre: "Santé animale",
    sousTitre: `${pluriel(sante.totalFoyers, "foyer déclaré", "foyers déclarés")} · ${pluriel(sante.totalVaccines, "animal vacciné", "animaux vaccinés")}`,
    dessiner: (s) => {
      if (sante.foyers.length) {
        tableau(
          s,
          [
            entete(["Maladie", "Foyers", "Morts", "Arrondissements"]),
            ...sante.foyers.slice(0, 9).map((f) => [
              { text: f.maladie, options: {} },
              { text: nb(f.foyers), options: { align: "right" } },
              { text: f.morts ? nb(f.morts) : "—", options: { align: "right" } },
              { text: f.arrondissements.join(", "), options: { fontSize: 10 } },
            ]),
          ],
          0.4, 1.5, 6.6, [2.2, 0.9, 0.9, 2.6]
        );
        if (sante.foyers.length > 9) {
          s.addText(`… et ${pluriel(sante.foyers.length - 9, "autre maladie", "autres maladies")}.`, { x: 0.4, y: 6.6, w: 6.6, h: 0.3, fontFace: POLICE, fontSize: 11, italic: true, color: COULEURS.gris });
        }
      } else {
        s.addText("Aucun foyer de maladie déclaré sur la période.", { x: 0.4, y: 2.5, w: 6.6, h: 1, fontFace: POLICE, fontSize: 20, color: COULEURS.vert, bold: true });
      }
      if (note.graphiques.vaccinations) graphique(s, note.graphiques.vaccinations, 7.3, 1.45, 5.7, 5.4);
      else s.addText("Aucune vaccination déclarée sur la période.", { x: 7.3, y: 2.5, w: 5.7, h: 1, fontFace: POLICE, fontSize: 18, color: COULEURS.gris });
    },
  });

  // Les épisodes épidémiques et ce qui a été fait.
  const episodes = note.episodes.slice(0, 10);
  if (episodes.length) {
    sections.push({
      titre: "Épisodes épidémiques et leur gestion",
      sousTitre: "Foyers déclarés dans les rapports mensuels : où, combien, et les mesures prises.",
      dessiner: (s) => {
        tableau(
          s,
          [
            entete(["Maladie", "Où", "Foyers", "Touchés", "Morts", "Mesures prises"]),
            ...episodes.map((e) => [
              { text: e.maladie, options: { bold: true } },
              { text: `${e.arrondissement}${e.localites.length ? ` — ${e.localites.slice(0, 2).join(", ")}${e.localites.length > 2 ? "…" : ""}` : ""}`, options: { fontSize: 10 } },
              { text: nb(e.foyers), options: { align: "right" } },
              { text: e.touches ? nb(e.touches) : "—", options: { align: "right" } },
              { text: e.morts ? nb(e.morts) : "—", options: { align: "right", color: e.morts ? COULEURS.rouge : COULEURS.fonce } },
              { text: e.mesures.length ? e.mesures.join(" ; ") : "Non précisées", options: { fontSize: 10, italic: !e.mesures.length, color: e.mesures.length ? COULEURS.fonce : COULEURS.gris } },
            ]),
          ],
          0.4, 1.5, 12.5, [2.3, 3.0, 1.0, 1.1, 1.0, 4.1], 12
        );
        if (note.episodes.length > episodes.length) {
          s.addText(`… et ${pluriel(note.episodes.length - episodes.length, "autre épisode", "autres épisodes")}.`, { x: 0.4, y: 6.6, w: 12, h: 0.3, fontFace: POLICE, fontSize: 11, italic: true, color: COULEURS.gris });
        }
      },
    });
  }

  // Les événements particuliers, écrits par le Délégué.
  const evenements = (retouches.evenements ?? []).filter((e) => e.titre.trim() || e.texte.trim()).slice(0, 6);
  if (evenements.length) {
    sections.push({
      titre: "Événements particuliers",
      sousTitre: `Faits ponctuels du ${note.periode.libelle} signalés par la Délégation.`,
      dessiner: (s) => {
        const colonnes = evenements.length > 3 ? 2 : 1;
        const lignes = Math.ceil(evenements.length / colonnes);
        const w = (12.5 - (colonnes - 1) * 0.3) / colonnes;
        // La hauteur suit le texte (environ 13 caractères au pouce en corps 14), sans dépasser la place.
        const place = (5.4 - (lignes - 1) * 0.2) / lignes;
        const hauteur = (t: string) => Math.min(place, 0.75 + Math.ceil(Math.max(1, t.length) / ((w - 0.5) * 13)) * 0.3);
        const parLigne = Array.from({ length: lignes }, (_, r) =>
          Math.max(...evenements.slice(r * colonnes, r * colonnes + colonnes).map((e) => hauteur(e.texte.trim())))
        );
        evenements.forEach((e, k) => {
          const r = Math.floor(k / colonnes);
          const x = 0.4 + (k % colonnes) * (w + 0.3);
          const y = 1.5 + parLigne.slice(0, r).reduce((s, v) => s + v + 0.2, 0);
          const h = parLigne[r];
          s.addShape(pptx.ShapeType.rect, { x, y, w: 0.08, h, fill: { color: COULEURS.ambre }, line: { color: COULEURS.ambre } });
          s.addText(
            [
              { text: e.titre.trim() || "Événement", options: { bold: true, fontSize: 17, color: COULEURS.primaire, breakLine: true } },
              { text: e.texte.trim(), options: { fontSize: 14, color: COULEURS.fonce } },
            ],
            { x: x + 0.15, y, w: w - 0.15, h, fontFace: POLICE, valign: "top", fill: { color: COULEURS.clair }, margin: 10 }
          );
        });
      },
    });
  }

  // Le budget : recettes et crédits.
  const { recettes, credits, marches } = note.budget;
  if (recettes || credits) {
    const tuilesBudget: Indicateur[] = [];
    const ind = note.indicateurs.find((i) => i.cle === "recettes");
    if (ind) tuilesBudget.push(ind);
    const credit = (cle: string, libelle: string, v: number | null): Indicateur | null =>
      v == null ? null : { cle, libelle, unite: `FCFA (${credits!.trimestre})`, valeur: v, reference: null, evolution: null, hausseFavorable: true, decimales: 0, parArrondissement: [], sansComparaison: true };
    if (credits) {
      for (const c of [credit("fonct", "Crédits de fonctionnement", credits.fonctionnement), credit("invest", "Crédits d'investissement", credits.investissement)]) if (c) tuilesBudget.push(c);
    }
    sections.push({
      titre: "Budget : recettes et crédits",
      sousTitre: recettes?.libelleReference ? `Recettes comparées à ${recettes.libelleReference}.` : "Chiffres saisis par le BAC au trimestre.",
      dessiner: (s) => {
        if (note.graphiques.recettes) graphique(s, note.graphiques.recettes, 0.4, 1.45, 8.9, 5.5);
        colonneChiffres(s, tuilesBudget, note.graphiques.recettes ? 9.6 : 0.5, 1.5, 3.3);
      },
    });
  }

  // Les marchés du budget d'investissement public.
  if (marches) {
    sections.push({
      titre: "Marchés du budget d'investissement public",
      sousTitre: `${pluriel(marches.lignes.length, "marché suivi", "marchés suivis")} au ${marches.trimestre}${marches.montantTotal ? ` · ${nb(marches.montantTotal)} FCFA` : ""} · ${marches.parNiveau.map((p) => `${p.nombre} ${p.niveau.toLowerCase()}`).join(", ")}`,
      dessiner: (s) => {
        const couleurNiveau = (n: string) => (n === "Construit" ? COULEURS.vert : n === "En cours" ? COULEURS.ambre : n === "Non précisé" ? COULEURS.gris : COULEURS.rouge);
        tableau(
          s,
          [
            entete(["Infrastructure", "Arrondissement / commune", "Montant (FCFA)", "Exécution"]),
            ...marches.lignes.slice(0, 9).map((m) => [
              { text: m.infrastructure, options: {} },
              { text: m.lieu, options: { fontSize: 11 } },
              { text: m.montant != null ? nb(m.montant) : "—", options: { align: "right" } },
              { text: m.niveau, options: { bold: true, color: couleurNiveau(m.niveau) } },
            ]),
          ],
          0.4, 1.5, 12.5, [5.0, 3.5, 2.2, 1.8]
        );
      },
    });
  }

  // Ce que valent les chiffres, et les remarques du Délégué.
  const cv = note.couverture;
  const remarques = retouches.remarques?.trim();
  sections.push({
    titre: remarques ? "Fiabilité des chiffres et remarques" : "Fiabilité des chiffres",
    sousTitre: phraseCouverture(note),
    dessiner: (s) => {
      const largeurMois = Math.min(1.2, 7.4 / Math.max(1, cv.mois.length));
      tableau(
        s,
        [
          [{ text: "Arrondissement", options: { bold: true, color: "FFFFFF", fill: { color: COULEURS.primaire } } },
            ...cv.mois.map((m) => ({ text: m, options: { bold: true, color: "FFFFFF", fill: { color: COULEURS.primaire }, align: "center" } }))],
          ...cv.arrondissements.map((a, i) => [
            { text: a, options: {} },
            ...cv.transmis[i].map((ok) => ({ text: ok ? "✓" : "✗", options: { align: "center", bold: true, color: ok ? COULEURS.vert : COULEURS.rouge, fill: { color: ok ? "E6F5EF" : "FBEBEC" } } })),
          ]),
        ],
        0.4, 1.5, 2.2 + largeurMois * cv.mois.length, [2.2, ...cv.mois.map(() => largeurMois)], cv.mois.length > 8 ? 10 : 12
      );
      if (remarques) {
        s.addText(
          [
            { text: "Remarques du Délégué", options: { bold: true, fontSize: 15, color: COULEURS.primaire, breakLine: true } },
            { text: remarques, options: { fontSize: 14, color: COULEURS.fonce } },
          ],
          { x: 0.4, y: 5.05, w: 12.5, h: 1.9, fontFace: POLICE, valign: "top", fill: { color: COULEURS.clair }, margin: 10 }
        );
      }
    },
  });

  // ---------------------------------------------------------------- les diapositives

  const total = sections.length + 3; // couverture, plan, fin
  const pied = (s: Diapo, rang: number) => {
    s.addShape(pptx.ShapeType.line, { x: 0.5, y: 7.0, w: LARGEUR - 1, h: 0, line: { color: COULEURS.ligne, width: 0.75 } });
    s.addText(`${note.departement.sigle} · Note de situation · ${note.periode.libelle}`, { x: 0.5, y: 7.05, w: 9, h: 0.3, fontFace: POLICE, fontSize: 10, color: COULEURS.gris });
    s.addText(`${rang} / ${total}`, { x: LARGEUR - 1.6, y: 7.05, w: 1.1, h: 0.3, fontFace: POLICE, fontSize: 10, color: COULEURS.gris, align: "right" });
  };

  // 1. La couverture : l'en-tête officiel, comme la page de garde des rapports.
  const c = pptx.addSlide();
  c.background = { color: "FFFFFF" };
  const blocEntete = (lignes: string[], x: number) =>
    c.addText(
      lignes.flatMap((t, k) => [
        { text: t, options: { bold: k !== 1, italic: k === 1, breakLine: true } },
        ...(k === 1 || k === 2 || k === 3 ? [{ text: "———", options: { color: COULEURS.gris, breakLine: true } }] : []),
      ]),
      { x, y: 0.25, w: 4.9, h: 2.2, fontFace: POLICE, fontSize: 10, color: COULEURS.fonce, align: "center", valign: "top" }
    );
  blocEntete(ENTETE.fr(note), 0.3);
  blocEntete(ENTETE.en(note), LARGEUR - 5.2);
  if (image) c.addImage({ data: image, x: LARGEUR / 2 - 0.85, y: 0.35, w: 1.7, h: 1.55 });
  c.addShape(pptx.ShapeType.rect, { x: 0, y: 2.65, w: LARGEUR, h: 2.45, fill: { color: COULEURS.primaire }, line: { color: COULEURS.primaire } });
  c.addText("NOTE DE SITUATION", { x: 0.7, y: 2.85, w: 12, h: 0.45, fontFace: POLICE, fontSize: 16, bold: true, color: "D9A84E", charSpacing: 2 });
  c.addText(
    [
      { text: titreNote, options: { fontSize: 34, bold: true, breakLine: true } },
      { text: sousTitreNote(note), options: { fontSize: 22, paraSpaceBefore: 8 } },
    ],
    { x: 0.7, y: 3.3, w: 12, h: 2.1, fontFace: POLICE, color: "FFFFFF", valign: "top" }
  );
  c.addText(
    [
      { text: "LE DÉLÉGUÉ DÉPARTEMENTAL", options: { bold: true, breakLine: true } },
      { text: `${note.departement.sigle} · ${note.produitLe}`, options: { color: COULEURS.gris } },
    ],
    { x: 0.7, y: 5.45, w: 7, h: 0.8, fontFace: POLICE, fontSize: 14, color: COULEURS.fonce }
  );
  c.addText(phraseCouverture(note), { x: 6.5, y: 5.7, w: 6.3, h: 0.5, fontFace: POLICE, fontSize: 12, italic: true, color: COULEURS.gris, align: "right" });

  // 2. Le plan : les sections réellement présentées.
  const p = pptx.addSlide();
  p.background = { color: "FFFFFF" };
  bandeau(pptx, p, "Plan de la présentation", null, image);
  const parColonne = Math.ceil(sections.length / 2);
  sections.forEach((sec, k) => {
    const x = k < parColonne ? 0.8 : 7.0;
    const y = 1.5 + (k % parColonne) * 0.9;
    p.addShape(pptx.ShapeType.ellipse, { x, y, w: 0.6, h: 0.6, fill: { color: COULEURS.primaire }, line: { color: COULEURS.primaire } });
    p.addText(String(k + 1), { x, y, w: 0.6, h: 0.6, fontFace: POLICE, fontSize: 18, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
    p.addText(sec.titre, { x: x + 0.8, y, w: 5.2, h: 0.6, fontFace: POLICE, fontSize: 19, color: COULEURS.fonce, valign: "middle" });
  });
  pied(p, 2);

  // Les sections, numérotées comme au plan.
  sections.forEach((sec, k) => {
    const s = pptx.addSlide();
    s.background = { color: "FFFFFF" };
    bandeau(pptx, s, `${k + 1}. ${sec.titre}`, sec.sousTitre ?? null, image);
    sec.dessiner(s);
    pied(s, k + 3);
  });

  // La fin.
  const f = pptx.addSlide();
  f.background = { color: COULEURS.primaire };
  if (image) {
    f.addShape(pptx.ShapeType.ellipse, { x: LARGEUR / 2 - 1.15, y: 1.0, w: 2.3, h: 2.3, fill: { color: "FFFFFF" }, line: { color: "FFFFFF" } });
    f.addImage({ data: image, x: LARGEUR / 2 - 0.78, y: 1.43, w: 1.56, h: 1.43 });
  }
  f.addText("Merci de votre attention", { x: 0.5, y: 3.7, w: LARGEUR - 1, h: 0.9, fontFace: POLICE, fontSize: 36, bold: true, color: "FFFFFF", align: "center" });
  f.addText(`${note.departement.sigle} · ${note.periode.libelle}`, { x: 0.5, y: 4.6, w: LARGEUR - 1, h: 0.5, fontFace: POLICE, fontSize: 18, color: "E9F5F4", align: "center" });

  return (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
}

/** Le bandeau de titre d'une diapositive, avec le logo du ministère à droite. */
function bandeau(pptx: PptxGenJS, s: Diapo, titre: string, sousTitre: string | null, image: string | null) {
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: LARGEUR, h: 0.95, fill: { color: COULEURS.primaire }, line: { color: COULEURS.primaire } });
  s.addText(titre, { x: 0.5, y: 0.12, w: LARGEUR - 2.2, h: 0.72, fontFace: POLICE, fontSize: 26, bold: true, color: "FFFFFF" });
  if (image) {
    s.addShape(pptx.ShapeType.ellipse, { x: LARGEUR - 1.27, y: 0.06, w: 0.84, h: 0.84, fill: { color: "FFFFFF" }, line: { color: "FFFFFF" } });
    s.addImage({ data: image, x: LARGEUR - 1.13, y: 0.22, w: 0.56, h: 0.52 });
  }
  if (sousTitre) s.addText(sousTitre, { x: 0.5, y: 1.0, w: LARGEUR - 1, h: 0.4, fontFace: POLICE, fontSize: 13, italic: true, color: COULEURS.gris });
}
