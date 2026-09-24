-- Ajoute au référentiel des VACCINS le vaccin de la dermatose nodulaire
-- contagieuse bovine. La maladie figure dans la liste du mensuel depuis
-- l'origine (MAL_DERMATOSE_NODULAIRE, colonne « Maladie nodulaire » de la
-- vaccination au trimestre), mais aucun vaccin ne lui correspondait au
-- tableau 3.2. Demande du Délégué du 24 septembre 2026.
--
-- Migration et non seed : en production seul `migrer deploy` s'exécute.
-- prisma/seed-lib/referentielsDeBase.ts reçoit la même entrée.
--
-- `ordre` prolonge la numérotation (14 vaccins, rangs 0 à 13).
-- ON CONFLICT : rejouable sans risque, et sans effet si le code existe déjà.
INSERT INTO "ReferentielItem" ("id", "categorie", "code", "libelle", "ordre", "actif", "createdAt", "enAttenteValidationDD")
VALUES
  ('ref_vac_dermatose_nod_20260924', 'VACCIN', 'VAC_DERMATOSE_NODULAIRE', 'Vaccin dermatose nodulaire contagieuse', 14, true, NOW(), false)
ON CONFLICT ("categorie", "code") DO NOTHING;
