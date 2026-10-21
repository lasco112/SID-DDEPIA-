/**
 * Ce qu'on lit et ce qu'on écrit d'un établissement du registre — en un seul
 * endroit, pour les routes, le bootstrap des téléphones et les exports.
 *
 *  - La LECTURE ne prend jamais la photo (table à part) : seulement le fait
 *    qu'il y en a une, et sa date.
 *  - L'ÉCRITURE contrôle les informations structurelles (nettoyerInfos), la
 *    fiche d'un marché (nettoyerFicheMarche) et la qualité de la position :
 *    prise par le téléphone, à 5 m près au plus, avec son auteur et sa date.
 */
import type { Prisma } from "@prisma/client";
import { ESPECES, INFRASTRUCTURES_MARCHE, nettoyerInfos } from "@/lib/acteurs";
import { nettoyerFicheMarche, equipementsPresents, PETITS_RUMINANTS, PLUSIEURS_ESPECES, type FicheMarche } from "@/lib/marches";

export const TYPE_MARCHE = "ETAB_MARCHE";

export const SELECTION_ETABLISSEMENT = {
  id: true,
  typeCode: true,
  nom: true,
  localite: true,
  arrondissementId: true,
  proprietaire: true,
  telephone: true,
  actif: true,
  latitude: true,
  longitude: true,
  precisionGPS: true,
  dateCollecteGPS: true,
  sourceGPS: true,
  especes: true,
  joursMarche: true,
  infrastructures: true,
  observations: true,
  fiche: true,
  photo: { select: { prisLe: true } },
} satisfies Prisma.EtablissementSelect;

export type EtablissementLu = Prisma.EtablissementGetPayload<{ select: typeof SELECTION_ETABLISSEMENT }>;

/** La forme envoyée aux écrans et aux téléphones. */
export function versClient(e: EtablissementLu) {
  const { photo, dateCollecteGPS, fiche, ...reste } = e;
  return {
    ...reste,
    dateCollecteGPS: dateCollecteGPS ? dateCollecteGPS.toISOString() : null,
    fiche: (fiche as FicheMarche | null) ?? null,
    aPhoto: Boolean(photo),
    photoLe: photo ? photo.prisLe.toISOString() : null,
  };
}

/**
 * Les données à écrire, à partir de ce qu'envoie l'écran. `creation` : tous
 * les champs obligatoires sont attendus.
 */
export function preparerEcriture(
  body: Record<string, unknown>,
  contexte: { typeCode: string; codeDepartement: string | null; username: string }
): { erreur: string } | { data: Record<string, unknown> } {
  const infos = nettoyerInfos(body);
  if ("erreur" in infos) return { erreur: infos.erreur };
  const data: Record<string, unknown> = { ...infos.donnees };
  if (infos.donnees.dateCollecteGPS !== undefined) {
    data.dateCollecteGPS = infos.donnees.dateCollecteGPS ? new Date(infos.donnees.dateCollecteGPS) : null;
    // Qui a pris la position : le compte de la session, jamais ce que l'appareil prétend.
    data.sourceGPS = infos.donnees.latitude != null ? contexte.username : null;
  }

  if ("fiche" in body) {
    if (contexte.typeCode !== TYPE_MARCHE) return { erreur: "Seul un marché porte une fiche de marché." };
    const r = nettoyerFicheMarche(body.fiche, ESPECES.map((x) => x.code), INFRASTRUCTURES_MARCHE.map((x) => x.code), contexte.codeDepartement);
    if ("erreur" in r) return { erreur: r.erreur };
    data.fiche = r.fiche as Prisma.InputJsonValue;
    // Les colonnes lues par les anciens écrans et l'export restent cohérentes.
    data.infrastructures = equipementsPresents(r.fiche);
    data.joursMarche = r.fiche.rythme === "SEMAINE" ? [r.fiche.grandMarche, r.fiche.petitMarche].filter((x): x is string => Boolean(x)) : [];
    // Les effectifs ne valent que pour les espèces vendues.
    const especes = (data.especes as string[] | undefined) ?? null;
    if (especes && r.fiche.effectifs) {
      for (const esp of Object.keys(r.fiche.effectifs)) if (!especes.includes(esp)) delete r.fiche.effectifs[esp];
    }
    // L'espèce la plus vendue fait partie des espèces vendues.
    const ep = r.fiche.especePrincipale;
    if (especes && ep && ep !== PLUSIEURS_ESPECES) {
      const ok = ep === PETITS_RUMINANTS ? especes.includes("OVINS") && especes.includes("CAPRINS") : especes.includes(ep);
      if (!ok) r.fiche.especePrincipale = null;
    }
  }
  // Un marché n'a ni propriétaire ni téléphone : c'est la commune qui le gère.
  if (contexte.typeCode === TYPE_MARCHE) {
    if ("proprietaire" in body) data.proprietaire = null;
    if ("telephone" in body) data.telephone = null;
  }
  return { data };
}

/** Le nom de la commune qui gère les marchés d'un arrondissement. */
export const communeDe = (arrondissement: string) => `Commune de ${arrondissement}`;
