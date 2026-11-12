/**
 * LECTURE D'UN RÉPERTOIRE DES ACTEURS EPIA au format Word (canevas de la
 * Délégation régionale de l'Ouest), demande du Délégué du 12 novembre 2026 :
 * « à partir de ce fichier complète la liste des établissements ».
 *
 * Le fichier n'est qu'une suite de titres de filière (« PORCICULTEURS »,
 * « BOVICULTEURS »…) suivis d'un tableau : une ligne d'en-tête (N°, Nom et
 * prénoms du promoteur, Contacts…), ses sous-colonnes (M / F, X / Y, Nbre /
 * Superficie…), puis des lignes « Village … » et les acteurs.
 *
 * On ne devine rien : une colonne est reconnue par son intitulé, une filière
 * par son titre ; ce qui ne se reconnaît pas est laissé de côté et signalé.
 * Les coordonnées X / Y du papier ne sont PAS reprises : la position se prend
 * par le téléphone, sur place (décision du 21 octobre 2026).
 *
 * Fonction pure (aucune base) : testée seule, puis appariée au registre par
 * importRepertoire.ts.
 */
import PizZip from "pizzip";
import { champsRepertoire, nettoyerFicheRepertoire, type FicheRepertoire } from "@/lib/repertoire";

export interface LigneRepertoire {
  typeCode: string;
  nom: string;
  proprietaire: string | null;
  telephone: string | null;
  /** Le village tel qu'écrit dans le fichier (« Lepoung »), ou null. */
  village: string | null;
  especes: string[];
  fiche: FicheRepertoire | null;
}

export interface LectureRepertoire {
  lignes: LigneRepertoire[];
  /** Les titres de filière trouvés, et combien d'acteurs chacun. */
  filieres: { titre: string; typeCode: string | null; acteurs: number }[];
}

/** MAJUSCULES, sans accents, espaces simples : pour comparer des intitulés. */
export const normaliser = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "'").toUpperCase().replace(/\s+/g, " ").trim();

/** Le titre d'une filière → le type d'acteur du registre. */
export function typeDeFiliere(titre: string): string | null {
  const t = normaliser(titre);
  if (t.length > 140 || t.startsWith("REPERTOIRE DES ACTEURS DU SOUS-SECTEUR")) return null;
  if (/PORCICULT/.test(t)) return "ETAB_PORCHERIE";
  if (/POULETS? DE CHAIR/.test(t)) return "ETAB_FERME_CHAIR";
  if (/PONDEUSE/.test(t)) return "ETAB_FERME_PONTE";
  if (/POULETS? LOCA/.test(t)) return "ETAB_POULET_LOCAL";
  if (/PETITS? RUMINANTS?/.test(t)) return "ETAB_PETITS_RUMINANTS";
  if (/BOVICULT/.test(t)) return "ETAB_BOVINS";
  if (/NON CONVENTIONN/.test(t)) return "ETAB_NON_CONVENTIONNEL";
  if (/APICULT/.test(t)) return "ETAB_APICULTEUR";
  if (/BOUCHER|CHARCUT/.test(t)) return "ETAB_BOUCHER";
  if (/PROVENDIER|PROVENDERIE/.test(t)) return "ETAB_PROVENDERIE";
  if (/ORGANISATIONS? PROFESSIONN/.test(t)) return "ETAB_OP";
  if (/AQUACULT|PISCICULT/.test(t)) return "ETAB_ETANG";
  if (/PECHEURS?\b/.test(t)) return "ETAB_PECHEUR";
  if (/COUVOIR/.test(t)) return "ETAB_COUVOIR";
  return null;
}

/**
 * L'intitulé d'une colonne (en-tête + sous-colonne) → le champ du registre.
 * `nom`, `proprietaire`, `telephone` sont les colonnes du registre ; le reste
 * est un code de la fiche du répertoire (src/lib/repertoire.ts).
 */
export function champDeColonne(intitule: string, typeCode: string): string | null {
  const t = normaliser(intitule);
  if (!t || /^N ?°|^N[O°]?$/.test(t) || /COORDONNEES/.test(t)) return null;
  if (/NOM DE LA STRUCTURE|NOM DE L'OP|NOM DE L OP/.test(t)) return "nom";
  if (/NOMS? DU RESPONSABLE/.test(t)) return "proprietaire";
  if (/^NOM DU PROMOTEUR/.test(t)) return "proprietaire";
  if (/NOMS? ET PRENOMS/.test(t)) return "nom";
  if (/CONTACT/.test(t) && typeCode === "ETAB_OP" && / [MF]$/.test(t)) return t.endsWith(" M") ? "membresM" : "membresF";
  if (/CONTACT/.test(t)) return "telephone";
  if (/PERMIS/.test(t)) return "permis";
  if (/APPARTENANCE|ASSOCIATION/.test(t)) return "association";
  if (/HOMOLOGU/.test(t)) return "homologuee";
  if (/SEXE/.test(t)) return "sexe";
  if (/EXPERIENCE/.test(t)) return "experience";
  if (/MODE DE PECHE/.test(t)) return "modePeche";
  if (/TYPE DE PROVENDE/.test(t)) return "typeProvende";
  if (/TYPE DE L'OP|TYPE DE L OP/.test(t)) return "typeOP";
  if (/TYPE ?\/ ?MODE|MODE D'ELEVAGE/.test(t)) return "mode";
  if (/EFFECTIFS? M$/.test(t)) return "effectifM";
  if (/EFFECTIFS? F$/.test(t)) return "effectifF";
  if (/RACES|SOUCHES/.test(t)) return "races";
  if (/PROVENANCE DES MATIERES/.test(t)) return "provenanceMatieres";
  if (/PROVENANCE DES GENITEURS|ALEVINS/.test(t)) return "provenanceAlevins";
  if (/PROVENANCE/.test(t)) return "provenance";
  if (/RUCHES/.test(t)) return "ruches";
  if (/CAGE/.test(t)) return "cages";
  if (/ETANGS?.*(NBRE|NOMBRE)/.test(t)) return "etangsNombre";
  if (/ETANGS?.*SUPERFICIE/.test(t)) return "etangsSuperficie";
  if (/BACS?.*(NBRE|NOMBRE)/.test(t)) return "bacsNombre";
  if (/BACS?.*VOLUME/.test(t)) return "bacsVolume";
  if (/CAPACITE/.test(t)) return "capacite";
  if (/QUANTITES? PRODUITES?|^PRODUCTION/.test(t)) return "production";
  if (/QUANTITE/.test(t)) return typeCode === "ETAB_PECHEUR" ? "quantites" : typeCode === "ETAB_ETANG" ? "production" : "quantite";
  if (/ESPECES? CAPTUR/.test(t)) return "especesCapturees";
  if (/ESPECES?/.test(t)) return "especesPoissons";
  if (/LIEU DE PECHE/.test(t)) return "lieuPeche";
  if (/DATE DE CREATION/.test(t)) return "dateCreation";
  if (/NUMERO D/.test(t)) return "numeroEnregistrement";
  if (/ACTIVITE/.test(t)) return "activite";
  if (/QUALITE/.test(t)) return "qualite";
  if (/CNI/.test(t)) return "cni";
  return null;
}

// --- Lecture du XML Word -----------------------------------------------------

const decoder = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&apos;/g, "'").replace(/&quot;/g, '"');

const texteDe = (frag: string) =>
  decoder(
    (frag.match(/<w:t[^>]*>[^<]*<\/w:t>|<w:tab\/>|<w:br\/>/g) || [])
      .map((t) => (t.startsWith("<w:tab") || t.startsWith("<w:br") ? " " : t.replace(/<[^>]+>/g, "")))
      .join("")
  )
    .replace(/\s+/g, " ")
    .trim();

/** Fin de l'élément ouvert à `debut` (balises imbriquées du même nom comprises). */
function finElement(xml: string, debut: number, nom: string): number {
  const re = new RegExp(`<${nom}[ >]|</${nom}>`, "g");
  re.lastIndex = debut;
  let profondeur = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    profondeur += m[0].startsWith("</") ? -1 : 1;
    if (profondeur === 0) return m.index + m[0].length;
  }
  return xml.length;
}

/** Les enfants directs `<nom>` d'un fragment. */
function enfants(xml: string, nom: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${nom}[ >]`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const fin = finElement(xml, m.index, nom);
    out.push(xml.slice(m.index, fin));
    re.lastIndex = fin;
  }
  return out;
}

/** Une ligne de tableau, étalée sur la grille (une cellule fusionnée sur 2 colonnes compte 2 fois). */
function cellulesDe(tr: string): string[] {
  const out: string[] = [];
  for (const tc of enfants(tr, "w:tc")) {
    const span = Number(/<w:gridSpan w:val="(\d+)"/.exec(tc)?.[1] ?? "1");
    const t = texteDe(tc);
    for (let i = 0; i < span; i++) out.push(t);
  }
  return out;
}

type Bloc = { genre: "texte"; texte: string } | { genre: "tableau"; lignes: string[][] };

function blocsDuDocument(xml: string): Bloc[] {
  const corps = xml.slice(xml.indexOf("<w:body>"));
  const blocs: Bloc[] = [];
  let i = 0;
  while (i < corps.length) {
    const p = corps.indexOf("<w:p", i);
    const t = corps.indexOf("<w:tbl>", i);
    if (t !== -1 && (p === -1 || t < p)) {
      const fin = finElement(corps, t, "w:tbl");
      blocs.push({ genre: "tableau", lignes: enfants(corps.slice(t, fin), "w:tr").map(cellulesDe) });
      i = fin;
    } else if (p !== -1) {
      // <w:p> ou <w:pPr>… : on ne prend que les paragraphes.
      if (!/^<w:p[ >]/.test(corps.slice(p, p + 5))) {
        i = p + 4;
        continue;
      }
      const fin = finElement(corps, p, "w:p");
      const s = texteDe(corps.slice(p, fin));
      if (s) blocs.push({ genre: "texte", texte: s });
      i = fin;
    } else break;
  }
  return blocs;
}

// --- Valeurs -------------------------------------------------------------------

const SOUS_EN_TETE = /^(M|F|X|Y|NBRE|NOMBRE|SUPERFICIE.*|VOLUME.*)$/;

const telephoneDe = (s: string) => {
  const chiffres = s.replace(/[^\d+ ]/g, "").replace(/\s+/g, " ").trim();
  return chiffres.replace(/\D/g, "").length >= 6 ? chiffres : null;
};

const nombreDe = (s: string) => {
  const m = /\d[\d\s  ]*([.,]\d+)?/.exec(s);
  return m ? m[0].replace(/[\s  ]/g, "").replace(",", ".") : "";
};

function valeurPourChamp(code: string, brut: string, typeCode: string): string {
  const champ = champsRepertoire(typeCode).find((c) => c.code === code);
  if (!champ) return "";
  const s = brut.replace(/\s+/g, " ").trim();
  if (!s || /^[-/….]+$/.test(s)) return "";
  if (champ.genre === "ouiNon") return /^oui/i.test(s) ? "OUI" : /^non/i.test(s) ? "NON" : "";
  if (champ.genre === "sexe") return /^m/i.test(s) ? "M" : /^f/i.test(s) ? "F" : "";
  if (champ.genre === "nombre") return nombreDe(s);
  if (champ.genre === "choix" && code === "mode") {
    const n = normaliser(s);
    return /SEMI/.test(n) ? "Semi-intensif" : /NTENSIF/.test(n) ? "Intensif" : /EXTENSIF/.test(n) ? "Extensif" : "";
  }
  if (champ.genre === "choix") return champ.options?.find((o) => normaliser(o) === normaliser(s)) ?? "";
  return s;
}

/** Un nom de structure (GIC, ferme, coopérative…) n'est pas le nom du promoteur. « S.M » (Sa Majesté) est une personne. */
const estStructure = (nom: string) => /^(GIC|FERME|COOP|ETS\b|STE\b|SOCIETE|ASSOCIATION|GROUPE|UNION|FEDERATION)/i.test(nom.trim());

/** Le village d'une ligne « Village Lepoung », « VILLAGE ; FONTSA TOUALA », « Village… ». */
function villageDe(texte: string): string | null | undefined {
  const m = /^village\b\s*[;:…\.\-]*\s*(.*)$/i.exec(texte.trim());
  if (!m) return undefined;
  const nom = m[1].replace(/[…\.]+/g, " ").replace(/\s+/g, " ").trim();
  return nom ? nom : null;
}

/** Lit le fichier Word : les acteurs trouvés, filière par filière. */
export function lireRepertoire(contenu: Buffer | Uint8Array | ArrayBuffer): LectureRepertoire {
  const zip = new PizZip(contenu as ArrayBuffer);
  const doc = zip.file("word/document.xml");
  if (!doc) throw new Error("Ce fichier n'est pas un document Word (.docx).");
  const blocs = blocsDuDocument(doc.asText());

  const lignes: LigneRepertoire[] = [];
  const filieres: LectureRepertoire["filieres"] = [];
  let type: string | null = null;
  let village: string | null = null;

  /** Un titre de filière ; « PORCICULTEURS » puis « PORCICULTEURS DE L'ARRONDISSEMENT… » n'en font qu'une. */
  const titre = (texte: string) => {
    const t = typeDeFiliere(texte);
    if (!t) return false;
    if (filieres[filieres.length - 1]?.typeCode !== t) filieres.push({ titre: texte, typeCode: t, acteurs: 0 });
    type = t;
    village = null;
    return true;
  };

  for (const b of blocs) {
    if (b.genre === "texte") {
      if (!titre(b.texte)) {
        const v = villageDe(b.texte);
        if (v !== undefined) village = v;
      }
      continue;
    }
    // Un tableau : son en-tête commence par « N° ».
    const iEntete = b.lignes.findIndex((l) => /^N ?°|^NO?$/.test(normaliser(l[0] ?? "")) && l.filter(Boolean).length >= 3);
    if (iEntete === -1) {
      // Tableau de présentation (en-tête officiel) : on y cherche seulement les titres.
      for (const l of b.lignes) {
        const non = Array.from(new Set(l.filter(Boolean)));
        if (non.length === 1) titre(non[0]);
      }
      continue;
    }
    for (const l of b.lignes.slice(0, iEntete)) {
      const non = Array.from(new Set(l.filter(Boolean)));
      if (non.length === 1) titre(non[0]);
    }
    if (!type) continue;
    const typeTableau: string = type;
    const largeur = Math.max(...b.lignes.map((l) => l.length));
    const intitules = Array.from({ length: largeur }, (_, k) => b.lignes[iEntete][k] ?? "");
    let k = iEntete + 1;
    for (; k < b.lignes.length; k++) {
      const l = b.lignes[k];
      const non = l.map((c) => normaliser(c)).filter(Boolean);
      if (normaliser(l[0] ?? "") || !non.length || !non.every((c) => SOUS_EN_TETE.test(c))) break;
      l.forEach((c, j) => {
        if (normaliser(c) && j < largeur) intitules[j] = `${intitules[j]} ${c}`.trim();
      });
    }
    const champs = intitules.map((i) => champDeColonne(i, typeTableau));
    const codesFiche = new Set(champsRepertoire(typeTableau).map((c) => c.code));
    let especeSousSection: string | null = null;

    for (; k < b.lignes.length; k++) {
      const l = b.lignes[k];
      const non = Array.from(new Set(l.map((c) => c.trim()).filter(Boolean)));
      if (!non.length) continue;
      if (non.length === 1) {
        const v = villageDe(non[0]);
        if (v !== undefined) {
          village = v;
          continue;
        }
        const n = normaliser(non[0]);
        if (n === "OVINS" || n === "CAPRINS") {
          especeSousSection = n;
          continue;
        }
      }
      const valeurs: Record<string, string> = {};
      champs.forEach((c, j) => {
        if (c && l[j] != null && !(c in valeurs && valeurs[c])) valeurs[c] = l[j];
      });
      const nom = (valeurs.nom ?? "").replace(/\s+/g, " ").trim();
      if (!nom || /^[-/….]+$/.test(nom)) continue;
      const brut: Record<string, string> = {};
      for (const [c, v] of Object.entries(valeurs)) {
        if (codesFiche.has(c)) {
          const x = valeurPourChamp(c, v, typeTableau);
          if (x) brut[c] = x;
        }
      }
      const fiche = nettoyerFicheRepertoire(typeTableau, brut);
      const proprietaireColonne = (valeurs.proprietaire ?? "").trim();
      lignes.push({
        typeCode: typeTableau,
        nom,
        proprietaire: proprietaireColonne || (estStructure(nom) ? null : nom),
        telephone: telephoneDe(valeurs.telephone ?? ""),
        village,
        especes:
          typeTableau === "ETAB_PETITS_RUMINANTS" && especeSousSection
            ? [especeSousSection]
            : typeTableau === "ETAB_ETANG"
              ? ["POISSONS"]
              : [],
        fiche: "fiche" in fiche ? fiche.fiche : null,
      });
      const derniere = filieres[filieres.length - 1];
      if (derniere) derniere.acteurs++;
    }
  }
  return { lignes, filieres };
}
