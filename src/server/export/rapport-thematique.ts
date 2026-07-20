/**
 * rapport-thematique.ts — moteur de collecte pour les "rapports thématiques"
 * (fonction additionnelle du DD, CDC hors périmètre initial) : contrairement
 * au rapport mensuel classique (rapport-docx.ts, jamais modifié par ce
 * fichier — bouton intact à tous les niveaux), ici le DD choisit lui-même
 * les données à extraire (espèce, domaine, arrondissement, période) au lieu
 * de suivre la structure fixe du canevas.
 * ---------------------------------------------------------------------------
 * Contrairement au rapport mensuel (qui somme/consolide), ce moteur restitue
 * les valeurs BRUTES ligne par ligne (une ligne par arrondissement×période
 * pour un tableau MATRICE, par établissement×période pour NOMINATIF, par
 * déclaration pour ÉVÉNEMENT) — l'objectif est une extraction exploitable
 * pour analyse, pas un document de synthèse déjà agrégé.
 */
import { db } from "@/lib/db";
import {
  THEME_ESPECE,
  champCorrespondEspece,
  tableSuitEspece,
  cleRefEvenement,
  refCorrespondEspece,
  suffixeEspeceFiltre,
} from "@/lib/themeMapping";

export interface FiltreThematique {
  especeCodes: string[]; // codes filtre UI (ex. "ESP_PORCIN", "VOLAILLE_TOUTES") — vide = toutes espèces
  domaines: string[]; // numéro de section canevas "1".."5" — vide = tous domaines
  arrondissementCodes: string[]; // codes ARR — vide = tout le département
  periodeIds: string[]; // au moins 1 requis
}

export interface TableauThematique {
  tableCode: string;
  numero: string;
  titre: string;
  colonnes: string[];
  lignes: (string | number)[][];
}

const LIBELLES_DOMAINE: Record<string, string> = {
  "1": "Productions animales et halieutiques",
  "2": "Industries animales et halieutiques",
  "3": "Services vétérinaires",
  "4": "Import / Export / Transit / Circulation de bétail",
  "5": "Commercialisation des animaux",
};

export const DOMAINES = Object.entries(LIBELLES_DOMAINE).map(([code, libelle]) => ({ code, libelle }));

function fmtValeur(v: unknown): string | number {
  if (v == null) return "N/D";
  if (typeof v === "object" && "toNumber" in (v as any)) return Number(v); // Prisma Decimal
  if (typeof v === "number") return v;
  return String(v);
}

export async function collecterDonneesThematiques(filtre: FiltreThematique): Promise<TableauThematique[]> {
  if (filtre.periodeIds.length === 0) throw new Error("Au moins une période est requise.");

  const especeSuffixes = filtre.especeCodes.map(suffixeEspeceFiltre);
  const filtreEspeceActif = especeSuffixes.length > 0;

  const [periodes, arrondissements, templates] = await Promise.all([
    db.periodeReporting.findMany({ where: { id: { in: filtre.periodeIds } }, orderBy: [{ annee: "asc" }, { mois: "asc" }] }),
    db.arrondissement.findMany({
      where: filtre.arrondissementCodes.length ? { code: { in: filtre.arrondissementCodes } } : undefined,
      orderBy: { ordre: "asc" },
    }),
    db.formTemplate.findMany({
      where: { actif: true },
      orderBy: { ordre: "asc" },
      include: { fields: { where: { actif: true }, orderBy: { ordre: "asc" } } },
    }),
  ]);

  const periodeLabel = (id: string) => {
    const p = periodes.find((x) => x.id === id);
    return p ? `${p.mois}/${p.annee}` : id;
  };
  const especeCodesReferentielSet = new Set(filtre.especeCodes);

  const resultats: TableauThematique[] = [];

  for (const t of templates) {
    const domaine = t.numero.split(".")[0];
    if (filtre.domaines.length && !filtre.domaines.includes(domaine)) continue;
    if (filtreEspeceActif && !tableSuitEspece(t.code)) continue;

    if (t.type === "MATRICE") {
      const champsRetenus = t.fields.filter((f) => (filtreEspeceActif ? champCorrespondEspece(t.code, f.code, especeSuffixes) : true));
      if (champsRetenus.length === 0) continue;

      const saisies = await db.saisieMatrice.findMany({
        where: {
          fieldCode: { in: champsRetenus.map((f) => f.code) },
          rapport: { periodeId: { in: filtre.periodeIds }, statut: { in: ["SOUMIS", "CLOTURE"] }, arrondissementId: { in: arrondissements.map((a) => a.id) } },
        },
        include: { rapport: { include: { arrondissement: true } } },
      });

      const cle = (arrId: string, periodeId: string) => `${arrId}::${periodeId}`;
      const parLigne = new Map<string, { arr: string; periode: string; valeurs: Record<string, string | number> }>();
      for (const a of arrondissements) {
        for (const pid of filtre.periodeIds) {
          parLigne.set(cle(a.id, pid), { arr: a.nom, periode: periodeLabel(pid), valeurs: {} });
        }
      }
      for (const s of saisies) {
        const ligne = parLigne.get(cle(s.rapport.arrondissementId, s.rapport.periodeId));
        if (!ligne) continue;
        ligne.valeurs[s.fieldCode] = s.nonRenseigne ? "N/D" : s.valeurTexte != null ? s.valeurTexte : fmtValeur(s.valeur);
      }

      const lignes = Array.from(parLigne.values())
        .filter((l) => Object.keys(l.valeurs).length > 0)
        .map((l) => [l.arr, l.periode, ...champsRetenus.map((f) => l.valeurs[f.code] ?? "N/D")]);
      if (lignes.length === 0) continue;

      resultats.push({
        tableCode: t.code,
        numero: t.numero,
        titre: t.titre,
        colonnes: ["Arrondissement", "Période", ...champsRetenus.map((f) => f.libelle)],
        lignes,
      });
    } else if (t.type === "NOMINATIF") {
      const champsRetenus = t.fields.filter((f) => (filtreEspeceActif ? champCorrespondEspece(t.code, f.code, especeSuffixes) : true));
      if (champsRetenus.length === 0) continue;

      const saisies = await db.saisieNominative.findMany({
        where: {
          templateId: t.id,
          fieldCode: { in: champsRetenus.map((f) => f.code) },
          rapport: { periodeId: { in: filtre.periodeIds }, statut: { in: ["SOUMIS", "CLOTURE"] }, arrondissementId: { in: arrondissements.map((a) => a.id) } },
        },
        include: { etablissement: true, rapport: { include: { arrondissement: true } } },
      });
      if (saisies.length === 0) continue;

      const cle = (etabId: string, periodeId: string) => `${etabId}::${periodeId}`;
      const parLigne = new Map<string, { arr: string; periode: string; nom: string; localite: string; valeurs: Record<string, string | number> }>();
      for (const s of saisies) {
        const k = cle(s.etablissementId, s.rapport.periodeId);
        let l = parLigne.get(k);
        if (!l) {
          l = { arr: s.rapport.arrondissement.nom, periode: periodeLabel(s.rapport.periodeId), nom: s.etablissement.nom, localite: s.etablissement.localite, valeurs: {} };
          parLigne.set(k, l);
        }
        l.valeurs[s.fieldCode] = s.nonRenseigne ? "N/D" : s.valeurTexte != null ? s.valeurTexte : fmtValeur(s.valeur);
      }

      resultats.push({
        tableCode: t.code,
        numero: t.numero,
        titre: t.titre,
        colonnes: ["Arrondissement", "Période", "Établissement", "Localité", ...champsRetenus.map((f) => f.libelle)],
        lignes: Array.from(parLigne.values()).map((l) => [l.arr, l.periode, l.nom, l.localite, ...champsRetenus.map((f) => l.valeurs[f.code] ?? "N/D")]),
      });
    } else if (t.type === "EVENEMENT") {
      const schema = (t.schemaEvenement as { key: string; label: string; ref?: string }[] | null) ?? [];
      if (schema.length === 0) continue;
      const cleEspece = cleRefEvenement(t.code);

      const saisies = await db.saisieEvenement.findMany({
        where: {
          templateId: t.id,
          rapport: { periodeId: { in: filtre.periodeIds }, statut: { in: ["SOUMIS", "CLOTURE"] }, arrondissementId: { in: arrondissements.map((a) => a.id) } },
        },
        include: { rapport: { include: { arrondissement: true } } },
      });

      const refCategories = Array.from(new Set(schema.filter((c) => c.ref).map((c) => c.ref!)));
      const refItems = refCategories.length ? await db.referentielItem.findMany({ where: { categorie: { in: refCategories as any } } }) : [];
      const refLibelle = new Map(refItems.map((r) => [`${r.categorie}:${r.code}`, r.libelle]));

      const lignes: (string | number)[][] = [];
      for (const s of saisies) {
        const p = (s.payload as Record<string, unknown>) ?? {};
        if (filtreEspeceActif && cleEspece) {
          if (!refCorrespondEspece(p[cleEspece], especeSuffixes)) continue;
        } else if (filtreEspeceActif && !cleEspece) {
          continue; // AUCUNE mode déjà exclu par tableSuitEspece, filet de sécurité
        }
        const ligne: (string | number)[] = [s.rapport.arrondissement.nom, periodeLabel(s.rapport.periodeId)];
        for (const c of schema) {
          const raw = p[c.key];
          if (raw == null || raw === "") ligne.push("—");
          else if (c.ref) ligne.push(refLibelle.get(`${c.ref}:${raw}`) ?? String(raw));
          else ligne.push(fmtValeur(raw));
        }
        lignes.push(ligne);
      }
      if (lignes.length === 0) continue;

      resultats.push({
        tableCode: t.code,
        numero: t.numero,
        titre: t.titre,
        colonnes: ["Arrondissement", "Période", ...schema.map((c) => c.label)],
        lignes,
      });
    }
  }

  return resultats;
}

export function libelleDomaine(numero: string): string {
  return LIBELLES_DOMAINE[numero] ?? numero;
}
