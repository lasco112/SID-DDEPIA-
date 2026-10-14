/**
 * Les fiches de remise des identifiants, une page par personne, à imprimer et
 * à remettre en main propre au lancement d'un département (décision du
 * Délégué, 14 octobre 2026).
 *
 * Le mot de passe provisoire n'existe en clair que dans ce document : il n'est
 * ni conservé, ni écrit dans le journal. La personne le remplace à sa première
 * connexion, où elle complète aussi ses informations.
 */
import PDFDocument from "pdfkit";
import { logoMinepia } from "@/server/note/presentation";
import type { Identifiant } from "./systeme";

const MARGE = 50;
const PRIMAIRE = "#397781";
const FONCE = "#2F4147";
const GRIS = "#667A80";

export interface ContexteFiches {
  /** « Bamboutos ». */
  departement: string;
  /** « des Bamboutos ». */
  nomAvecArticle: string;
  /** L'adresse du SID, telle qu'on la tape : « https://sid-menoua.xyz ». */
  adresse: string;
  /** Le département n'est pas encore allumé : la fiche le dit. */
  eteint: boolean;
}

export function rendreFichesIdentifiants(identifiants: Identifiant[], ctx: ContexteFiches): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGE, info: { Title: `SID EPIA-O — Identifiants ${ctx.nomAvecArticle}`, Author: "SID EPIA-O" } });
    const morceaux: Buffer[] = [];
    doc.on("data", (m: Buffer) => morceaux.push(m));
    doc.on("end", () => resolve(Buffer.concat(morceaux)));
    doc.on("error", reject);

    const largeur = doc.page.width - MARGE * 2;
    const logo = logoMinepia();

    identifiants.forEach((id, rang) => {
      if (rang > 0) doc.addPage();
      let y = MARGE;

      // En-tête officiel : français à gauche, logo au centre, anglais à droite.
      const colonne = (largeur - 90) / 2;
      const entete = (lignes: string[], x: number) => {
        let yy = y;
        for (let i = 0; i < lignes.length; i++) {
          const l = lignes[i];
          doc.font(i === 1 ? "Helvetica-Oblique" : "Helvetica-Bold").fontSize(i === 1 ? 7.5 : 8).fillColor(FONCE);
          doc.text(l, x, yy, { width: colonne, align: "center" });
          yy = doc.y + 2;
        }
      };
      entete(["RÉPUBLIQUE DU CAMEROUN", "Paix – Travail – Patrie", "MINISTÈRE DE L'ÉLEVAGE, DES PÊCHES ET DES INDUSTRIES ANIMALES", "DÉLÉGATION RÉGIONALE DE L'OUEST"], MARGE);
      entete(["REPUBLIC OF CAMEROON", "Peace – Work – Fatherland", "MINISTRY OF LIVESTOCK, FISHERIES AND ANIMAL INDUSTRIES", "REGIONAL DELEGATION OF WEST"], MARGE + colonne + 90);
      if (logo) doc.image(logo, MARGE + colonne + 10, y, { width: 70 });
      y += 90;

      // Bandeau du titre.
      doc.rect(MARGE, y, largeur, 54).fill(PRIMAIRE);
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#E9C46A").text("SID EPIA-O", MARGE + 14, y + 9);
      doc.font("Helvetica-Bold").fontSize(16).fillColor("#FFFFFF").text("Fiche de remise des identifiants", MARGE + 14, y + 23, { width: largeur - 28 });
      y += 70;

      // À qui.
      doc.font("Helvetica").fontSize(10).fillColor(GRIS).text("Fonction", MARGE, y);
      doc.font("Helvetica-Bold").fontSize(14).fillColor(FONCE).text(id.fonction, MARGE, y + 13, { width: largeur });
      y = doc.y + 10;
      doc.font("Helvetica").fontSize(10).fillColor(GRIS).text("Nom et prénom du titulaire", MARGE, y);
      doc.moveTo(MARGE, y + 32).lineTo(MARGE + largeur, y + 32).lineWidth(0.6).strokeColor("#B8C4C7").stroke();
      y += 48;

      // L'adresse, l'identifiant et le mot de passe, en grand et en police à chasse fixe.
      const champ = (titre: string, valeur: string) => {
        doc.rect(MARGE, y, largeur, 52).lineWidth(1).strokeColor(PRIMAIRE).stroke();
        doc.font("Helvetica").fontSize(9.5).fillColor(GRIS).text(titre, MARGE + 12, y + 8);
        doc.font("Courier-Bold").fontSize(18).fillColor(FONCE).text(valeur, MARGE + 12, y + 23, { width: largeur - 24 });
        y += 62;
      };
      champ("Adresse du SID (dans le navigateur du téléphone ou de l'ordinateur)", ctx.adresse);
      champ("Identifiant", id.username);
      champ("Mot de passe provisoire (à changer à la première connexion)", id.motDePasse);

      if (ctx.eteint) {
        doc.rect(MARGE, y, largeur, 30).fill("#FBF3E4");
        doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#8A6420").text(
          `Le SID n'est pas encore ouvert dans le département ${ctx.nomAvecArticle} : ces identifiants fonctionneront dès le lancement.`,
          MARGE + 10, y + 9, { width: largeur - 20 }
        );
        y += 40;
      }

      // La marche à suivre.
      doc.font("Helvetica-Bold").fontSize(11).fillColor(PRIMAIRE).text("À la première connexion", MARGE, y);
      y = doc.y + 4;
      const etapes = [
        "Ouvrez l'adresse ci-dessus, puis saisissez l'identifiant et le mot de passe provisoire.",
        "Choisissez votre mot de passe personnel et complétez vos informations (téléphone, WhatsApp).",
        "Sur téléphone, installez l'application : menu du navigateur, puis « Ajouter à l'écran d'accueil ».",
        "Ne communiquez jamais votre mot de passe, même à un collègue : chaque saisie porte le nom de son auteur.",
      ];
      etapes.forEach((e, i) => {
        doc.font("Helvetica-Bold").fontSize(10).fillColor(PRIMAIRE).text(`${i + 1}.`, MARGE, y, { width: 16 });
        doc.font("Helvetica").fontSize(10).fillColor(FONCE).text(e, MARGE + 18, y, { width: largeur - 18 });
        y = doc.y + 4;
      });

      // La remise, signée des deux côtés.
      y = Math.max(y + 18, doc.page.height - MARGE - 90);
      const moitie = (largeur - 20) / 2;
      doc.font("Helvetica").fontSize(9.5).fillColor(GRIS);
      doc.text("Remis le ......../......../............", MARGE, y);
      doc.text("par ...........................................", MARGE, y + 16);
      doc.text("Signature du titulaire", MARGE + moitie + 20, y);
      doc.moveTo(MARGE + moitie + 20, y + 52).lineTo(MARGE + largeur, y + 52).lineWidth(0.6).strokeColor("#B8C4C7").stroke();
      doc.font("Helvetica").fontSize(7.5).fillColor(GRIS).text(
        `SID EPIA-O · Département ${ctx.nomAvecArticle} · fiche ${rang + 1} / ${identifiants.length} · document confidentiel, à remettre en main propre`,
        MARGE, doc.page.height - MARGE - 12, { width: largeur, align: "center" }
      );
    });

    if (identifiants.length === 0) {
      doc.font("Helvetica").fontSize(12).fillColor(FONCE).text("Aucun compte à remettre : tous les comptes de ce département se sont déjà connectés.", MARGE, MARGE);
    }
    doc.end();
  });
}
