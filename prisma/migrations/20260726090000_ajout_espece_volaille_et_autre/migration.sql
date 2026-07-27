-- Ajoute « Volaille » et « Autre espèce » au référentiel des ESPÈCES, utilisé
-- par les listes déroulantes des tableaux 3.2 (vaccinations) et 3.3 (activités
-- cliniques). Demande du DD : on vaccine et on soigne des volailles, et le
-- canevas comporte déjà les maladies aviaires correspondantes (Newcastle,
-- Gumboro, colibacillose), sans qu'aucune espèce ne permette de les rattacher.
--
-- Passe par une migration et non par le seed : sur Railway seul
-- `prisma migrate deploy` s'exécute au démarrage (voir package.json), le seed
-- n'y est jamais rejoué. prisma/seed-lib/referentielsDeBase.ts reçoit les mêmes
-- deux entrées pour que toute nouvelle installation parte du même référentiel.
--
-- AUCUN effet sur le tableau 1.1 : ses colonnes sont figées dans
-- canevasLayout.ts et ne sont pas dérivées de cette liste ; les volailles y
-- sont d'ailleurs recensées séparément, au tableau 1.2.
--
-- `ordre` prolonge la numérotation existante (13 items, indices 0 à 12).
-- ON CONFLICT : rejouable sans risque, et sans effet si le DD a déjà créé
-- ces entrées à la main entre-temps.
INSERT INTO "ReferentielItem" ("id", "categorie", "code", "libelle", "ordre", "actif", "createdAt", "enAttenteValidationDD")
VALUES
  ('ref_esp_volaille_20260726', 'ESPECE', 'ESP_VOLAILLE', 'Volaille',      13, true, NOW(), false),
  ('ref_esp_autre_20260726',    'ESPECE', 'ESP_AUTRE',    'Autre espèce',  14, true, NOW(), false)
ON CONFLICT ("categorie", "code") DO NOTHING;
