/**
 * Le registre en PDF (21 octobre 2026 : « les données, je peux les générer en
 * PDF ou autre ») : la LISTE des acteurs, et la FICHE d'un marché — une page
 * par marché, avec sa photo. pdfkit, polices intégrées (Helvetica).
 */
import PDFDocument from "pdfkit";
import { libellesEspeces, INFRASTRUCTURES_MARCHE } from "@/lib/acteurs";
import {
  ACCES, CONTROLES, EFFECTIFS, ETATS, FONCTIONNEMENTS, PORTEES, RYTHMES, TYPES_MARCHE,
  joursEnClair, libelleDe, lieuxEnClair, type FicheMarche,
} from "@/lib/marches";

type Doc = InstanceType<typeof PDFDocument>;
const MARGE = 40;
const FONCE = "#10253F";
const GRIS = "#5B6573";
const TRAIT = "#CFC9BC";

/** Ce que Helvetica sait écrire : les espaces fines du français deviennent des espaces simples. */
const sur = (t: string | null | undefined) => (t ?? "—").replace(/[  ]/g, " ").replace(/[−]/g, "-");

function finir(doc: Doc): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const morceaux: Buffer[] = [];
    doc.on("data", (c: Buffer) => morceaux.push(c));
    doc.on("end", () => resolve(Buffer.concat(morceaux)));
    doc.on("error", reject);
    doc.end();
  });
}

function entete(doc: Doc, intitule: string, titre: string, sousTitre: string) {
  doc.font("Helvetica").fontSize(8.5).fillColor(GRIS).text(sur(intitule), MARGE, MARGE, { width: doc.page.width - 2 * MARGE });
  doc.moveDown(0.3);
  doc.font("Helvetica-Bold").fontSize(15).fillColor(FONCE).text(sur(titre));
  doc.font("Helvetica").fontSize(9.5).fillColor(GRIS).text(sur(sousTitre));
  doc.moveDown(0.6);
}

// ---------------------------------------------------------------------------
// LA LISTE
// ---------------------------------------------------------------------------

export interface LigneListe {
  arrondissement: string;
  speculation: string;
  nom: string;
  localite: string;
  /** Gestionnaire (marché) ou propriétaire et téléphone. */
  responsable: string;
  detail: string;
  gps: string;
  statut: string;
}

export async function listePdf(p: { intitule: string; titre: string; sousTitre: string; lignes: LigneListe[] }): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: MARGE, bufferPages: true });
  entete(doc, p.intitule, p.titre, p.sousTitre);
  const colonnes: [string, number][] = [
    ["N°", 26], ["Arrondissement", 74], ["Type", 80], ["Nom", 120], ["Localité", 80],
    ["Gestionnaire / propriétaire", 110], ["Espèces · jours", 150], ["GPS", 76], ["Statut", 46],
  ];
  const largeur = doc.page.width - 2 * MARGE;
  const total = colonnes.reduce((s, [, w]) => s + w, 0);
  const cols = colonnes.map(([t, w]) => [t, (w / total) * largeur] as const);
  const bas = doc.page.height - MARGE - 14;

  const ligneEntete = () => {
    const y = doc.y;
    doc.rect(MARGE, y - 2, largeur, 16).fill("#F2EFE8");
    let x = MARGE;
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(FONCE);
    for (const [t, w] of cols) {
      doc.text(t, x + 3, y + 2, { width: w - 6, lineBreak: false, ellipsis: true });
      x += w;
    }
    doc.y = y + 17;
  };
  ligneEntete();
  p.lignes.forEach((l, i) => {
    const valeurs = [String(i + 1), l.arrondissement, l.speculation, l.nom, l.localite, l.responsable, l.detail, l.gps, l.statut].map(sur);
    doc.font("Helvetica").fontSize(7.5);
    const haut = Math.max(...valeurs.map((v, k) => doc.heightOfString(v, { width: cols[k][1] - 6 }))) + 6;
    if (doc.y + haut > bas) {
      doc.addPage();
      doc.y = MARGE;
      ligneEntete();
    }
    const y = doc.y;
    let x = MARGE;
    valeurs.forEach((v, k) => {
      doc.font(k === 3 ? "Helvetica-Bold" : "Helvetica").fontSize(7.5).fillColor(FONCE).text(v, x + 3, y + 3, { width: cols[k][1] - 6 });
      x += cols[k][1];
    });
    doc.moveTo(MARGE, y + haut).lineTo(MARGE + largeur, y + haut).lineWidth(0.4).strokeColor(TRAIT).stroke();
    doc.y = y + haut;
  });
  numeroterPages(doc);
  return finir(doc);
}

function numeroterPages(doc: Doc) {
  const plage = doc.bufferedPageRange();
  for (let i = plage.start; i < plage.start + plage.count; i++) {
    doc.switchToPage(i);
    const y = doc.page.height - MARGE + 8;
    const ancienneMarge = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // sous la marge, pdfkit ouvrirait sinon une page de plus
    doc.font("Helvetica").fontSize(7.5).fillColor(GRIS).text(`Page ${i + 1} sur ${plage.count}`, MARGE, y, { width: doc.page.width - 2 * MARGE, align: "right", lineBreak: false });
    doc.page.margins.bottom = ancienneMarge;
  }
}

// ---------------------------------------------------------------------------
// LA FICHE D'UN MARCHÉ
// ---------------------------------------------------------------------------

export interface MarchePourFiche {
  nom: string;
  localite: string;
  arrondissement: string;
  actif: boolean;
  especes: string[];
  observations: string | null;
  latitude: number | null;
  longitude: number | null;
  precisionGPS: number | null;
  dateCollecteGPS: Date | null;
  sourceGPS: string | null;
  fiche: FicheMarche | null;
  photo: { contenu: Uint8Array; typeMime: string; prisLe: Date } | null;
}

const date = (d: Date) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Douala" });

function rubrique(doc: Doc, titre: string) {
  if (doc.y > doc.page.height - MARGE - 60) doc.addPage();
  doc.moveDown(0.5);
  doc.font("Helvetica-Bold").fontSize(10.5).fillColor(FONCE).text(sur(titre), MARGE);
  const y = doc.y + 1;
  doc.moveTo(MARGE, y).lineTo(doc.page.width - MARGE, y).lineWidth(0.6).strokeColor(TRAIT).stroke();
  doc.y = y + 4;
}

function ligne(doc: Doc, libelle: string, valeur: string | null | undefined, largeurTexte?: number) {
  const largeur = largeurTexte ?? doc.page.width - 2 * MARGE;
  const y = doc.y;
  doc.font("Helvetica").fontSize(9).fillColor(GRIS).text(sur(libelle), MARGE, y, { width: 150 });
  const hLib = doc.y - y;
  doc.font("Helvetica").fontSize(9).fillColor(FONCE).text(sur(valeur ?? "—"), MARGE + 155, y, { width: largeur - 155 });
  doc.y = Math.max(doc.y, y + hLib) + 2;
}

function pageFiche(doc: Doc, m: MarchePourFiche, intitule: string, codeDepartement: string | null) {
  const f = m.fiche ?? {};
  entete(doc, intitule, `Fiche du marché : ${m.nom}`, `${m.localite} · arrondissement de ${m.arrondissement} · géré par la commune de ${m.arrondissement}${m.actif ? "" : " · désactivé"}`);

  // La photo, en haut à droite, et l'identité à sa gauche.
  const largeurPhoto = 190;
  const hautPhoto = 140;
  let largeurTexte: number | undefined;
  const yDebut = doc.y;
  if (m.photo) {
    try {
      doc.image(Buffer.from(m.photo.contenu), doc.page.width - MARGE - largeurPhoto, yDebut, { fit: [largeurPhoto, hautPhoto], align: "right" });
      doc.font("Helvetica").fontSize(7).fillColor(GRIS).text(`Photo du ${date(m.photo.prisLe)}`, doc.page.width - MARGE - largeurPhoto, yDebut + hautPhoto + 2, { width: largeurPhoto, align: "right" });
      largeurTexte = doc.page.width - 2 * MARGE - largeurPhoto - 12;
    } catch {
      // une image illisible ne doit pas empêcher la fiche de sortir
    }
    doc.y = yDebut;
  }

  rubrique(doc, "Le marché");
  ligne(doc, "Type", libelleDe(TYPES_MARCHE, f.typeMarche), largeurTexte);
  ligne(doc, "État", libelleDe(FONCTIONNEMENTS, f.fonctionnement), largeurTexte);
  ligne(doc, "Portée", libelleDe(PORTEES, f.portee), largeurTexte);
  ligne(doc, "Se tient", libelleDe(RYTHMES, f.rythme), largeurTexte);
  ligne(doc, "Jours", joursEnClair(f, codeDepartement), largeurTexte);
  if (largeurTexte) doc.y = Math.max(doc.y, yDebut + hautPhoto + 14);

  rubrique(doc, "Espèces vendues (un jour de marché, en moyenne)");
  if (!m.especes.length) ligne(doc, "Espèces", null);
  for (const esp of m.especes) ligne(doc, libellesEspeces([esp]), libelleDe(EFFECTIFS, f.effectifs?.[esp]) ?? "taille non indiquée");

  rubrique(doc, "D'où viennent et où partent les animaux");
  ligne(doc, "Provenance", lieuxEnClair(f.provenances, f.provenancePrincipale, f.provenanceAutre, m.arrondissement));
  ligne(doc, "Destinations", lieuxEnClair(f.destinations, f.destinationPrincipale, f.destinationAutre));

  rubrique(doc, "Équipements et leur état");
  const equipements = Object.entries(f.equipements ?? {});
  if (!equipements.length && !f.equipementAutre) ligne(doc, "Équipements", null);
  for (const eq of INFRASTRUCTURES_MARCHE) {
    const etat = f.equipements?.[eq.code];
    if (etat) ligne(doc, eq.libelle, libelleDe(ETATS, etat));
  }
  if (f.equipementAutre) ligne(doc, f.equipementAutre, libelleDe(ETATS, f.etatEquipementAutre) ?? "état non indiqué");

  rubrique(doc, "Contrôle vétérinaire et accès");
  ligne(doc, "Agent du MINEPIA les jours de marché", libelleDe(CONTROLES, f.controleVeterinaire));
  ligne(doc, "Laissez-passer sanitaires délivrés", f.laissezPasser == null ? null : f.laissezPasser ? "Oui" : "Non");
  ligne(doc, "Accès", libelleDe(ACCES, f.acces));

  rubrique(doc, "Position GPS");
  if (m.latitude != null && m.longitude != null) {
    ligne(doc, "Latitude, longitude", `${m.latitude}, ${m.longitude}`);
    ligne(doc, "Précision", m.precisionGPS != null ? `± ${String(m.precisionGPS).replace(".", ",")} m` : null);
    ligne(doc, "Prise", m.dateCollecteGPS ? `le ${date(m.dateCollecteGPS)}${m.sourceGPS ? `, par ${m.sourceGPS}` : ""}` : null);
  } else {
    ligne(doc, "Position", "pas encore prise (à prendre sur place, avec le téléphone)");
  }

  rubrique(doc, "Observations");
  doc.font("Helvetica").fontSize(9).fillColor(FONCE).text(sur(m.observations ?? "—"), MARGE);
}

export async function fichesPdf(p: { intitule: string; codeDepartement: string | null; marches: MarchePourFiche[] }): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: MARGE, bufferPages: true });
  p.marches.forEach((m, i) => {
    if (i > 0) doc.addPage();
    pageFiche(doc, m, p.intitule, p.codeDepartement);
  });
  if (!p.marches.length) entete(doc, p.intitule, "Fiches des marchés", "Aucun marché ne correspond à ce choix.");
  numeroterPages(doc);
  return finir(doc);
}
