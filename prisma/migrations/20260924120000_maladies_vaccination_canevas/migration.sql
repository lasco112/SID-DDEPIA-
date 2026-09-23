-- Ajoute au référentiel des MALADIES les sept maladies de la « Situation
-- générale de la vaccination » du canevas régional que la liste déroulante du
-- mensuel ne proposait pas : PPCB, rouget, variole aviaire, bronchite
-- infectieuse, charbon symptomatique, choléra, parvovirose. Jusqu'ici l'agent
-- devait choisir « Autre maladie » et taper le nom. Ordre du Délégué du
-- 24 septembre 2026.
--
-- Passe par une migration et non par le seed : en production seul
-- `migrer deploy` s'exécute à la mise à jour, le seed n'y est jamais rejoué.
-- prisma/seed-lib/referentielsDeBase.ts reçoit les mêmes entrées.
--
-- `ordre` : les sept maladies prennent 13 à 19 et « Autre maladie » passe en
-- 20, pour rester en fin de liste. Les lignes déjà saisies ne changent pas :
-- elles portent le CODE de la maladie, pas son rang.
--
-- ON CONFLICT : rejouable sans risque, et sans effet si ces codes existent déjà.
INSERT INTO "ReferentielItem" ("id", "categorie", "code", "libelle", "ordre", "actif", "createdAt", "enAttenteValidationDD")
VALUES
  ('ref_mal_ppcb_20260924',        'MALADIE', 'MAL_PPCB',                   'Péripneumonie contagieuse bovine (PPCB)', 13, true, NOW(), false),
  ('ref_mal_rouget_20260924',      'MALADIE', 'MAL_ROUGET',                 'Rouget du porc',                          14, true, NOW(), false),
  ('ref_mal_variole_av_20260924',  'MALADIE', 'MAL_VARIOLE_AVIAIRE',        'Variole aviaire',                         15, true, NOW(), false),
  ('ref_mal_bronchite_20260924',   'MALADIE', 'MAL_BRONCHITE_INFECTIEUSE',  'Bronchite infectieuse',                   16, true, NOW(), false),
  ('ref_mal_charbon_sy_20260924',  'MALADIE', 'MAL_CHARBON_SYMPTOMATIQUE',  'Charbon symptomatique',                   17, true, NOW(), false),
  ('ref_mal_cholera_20260924',     'MALADIE', 'MAL_CHOLERA',                'Choléra',                                 18, true, NOW(), false),
  ('ref_mal_parvovirose_20260924', 'MALADIE', 'MAL_PARVOVIROSE',            'Parvovirose',                             19, true, NOW(), false)
ON CONFLICT ("categorie", "code") DO NOTHING;

UPDATE "ReferentielItem" SET "ordre" = 20 WHERE "categorie" = 'MALADIE' AND "code" = 'MAL_AUTRE';
