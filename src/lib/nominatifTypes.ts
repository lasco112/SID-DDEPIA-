/**
 * Association FormTemplate (famille NOMINATIF) → type d'établissement du
 * registre. Doit rester identique à prisma/seed-lib/nominatifEtablissementTypes.ts
 * (dupliqué ici pour éviter un import relatif fragile hors de src/ depuis les
 * routes API Next.js).
 */
export const NOMINATIF_ETABLISSEMENT_TYPE: Record<string, string> = {
  T13: "ETAB_COUVOIR",
  T14: "ETAB_FERME_PONTE",
  T15: "ETAB_FERME_CHAIR",
  T23: "ETAB_PROVENDERIE",
};
