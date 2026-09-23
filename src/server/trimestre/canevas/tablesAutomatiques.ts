/**
 * Table des matières, liste des tableaux et liste des graphiques PRÉ-REMPLIES.
 *
 * Ces trois listes sont des champs Word (TOC). Un champ que personne n'a mis à
 * jour s'affiche VIDE : c'est ce que voit le lecteur qui refuse la mise à jour
 * proposée à l'ouverture, qui lit le fichier en mode protégé (tout fichier
 * téléchargé s'ouvre ainsi), sur téléphone, dans WPS ou Google Docs.
 *
 * On écrit donc dans chaque champ son contenu déjà calculé — les titres et
 * les légendes réellement présents dans le document, chacun cliquable vers sa
 * cible. Seuls les numéros de page restent à Word : eux dépendent de la mise
 * en page de la machine qui ouvre le fichier, et un numéro deviné serait faux.
 * Le champ reste marqué « à mettre à jour » : dès que Word l'actualise, il
 * remplace ce contenu par le sien, numéros de page compris.
 */
import PizZip from "pizzip";

interface Entree {
  texte: string;
  niveau: number;
  signet: string;
}

const PARAGRAPHE = /<w:p(?: [^>]*)?>[\s\S]*?<\/w:p>/g;
const TEXTE = /<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g;
/** Taquet droit des numéros de page : largeur utile d'une page A4 à marges d'un pouce. */
const TAQUET = 9000;

export function preremplirTablesAutomatiques(buffer: Buffer): Buffer {
  const zip = new PizZip(buffer);
  let xml = zip.file("word/document.xml")!.asText();

  const entrees: Record<"matieres" | "Tableau" | "Graphique", Entree[]> = { matieres: [], Tableau: [], Graphique: [] };
  let n = 0;

  // 1. Repérer titres et légendes, et poser sur chacun un signet — la cible
  //    du lien de la liste.
  xml = xml.replace(PARAGRAPHE, (p) => {
    const titre = /<w:pStyle w:val="Heading([1-4])"\/>/.exec(p);
    const legende = /SEQ (Tableau|Graphique)\b/.exec(p);
    if (!titre && !legende) return p;
    const texte = Array.from(p.matchAll(TEXTE), (m) => m[1]).join("").trim();
    if (!texte) return p;
    n += 1;
    const signet = `_TocSID${String(n).padStart(4, "0")}`;
    const id = 900000 + n;
    if (titre) entrees.matieres.push({ texte, niveau: Number(titre[1]), signet });
    else entrees[legende![1] as "Tableau" | "Graphique"].push({ texte, niveau: 1, signet });
    const ouverture = /^<w:p(?: [^>]*)?>(?:<w:pPr>[\s\S]*?<\/w:pPr>)?/.exec(p)![0];
    return (
      ouverture +
      `<w:bookmarkStart w:id="${id}" w:name="${signet}"/>` +
      p.slice(ouverture.length, -"</w:p>".length) +
      `<w:bookmarkEnd w:id="${id}"/></w:p>`
    );
  });

  // 2. Écrire le résultat de chaque champ TOC entre son début et sa fin.
  xml = xml.replace(
    /<w:instrText[^>]*>TOC ([^<]*)<\/w:instrText><w:fldChar w:fldCharType="separate"\/><\/w:r><\/w:p>/g,
    (debut, instruction: string) => {
      const liste = /&quot;Tableau&quot;/.test(instruction)
        ? entrees.Tableau
        : /&quot;Graphique&quot;/.test(instruction)
          ? entrees.Graphique
          : entrees.matieres;
      const graphiques = liste === entrees.Graphique;
      if (liste.length === 0) {
        const vide = graphiques ? "Aucun graphique dans ce rapport." : "Aucune entrée.";
        return debut + `<w:p><w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">${vide}</w:t></w:r></w:p>`;
      }
      return debut + liste.map((e) => ligne(e, liste === entrees.matieres)).join("");
    }
  );

  zip.file("word/document.xml", xml);
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}

/** Une ligne de liste : le titre, cliquable, puis le numéro de page (champ PAGEREF). */
function ligne(e: Entree, matieres: boolean): string {
  const gras = matieres && e.niveau === 1 ? "<w:rPr><w:b/></w:rPr>" : "";
  return (
    `<w:p><w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="${TAQUET}"/></w:tabs>` +
    `<w:spacing w:after="60"/><w:ind w:left="${(e.niveau - 1) * 360}"/></w:pPr>` +
    `<w:hyperlink w:anchor="${e.signet}" w:history="1">` +
    `<w:r>${gras}<w:t xml:space="preserve">${e.texte}</w:t></w:r>` +
    `<w:r><w:tab/></w:r>` +
    `<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r>` +
    `<w:r><w:instrText xml:space="preserve"> PAGEREF ${e.signet} \\h </w:instrText></w:r>` +
    `<w:r><w:fldChar w:fldCharType="separate"/></w:r>` +
    `<w:r><w:t></w:t></w:r>` +
    `<w:r><w:fldChar w:fldCharType="end"/></w:r>` +
    `</w:hyperlink></w:p>`
  );
}
