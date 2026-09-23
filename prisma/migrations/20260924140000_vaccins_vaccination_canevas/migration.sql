-- Ajoute au référentiel des VACCINS les vaccins des sept maladies ajoutées
-- par la migration 20260924120000 (PPCB, rouget, variole aviaire, bronchite
-- infectieuse, charbon symptomatique, choléra, parvovirose) : sans eux, une
-- vaccination contre l'une de ces maladies ne pouvait indiquer aucun vaccin
-- juste au tableau 3.2 du mensuel. Ordre du Délégué du 24 septembre 2026.
--
-- Migration et non seed : en production seul `migrer deploy` s'exécute.
-- prisma/seed-lib/referentielsDeBase.ts reçoit les mêmes entrées.
--
-- `ordre` prolonge la numérotation existante (7 vaccins, rangs 0 à 6).
-- ON CONFLICT : rejouable sans risque, et sans effet si ces codes existent déjà.
INSERT INTO "ReferentielItem" ("id", "categorie", "code", "libelle", "ordre", "actif", "createdAt", "enAttenteValidationDD")
VALUES
  ('ref_vac_ppcb_20260924',        'VACCIN', 'VAC_PPCB',                   'Vaccin PPCB',                   7, true, NOW(), false),
  ('ref_vac_rouget_20260924',      'VACCIN', 'VAC_ROUGET',                 'Vaccin rouget',                 8, true, NOW(), false),
  ('ref_vac_variole_av_20260924',  'VACCIN', 'VAC_VARIOLE_AVIAIRE',        'Vaccin variole aviaire',        9, true, NOW(), false),
  ('ref_vac_bronchite_20260924',   'VACCIN', 'VAC_BRONCHITE_INFECTIEUSE',  'Vaccin bronchite infectieuse', 10, true, NOW(), false),
  ('ref_vac_charbon_sy_20260924',  'VACCIN', 'VAC_CHARBON_SYMPTOMATIQUE',  'Vaccin charbon symptomatique', 11, true, NOW(), false),
  ('ref_vac_cholera_20260924',     'VACCIN', 'VAC_CHOLERA',                'Vaccin choléra',               12, true, NOW(), false),
  ('ref_vac_parvovirose_20260924', 'VACCIN', 'VAC_PARVOVIROSE',            'Vaccin parvovirose',           13, true, NOW(), false)
ON CONFLICT ("categorie", "code") DO NOTHING;
