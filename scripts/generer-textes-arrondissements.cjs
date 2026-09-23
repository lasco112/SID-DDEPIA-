/**
 * Génère src/server/trimestre/canevas/textesArrondissements.ts — les textes de
 * référence des six arrondissements (étape d du rapport trimestriel) — à partir :
 *  - des rapports réels des DAEPIA (docs/canevas/rapports-da) : situation et
 *    relief, introduction, missions et vision de Penka-Michel ;
 *  - du modèle sourcé par arrondissement
 *    (docs/MODELES_ARRONDISSEMENTS_PEDOLOGIE_DEMOGRAPHIE.md).
 *
 * Remplace scripts/extraire-textes-arrondissements.mjs, qui ne produisait que
 * l'introduction et la présentation.
 *
 *   node scripts/generer-textes-arrondissements.cjs
 */
const PizZip = require(process.cwd() + "/node_modules/pizzip");
const fs = require("fs");
const DOSSIER = "docs/canevas/rapports-da";
const sans = (t) => t.replace(/XE\s*"[^"]*"/g, " ").replace(/\s+/g, " ").trim();
const texteDe = (f) => sans(f.replace(/<w:tab\/>/g, " ").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&apos;/g, "’").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
function blocsDe(chemin) {
  const xml = new PizZip(fs.readFileSync(chemin)).file("word/document.xml").asText();
  const corps = xml.slice(xml.indexOf("<w:body>"), xml.lastIndexOf("</w:body>"));
  const blocs = []; let i = 0;
  while (i < corps.length) {
    const cands = ["<w:p ", "<w:p>"].map((s) => corps.indexOf(s, i)).filter((x) => x >= 0);
    const dP = cands.length ? Math.min(...cands) : -1;
    const dT = corps.indexOf("<w:tbl>", i);
    if (dT >= 0 && (dP < 0 || dT < dP)) {
      let prof = 0, j = dT;
      while (j < corps.length) { const o = corps.indexOf("<w:tbl>", j), f = corps.indexOf("</w:tbl>", j); if (f < 0) break; if (o >= 0 && o < f) { prof++; j = o + 7; } else { prof--; j = f + 8; if (prof === 0) break; } }
      blocs.push({ type: "tableau" }); i = j;
    } else if (dP >= 0) {
      const fin = corps.indexOf("</w:p>", dP); if (fin < 0) break;
      const frag = corps.slice(dP, fin + 6);
      const style = /<w:pStyle w:val="([^"]+)"/.exec(frag)?.[1] ?? "";
      blocs.push({ type: "paragraphe", texte: texteDe(frag), titre: /^(Titre|Heading)/i.test(style) });
      i = fin + 6;
    } else break;
  }
  return blocs;
}
const RUBRIQUES = {
  relief: /^Situation et Relief/i,
  missions: /^MISSIONS?$/i,
  vision: /^VISION$/i,
  organisation: /^ORGANISATION ADMINISTRATIVE/i,
  introduction: /^INTRODUCTION$/i,
};
const extraitsDesRapports = {};
for (const f of fs.readdirSync(DOSSIER).filter((x) => x.endsWith(".docx"))) {
  const blocs = blocsDe(`${DOSSIER}/${f}`);
  // Le corps commence après la table des matières : on prend la DERNIÈRE occurrence de chaque titre.
  const r = {};
  for (const [cle, re] of Object.entries(RUBRIQUES)) {
    let debut = -1;
    blocs.forEach((b, k) => { if (b.type === "paragraphe" && b.titre && re.test(b.texte)) debut = k; });
    if (debut < 0) {
      // Certains titres ne portent pas de style : on cherche le texte seul.
      blocs.forEach((b, k) => { if (b.type === "paragraphe" && re.test(b.texte) && b.texte.length < 60) debut = k; });
    }
    if (debut < 0) continue;
    const paras = [];
    for (let k = debut + 1; k < blocs.length; k++) {
      const b = blocs[k];
      if (b.type === "tableau") break;
      if (b.titre) break;
      if (b.texte) paras.push(b.texte);
      if (paras.join(" ").length > 6000) break;
    }
    r[cle] = paras;
  }
  extraitsDesRapports[f] = r;
}

const extraits = extraitsDesRapports;
const md = fs.readFileSync("docs/MODELES_ARRONDISSEMENTS_PEDOLOGIE_DEMOGRAPHIE.md", "utf8").replace(/\r\n/g, "\n");

const ARR = ["Dschang", "Fokoué", "Fongo-Tongo", "Nkong-Ni", "Penka-Michel", "Santchou"];
const FICHIER = {
  "Fokoué": /FOKOUE/i, "Fongo-Tongo": /DAEPIA FT/i, "Nkong-Ni": /nkong ni/i,
  "Penka-Michel": /PENKA/i, "Santchou": /santchou/i, "Dschang": /Dschang/i,
};
const extrait = (a) => Object.entries(extraits).find(([f]) => FICHIER[a].test(f))?.[1] ?? {};

// ---------------------------------------------------------------- modèle sourcé
const sansMarkdown = (t) => t
  .replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*\s][^*]*)\*/g, "$1")
  .split("\n").map((l) => l.trim()).filter(Boolean)
  .map((l) => l.replace(/^- /, "– "))
  .join("\n\n");
function section(a) {
  const titres = ["## 1. DSCHANG", "## 2. FOKOUÉ", "## 3. FONGO-TONGO", "## 4. NKONG-NI", "## 5. PENKA-MICHEL", "## 6. SANTCHOU", "## 7."];
  const i = ARR.indexOf(a);
  return md.slice(md.indexOf(titres[i]), md.indexOf(titres[i + 1]));
}
const entre = (t, a, b) => t.slice(t.indexOf(a) + a.length, t.indexOf(b)).trim();
// Notes de travail du modèle, sans place dans un rapport officiel.
const CLIMAT_MENOUA = "Le climat est celui des hautes terres de la Menoua : équatorial camerounien d'altitude, à deux saisons (Tedonkeng Pamo et al., 2005).";
function nettoyerPedologie(t) {
  return t
    .replace(/Le climat est celui des hautes terres de la Menoua, décrit dans le modèle départemental\./g, CLIMAT_MENOUA)
    .replace(/ Le PCD de Santchou devrait en contenir\./g, "")
    .replace(/ L'étude de référence sur ces sols est celle de Gigou et Raunet \(1973\)\./g, "");
}

// ---------------------------------------------------------------- bibliographie
const biblioMd = entre(md, "## 8. Bibliographie", "### Ouvrages et documents recommandés");
const entrees = biblioMd.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
  .map((l) => l.replace(/\*([^*]+)\*/g, "$1"));
function citee(entree, texte, a) {
  if (entree.startsWith("Wikipédia")) return /Wikipédia/.test(texte);
  if (entree.startsWith("BUCREP")) return /BUCREP/.test(texte);
  if (entree.startsWith("République du Cameroun (1995)")) return /République du Cameroun, 1995/.test(texte);
  if (entree.startsWith("Haut-Commissaire")) return /262\/46/.test(texte);
  if (entree.startsWith("DREPIA-Ouest")) return /DREPIA-Ouest/.test(texte);
  if (entree.startsWith("DAEPIA de Santchou")) return a === "Santchou" && /DAEPIA de Santchou/.test(texte);
  if (entree.startsWith("DAEPIA de Fokoué")) return a !== "Santchou" && new RegExp(`DAEPIA de ${a}`).test(texte);
  const auteur = entree.split(",")[0].trim();
  return texte.includes(auteur);
}

// ---------------------------------------------------------------- textes des DA
const MISSIONS_PENKA = extrait("Penka-Michel").missions;
const VISION_PENKA = extrait("Penka-Michel").vision;
// Les missions en liste à tirets : « ; » entre les items, « . » au dernier.
const missions = (a) =>
  MISSIONS_PENKA.map((p, i) => {
    if (i === 0) return p.replace("Penka-Michel", a);
    const item = p.trim().replace(/[.;]$/, "");
    return "– " + item + (i === MISSIONS_PENKA.length - 1 ? "." : " ;");
  }).join("\n\n");
const vision = (a) => VISION_PENKA.map((p, i) => i === 0 ? p.replace("La vision de la DAEPIA Penka-Michel", `La vision de la DAEPIA de ${a}`) : p).join("\n\n");

/** Corrections sûres des textes des DA — fautes de frappe, données de la région. */
function corrigerRelief(a, t) {
  return t
    .replace(/Appondissement/g, "Arrondissement")
    .replace(/HAUT KAM/g, "Haut-Nkam")
    .replace(/arrrondissement/g, "arrondissement")
    .replace(/surperficie/g, "superficie")
    .replace(/caracterisé/g, "caractérisé")
    .replace(/répresentent/g, "représentent")
    .replace(/innondés/g, "inondés")
    .replace(/cameroun/g, "Cameroun")
    // Nkong-Ni : 67 220 est une projection, le recensement est cité plus loin.
    .replace("avec une population de 67220 habitants.", "avec une population estimée à 67 220 habitants (projection à partir du recensement de 2005).")
    // Penka-Michel : ces coordonnées sont celles de la RÉGION (modèle, point 2).
    .replace("et est située dans l’hémisphère nord entre les parallèles 5° et 6°15 et les méridiens de 10° et 15° de Greenwich.", "et se situe par 5°28′ de latitude nord et 10°15′ de longitude est (Wikipédia, « Penka-Michel »).")
    .replace(", soit 0 ,056 % de l’étendue du territoire national", "").replace("270 Km²", "270 km²")
    .replace(/Penka -Michel/g, "Penka-Michel")
    .replace(/Bafoussam III ,/g, "Bafoussam III,")
    .replace(/Batcham ,/g, "Batcham,")
    // Fongo-Tongo : phrase inachevée du rapport.
    .replace("On y trouve collines prépondérantes au sud . Au les montagnes qui servent à l'élevages des gros bétail.", "On y trouve des collines au sud, et au nord des montagnes qui servent à l'élevage du gros bétail.")
    .replace("Située dans la pente sud des monts Bamboutos,la DAEPIA de FONGO-TONGO est limitée :", "Située sur la pente sud des monts Bamboutos, la DAEPIA de Fongo-Tongo est limitée :")
    .replace("Au Nord par le département de la Mezam Région du Nord -Ouest", "– au nord par le département de la Mezam, région du Nord-Ouest ;")
    .replace("Au Sud par L arrondissement de Dschang", "– au sud par l'arrondissement de Dschang ;")
    .replace("A l'Est par l'arrondissement de Nkong -ni", "– à l'est par l'arrondissement de Nkong-Ni ;")
    .replace("A l''Ouest par l'arrondissement de WABANE région du Sud Ouest", "– à l'ouest par l'arrondissement de Wabane, région du Sud-Ouest.")
    .replace("par l’arrondissement de dschang", "par l’arrondissement de Dschang")
    .replace(/^Les massifs montagneux/m, "– les massifs montagneux")
    .replace(/^Les plaines de Bansoa/m, "– les plaines de Bansoa")
    .replace(/^Les hauts plateaux\./m, "– les hauts plateaux ;")
    .replace(/^La plaine des Mbos\./m, "– la plaine des Mbo.");
}

/** Dschang n'a pas de texte de situation : rédigé à partir de son modèle sourcé. */
const RELIEF_DSCHANG =
  "Chef-lieu du département de la Menoua, l'arrondissement de Dschang est situé sur le versant sud-est des monts Bamboutos, vers 1 400 à 1 500 m d'altitude. La commune regroupe les groupements Foto, Foréké-Dschang, Fongo-Ndeng, Fossong-Wentcheng et Fotetsa, sur environ 262 km² (Wikipédia, « Dschang »).\n\n" +
  "Le relief est celui des hautes terres de l'Ouest : la Menoua coule d'abord à la surface du plateau, puis descend brutalement vers la plaine des Mbo (Wikipédia, « Plaine des Mbo »).";

const ORGANISATION = {
  Dschang: null, // repris de son rapport
  "Fokoué": "La DAEPIA de Fokoué relève de la Délégation départementale de la Menoua. Elle compte un Centre zootechnique et vétérinaire, qui couvre les cinq groupements de l'arrondissement : Fokoué, Fomopea, Fotomena, Fontsa-Touala et Bamegwou.",
  "Fongo-Tongo": "La DAEPIA de Fongo-Tongo relève de la Délégation départementale de la Menoua. Elle couvre deux groupements, Fongo-Tongo et Fossong-Ellelem, et compte un Centre zootechnique et vétérinaire, construit en 2021, dans lequel elle est logée.",
  "Nkong-Ni": "La DAEPIA de Nkong-Ni relève de la Délégation départementale de la Menoua. Elle compte deux Centres zootechniques et vétérinaires, à Bafou et à Baleveng, et un poste de contrôle.",
  "Penka-Michel": "La DAEPIA de Penka-Michel relève de la Délégation départementale de la Menoua. Elle couvre les groupements de Bansoa, Bamendou, Baloum et Balessing. Ses structures figurent au tableau des structures administratives ci-dessous.",
  "Santchou": "La DAEPIA de Santchou relève de la Délégation départementale de la Menoua. Ses structures figurent au tableau des structures administratives ci-dessous.",
};
const ORGA_DSCHANG =
  "La Délégation d’Arrondissement de l’Elevage, des Pêches et des Industries Animales de Dschang compte un seul Centre Zootechnique et Vétérinaire : celui de Dschang.\n\n" +
  "Les services locaux ont pour ressort territorial la circonscription administrative dont ils portent le nom. Étant donné la grande étendue de l’arrondissement et le besoin de rendre service à tous, nos services couvrent difficilement le territoire, d’où la nécessité de création de nouvelles structures.";

/** L'introduction : première phrase CALCULÉE, puis le texte propre de la DAEPIA. */
function introduction(a) {
  const premiere = `Le présent rapport {NATURE} d’activités de la DAEPIA de ${a} couvre la période allant de {MOIS_DEBUT} à {MOIS_FIN} {A}.`;
  let propre = (extrait(a).introduction ?? []).join("\n\n");
  propre = propre
    .replace("Ce rapport Trimestriel récapitule l’essentiel des activités menées dans l’Arrondissement de Nkong-Ni au courant des mois de janvier, Fevrier et Mars de l’année 2026.", "Ce rapport récapitule l’essentiel des activités menées dans l’arrondissement de Nkong-Ni au cours de la période sus indiquée.")
    .replace(/ce trimestre/g, "{CETTE_PERIODE}")
    .replace(/spécuations/g, "spéculations")
    .replace(/FOKOUE situé dans la menoua/g, "Fokoué, située dans la Menoua")
    .replace(/FONGO-TONGO/g, "Fongo-Tongo");
  if (!propre) {
    propre = `Ce rapport récapitule l’essentiel des activités conduites dans l’arrondissement de ${a} pour la période sus indiquée. Il présente la DAEPIA, ses ressources et ses moyens, puis les productions animales et halieutiques, et enfin la protection sanitaire des cheptels et des consommateurs.`;
  }
  return premiere + "\n\n" + propre;
}

// ---------------------------------------------------------------- génération
const resultat = {};
for (const a of ARR) {
  const sec = section(a);
  const pedo = nettoyerPedologie(sansMarkdown(entre(sec, "### b) Pédologie, climat, hydrographie et végétation", "### c) Données démographiques")));
  const demo = sansMarkdown(entre(sec, "### c) Données démographiques et économiques", "### Points à vérifier"));
  const relief = a === "Dschang" ? RELIEF_DSCHANG : corrigerRelief(a, (extrait(a).relief ?? []).join("\n"))
    .split("\n").map((l) => l.trim()).filter(Boolean).join("\n\n");
  const cites = [relief, pedo, demo].join("\n");
  // La ligne Wikipédia ne garde que les articles que CE texte cite.
  const articles = Array.from(new Set(Array.from(cites.matchAll(/Wikipédia, « ([^»]+) »/g)).map((m) => m[1].trim())));
  const biblio = entrees
    .filter((e) => citee(e, cites, a))
    .map((e) =>
      e.startsWith("Wikipédia")
        ? `Wikipédia (2026), consultée le 23 septembre 2026 : ${articles.length > 1 ? "articles" : "article"} ${articles.map((t) => `« ${t} »`).join(", ")}. Wikipédia est une source secondaire : les données qui en sont tirées sont signalées et restent à confirmer par les plans communaux de développement ou les services compétents.`
        : e
    )
    .join("\n\n");
  resultat[a] = {
    "I.introduction": introduction(a),
    "I.geo.relief": relief,
    "I.geo.pedologie": pedo,
    "I.geo.demographie": demo,
    "I1.missions": missions(a),
    "I1.vision": vision(a),
    "I1.organisation": a === "Dschang" ? ORGA_DSCHANG : ORGANISATION[a],
    "bibliographie": biblio,
  };
}

// Contrôles : aucune période figée, aucun texte vide.
for (const [a, t] of Object.entries(resultat)) {
  for (const [cle, v] of Object.entries(t)) {
    if (!v || !v.trim()) console.log(`VIDE : ${a} ${cle}`);
    const fige = v.match(/\b(janvier|f[ée]vrier|mars|premier trimestre|1er trimestre|deuxième trimestre)\b/i);
    if (fige && cle !== "bibliographie") console.log(`PÉRIODE FIGÉE ? ${a} ${cle} : « ${fige[0]} »`);
  }
}

const L = [];
L.push("/**");
L.push(" * Textes de référence des six arrondissements, repris d'une période à l'autre.");
L.push(" *");
L.push(" * GÉNÉRÉ par le script de l'étape d) du rapport trimestriel, à partir :");
L.push(" *  - des rapports réels des DAEPIA : situation et relief, introduction (fautes de");
L.push(" *    frappe corrigées ; coordonnées et population alignées sur les sources) ;");
L.push(" *  - des missions et de la vision de la DAEPIA de Penka-Michel, retenues pour les");
L.push(" *    six arrondissements (décision du Délégué, 24 septembre 2026) ;");
L.push(" *  - du modèle sourcé par arrondissement (docs/MODELES_ARRONDISSEMENTS_PEDOLOGIE_");
L.push(" *    DEMOGRAPHIE.md) : pédologie, climat, hydrographie, végétation, démographie,");
L.push(" *    et la bibliographie des sources que chaque texte cite.");
L.push(" *");
L.push(" * Dschang suit le même modèle que les autres DA. Son rapport ne portant pas de");
L.push(" * texte de situation, celui-ci est rédigé à partir de son modèle sourcé.");
L.push(" *");
L.push(" * Chaque DA peut remplacer ces textes, pour une période, depuis « Textes de mon");
L.push(" * rapport » : ils ne sont qu'un point de départ.");
L.push(" */");
L.push("");
L.push("/** Les zones de texte qu'un arrondissement reçoit toutes rédigées. */");
L.push("export type CleTexteArrondissement =");
L.push(Object.keys(resultat.Dschang).map((k) => `  | ${JSON.stringify(k)}`).join("\n") + ";");
L.push("");
L.push("/** nom de l'arrondissement → ses textes de référence */");
L.push("export const TEXTES_ARRONDISSEMENTS = new Map<string, Record<CleTexteArrondissement, string>>([");
for (const [a, t] of Object.entries(resultat)) {
  L.push("  [");
  L.push(`    ${JSON.stringify(a)},`);
  L.push("    {");
  for (const [k, v] of Object.entries(t)) L.push(`      ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
  L.push("    },");
  L.push("  ],");
}
L.push("]);");
L.push("");
fs.writeFileSync("src/server/trimestre/canevas/textesArrondissements.ts", L.join("\n"));
console.log("généré :", Object.keys(resultat).join(", "));
