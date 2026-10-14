/**
 * La note de situation en PDF : à envoyer tel quel, lisible partout. pdfkit
 * n'a ni tableaux ni graphiques : ils sont dessinés ici, simplement.
 *
 * Les polices intégrées de pdfkit (Helvetica) ne connaissent ni les flèches
 * ni les coches : « ▲ +22,2 % » s'écrit « +22,2 % » en vert, une coche se
 * dessine en case colorée « oui » / « non ».
 */
import PDFDocument from "pdfkit";
import type { DonneesGraphique } from "@/server/trimestre/canevas/graphiques";
import { nb, type NoteSituation } from "./noteSituation";
import {
  COULEURS, evolutionTexte, faitsRetenus, indicateursAffiches, phraseComparaison, phraseCouverture, sousTitreNote, titreNote,
  valeurTexte, type Retouches,
} from "./presentation";

const MARGE = 40;
const c = (hex: string) => `#${hex}`;
/** Ce que Helvetica sait écrire. */
const sur = (t: string) => t.replace(/[▲▼]\s?/g, "").replace(/−/g, "-").replace(/[ ]/g, " ").replace(/[✓]/g, "oui").replace(/[✗]/g, "non");

type Doc = InstanceType<typeof PDFDocument>;

/** Un pas d'axe « rond » : 1, 2 ou 5 × une puissance de 10. */
function pasRond(brut: number): number {
  if (brut <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(brut));
  const n = brut / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

function dessinerGraphique(doc: Doc, g: DonneesGraphique, x: number, y: number, w: number, h: number) {
  doc.font("Helvetica-Bold").fontSize(10).fillColor(c(COULEURS.fonce)).text(sur(g.titre), x, y, { width: w, align: "center" });
  const seule = g.series.length === 1;
  const hautLegende = seule ? 0 : 16;
  const gauche = x + 48;
  const haut = y + 20;
  const bas = y + h - 34 - hautLegende;
  const largeur = x + w - gauche;
  const max = Math.max(1, ...g.series.flatMap((s) => s.valeurs.filter((v): v is number => v != null)));
  const pas = pasRond(max / 5);
  const sommet = Math.ceil(max / pas) * pas;
  const yDe = (v: number) => bas - (v / sommet) * (bas - haut);

  // L'axe des valeurs et ses lignes.
  doc.font("Helvetica").fontSize(7).fillColor(c(COULEURS.gris));
  for (let v = 0; v <= sommet + pas / 2; v += pas) {
    const yy = yDe(v);
    doc.moveTo(gauche, yy).lineTo(gauche + largeur, yy).lineWidth(0.4).strokeColor("#E6ECEE").stroke();
    doc.text(nb(v), x, yy - 4, { width: 44, align: "right" });
  }
  // Les barres.
  const groupe = largeur / g.categories.length;
  const barre = (groupe * 0.76) / g.series.length;
  g.categories.forEach((cat, k) => {
    const x0 = gauche + k * groupe + groupe * 0.12;
    g.series.forEach((s, i) => {
      const v = s.valeurs[k];
      if (v == null) return; // pas de chiffre, pas de barre — jamais un zéro inventé
      const yy = yDe(v);
      doc.rect(x0 + i * barre, yy, barre - 1, bas - yy).fill(c(COULEURS.series[i % COULEURS.series.length]));
      if (seule) doc.font("Helvetica").fontSize(7).fillColor(c(COULEURS.fonce)).text(nb(v), x0 + i * barre - 10, yy - 9, { width: barre + 20, align: "center" });
    });
    doc.font("Helvetica").fontSize(7).fillColor(c(COULEURS.fonce)).text(sur(cat), gauche + k * groupe, bas + 4, { width: groupe, align: "center", height: 26, ellipsis: true });
  });
  doc.moveTo(gauche, bas).lineTo(gauche + largeur, bas).lineWidth(0.6).strokeColor(c(COULEURS.gris)).stroke();
  // La légende.
  if (!seule) {
    let lx = gauche;
    const ly = y + h - hautLegende;
    g.series.forEach((s, i) => {
      doc.rect(lx, ly + 2, 7, 7).fill(c(COULEURS.series[i % COULEURS.series.length]));
      doc.font("Helvetica").fontSize(8).fillColor(c(COULEURS.fonce)).text(sur(s.nom), lx + 10, ly + 1, { lineBreak: false });
      lx += 18 + doc.widthOfString(sur(s.nom));
    });
  }
}

/** Un tableau simple ; rend la position sous lui. */
function dessinerTableau(
  doc: Doc,
  x: number,
  y: number,
  colonnes: number[],
  lignes: { textes: string[]; entete?: boolean; couleurs?: (string | undefined)[]; fonds?: (string | undefined)[]; droite?: boolean[] }[]
): number {
  let yy = y;
  for (const l of lignes) {
    doc.font(l.entete ? "Helvetica-Bold" : "Helvetica").fontSize(9);
    const hauteur = Math.max(...l.textes.map((t, i) => doc.heightOfString(sur(t), { width: colonnes[i] - 8 }))) + 8;
    if (yy + hauteur > doc.page.height - MARGE) {
      doc.addPage();
      yy = MARGE;
    }
    let xx = x;
    l.textes.forEach((t, i) => {
      const fond = l.entete ? COULEURS.primaire : l.fonds?.[i];
      if (fond) doc.rect(xx, yy, colonnes[i], hauteur).fill(c(fond));
      doc.rect(xx, yy, colonnes[i], hauteur).lineWidth(0.5).strokeColor(c(COULEURS.ligne)).stroke();
      doc
        .font(l.entete ? "Helvetica-Bold" : "Helvetica")
        .fontSize(9)
        .fillColor(l.entete ? "#FFFFFF" : c(l.couleurs?.[i] ?? COULEURS.fonce))
        .text(sur(t), xx + 4, yy + 4, { width: colonnes[i] - 8, align: l.droite?.[i] ? "right" : "left" });
      xx += colonnes[i];
    });
    yy += hauteur;
  }
  return yy + 8;
}

export async function rendreNotePdf(note: NoteSituation, retouches: Retouches = {}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: MARGE, size: "A4", info: { Title: `${titreNote} — ${note.periode.libelle}`, Author: note.departement.sigle } });
    const morceaux: Buffer[] = [];
    doc.on("data", (m: Buffer) => morceaux.push(m));
    doc.on("end", () => resolve(Buffer.concat(morceaux)));
    doc.on("error", reject);

    const largeur = doc.page.width - MARGE * 2;
    let y = MARGE;
    const place = (h: number) => {
      if (y + h > doc.page.height - MARGE) {
        doc.addPage();
        y = MARGE;
      }
    };
    const titre = (t: string) => {
      place(60);
      doc.rect(MARGE, y, largeur, 22).fill(c(COULEURS.primaire));
      doc.font("Helvetica-Bold").fontSize(12).fillColor("#FFFFFF").text(sur(t), MARGE + 8, y + 6, { width: largeur - 16 });
      y += 30;
    };

    // L'en-tête.
    doc.rect(0, 0, doc.page.width, 118).fill(c(COULEURS.primaire));
    doc.font("Helvetica").fontSize(8).fillColor("#E9F5F4").text("RÉPUBLIQUE DU CAMEROUN — Paix – Travail – Patrie", MARGE, 18);
    doc.font("Helvetica-Bold").fontSize(8).text(`MINISTÈRE DE L'ÉLEVAGE, DES PÊCHES ET DES INDUSTRIES ANIMALES — ${note.departement.sigle}`, MARGE, 30);
    doc.font("Helvetica-Bold").fontSize(18).fillColor("#FFFFFF").text(sur(titreNote), MARGE, 50, { width: largeur });
    doc.font("Helvetica").fontSize(12).text(sur(`${sousTitreNote(note)} · note du ${note.produitLe}`), MARGE, 92, { width: largeur });
    y = 132;
    doc.font("Helvetica-Oblique").fontSize(9).fillColor(c(COULEURS.gris)).text(sur(`${phraseCouverture(note)} ${phraseComparaison(note)}`), MARGE, y, { width: largeur });
    y = doc.y + 10;

    // L'essentiel en chiffres : des tuiles, trois par ligne.
    titre("L'essentiel en chiffres");
    const tuiles = indicateursAffiches(note);
    const lt = (largeur - 16) / 3;
    const ht = 58;
    tuiles.forEach((i, k) => {
      if (k % 3 === 0) place(ht + 8);
      const x = MARGE + (k % 3) * (lt + 8);
      const yy = y;
      const e = evolutionTexte(i);
      doc.rect(x, yy, lt, ht).fill(c(COULEURS.clair));
      doc.font("Helvetica").fontSize(8).fillColor(c(COULEURS.gris)).text(sur(i.libelle), x + 8, yy + 6, { width: lt - 16 });
      doc.font("Helvetica-Bold").fontSize(16).fillColor(c(COULEURS.primaire)).text(sur(valeurTexte(i)), x + 8, yy + 18, { width: lt - 16, lineBreak: false });
      doc.font("Helvetica").fontSize(7.5).fillColor(c(COULEURS.fonce)).text(sur(i.unite), x + 8, yy + 37, { width: lt - 70, lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(9).fillColor(c(e.couleur)).text(sur(e.texte), x + lt - 70, yy + 37, { width: 62, align: "right" });
      if (k % 3 === 2 || k === tuiles.length - 1) y += ht + 8;
    });
    y += 4;

    // Les faits saillants.
    const faits = faitsRetenus(note, retouches);
    if (faits.length) {
      titre("Faits saillants");
      const couleur: Record<string, string> = { hausse: COULEURS.vert, baisse: COULEURS.rouge, alerte: COULEURS.rouge, fiabilite: COULEURS.ambre, info: COULEURS.primaire };
      for (const f of faits) {
        doc.font("Helvetica").fontSize(10);
        const h = doc.heightOfString(sur(f.texte), { width: largeur - 16 }) + 6;
        place(h);
        doc.rect(MARGE + 2, y + 3, 6, 6).fill(c(couleur[f.genre] ?? COULEURS.primaire));
        doc.font("Helvetica").fontSize(10).fillColor(c(COULEURS.fonce)).text(sur(f.texte), MARGE + 16, y, { width: largeur - 16, align: "justify" });
        y += h;
      }
      y += 6;
    }

    // Les graphiques.
    const graphique = (t: string, g: DonneesGraphique | null) => {
      if (!g) return;
      // Le titre ne reste jamais seul en bas de page : il part avec son graphique.
      place(30 + 232);
      titre(t);
      dessinerGraphique(doc, g, MARGE, y, largeur, 220);
      y += 232;
    };
    graphique("Le cheptel", note.graphiques.cheptel);
    graphique("Abattages et productions", note.graphiques.abattages);

    // La santé animale.
    titre("Santé animale");
    if (note.sante.foyers.length) {
      y = dessinerTableau(doc, MARGE, y, [150, 55, 55, largeur - 260], [
        { textes: ["Maladie", "Foyers", "Morts", "Arrondissements"], entete: true },
        ...note.sante.foyers.map((f) => ({
          textes: [f.maladie, nb(f.foyers), f.morts ? nb(f.morts) : "—", f.arrondissements.join(", ")],
          droite: [false, true, true, false],
        })),
      ]);
    } else {
      doc.font("Helvetica-Bold").fontSize(10).fillColor(c(COULEURS.vert)).text("Aucun foyer de maladie déclaré sur la période.", MARGE, y);
      y = doc.y + 8;
    }
    if (note.graphiques.vaccinations) {
      place(230);
      dessinerGraphique(doc, note.graphiques.vaccinations, MARGE, y, largeur, 220);
      y += 232;
    }
    graphique("Commercialisation", note.graphiques.ventes);

    // Ce que valent les chiffres.
    const cv = note.couverture;
    titre("Fiabilité des chiffres");
    const largeurMois = Math.min(60, (largeur - 120) / Math.max(1, cv.mois.length));
    y = dessinerTableau(doc, MARGE, y, [120, ...cv.mois.map(() => largeurMois)], [
      { textes: ["Arrondissement", ...cv.mois], entete: true },
      ...cv.arrondissements.map((a, i) => ({
        textes: [a, ...cv.transmis[i].map((ok) => (ok ? "oui" : "non"))],
        couleurs: [undefined, ...cv.transmis[i].map((ok) => (ok ? COULEURS.vert : COULEURS.rouge))],
        fonds: [undefined, ...cv.transmis[i].map((ok) => (ok ? "E6F5EF" : "FBEBEC"))],
      })),
    ]);

    const remarques = retouches.remarques?.trim();
    if (remarques) {
      titre("Remarques du Délégué");
      doc.font("Helvetica").fontSize(10);
      place(doc.heightOfString(sur(remarques), { width: largeur }) + 10);
      doc.fillColor(c(COULEURS.fonce)).text(sur(remarques), MARGE, y, { width: largeur, align: "justify" });
    }
    doc.end();
  });
}
