-- ============================================================================
-- Les sept autres départements de l'Ouest, préparés et ÉTEINTS
-- (décisions du Délégué du 14 octobre 2026, arrondissements confirmés par lui).
--
-- Pour chacun : le département, ses arrondissements dans l'ordre confirmé, le
-- compte de son DD et un compte de DA par arrondissement. Tout reste éteint :
--
--   - le département (actif = false) : personne ne s'y connecte avant que
--     l'administrateur du système ne le lance ;
--   - les comptes (actif = false) avec un mot de passe INUTILISABLE ("!",
--     qu'aucun mot de passe ne reproduit) : aucun secret n'est écrit dans le
--     code. Les mots de passe provisoires sont tirés au sort le jour du
--     lancement, par la fiche d'identifiants de l'administration du système.
--
-- Identifiants FIXES, comme pour la Menoua : rejouer la migration ailleurs
-- donne les mêmes. ON CONFLICT : sans effet si une ligne existe déjà.
-- Chaque insertion se déclare dans son département (politiques par ligne).
--
-- Retour arrière (avant tout lancement) :
--   DELETE FROM "User"           WHERE "departementId" IN ('dep_bamboutos','dep_haut_nkam','dep_hauts_plateaux','dep_koung_khi','dep_mifi','dep_nde','dep_noun');
--   DELETE FROM "Arrondissement" WHERE "departementId" IN (… les mêmes …);
--   DELETE FROM "Departement"    WHERE id IN (… les mêmes …);
-- ============================================================================

INSERT INTO "Departement" ("id", "code", "nom", "nomAvecArticle", "regionId", "actif") VALUES
  ('dep_bamboutos',      'BAM', 'Bamboutos',      'des Bamboutos',      'reg_ouest', false),
  ('dep_haut_nkam',      'HNK', 'Haut-Nkam',      'du Haut-Nkam',       'reg_ouest', false),
  ('dep_hauts_plateaux', 'HPL', 'Hauts-Plateaux', 'des Hauts-Plateaux', 'reg_ouest', false),
  ('dep_koung_khi',      'KKH', 'Koung-Khi',      'du Koung-Khi',       'reg_ouest', false),
  ('dep_mifi',           'MIF', 'Mifi',           'de la Mifi',         'reg_ouest', false),
  ('dep_nde',            'NDE', 'Ndé',            'du Ndé',             'reg_ouest', false),
  ('dep_noun',           'NOU', 'Noun',           'du Noun',            'reg_ouest', false)
ON CONFLICT ("id") DO NOTHING;

DO $$
DECLARE
  -- departement | code arrondissement | nom | identifiant du DA
  a text[];
  arrondissements text[][] := ARRAY[
    ['dep_bamboutos', 'BBJ', 'Babadjou', 'da.babadjou'],
    ['dep_bamboutos', 'BTC', 'Batcham', 'da.batcham'],
    ['dep_bamboutos', 'GLM', 'Galim', 'da.galim'],
    ['dep_bamboutos', 'MBD', 'Mbouda', 'da.mbouda'],
    ['dep_haut_nkam', 'BFG', 'Bafang', 'da.bafang'],
    ['dep_haut_nkam', 'BKU', 'Bakou', 'da.bakou'],
    ['dep_haut_nkam', 'BNA', 'Bana', 'da.bana'],
    ['dep_haut_nkam', 'BDJ', 'Bandja', 'da.bandja'],
    ['dep_haut_nkam', 'BNK', 'Banka', 'da.banka'],
    ['dep_haut_nkam', 'BNW', 'Banwa', 'da.banwa'],
    ['dep_haut_nkam', 'KKM', 'Kékem', 'da.kekem'],
    ['dep_hauts_plateaux', 'BHM', 'Baham', 'da.baham'],
    ['dep_hauts_plateaux', 'BMJ', 'Bamendjou', 'da.bamendjou'],
    ['dep_hauts_plateaux', 'BGU', 'Bangou', 'da.bangou'],
    ['dep_hauts_plateaux', 'BTE', 'Batié', 'da.batie'],
    ['dep_koung_khi', 'BDN', 'Bandjoun', 'da.bandjoun'],
    ['dep_koung_khi', 'BYG', 'Bayangam', 'da.bayangam'],
    ['dep_koung_khi', 'DJB', 'Djebem', 'da.djebem'],
    ['dep_mifi', 'BFA', 'Bafoussam I', 'da.bafoussam1'],
    ['dep_mifi', 'BFB', 'Bafoussam II', 'da.bafoussam2'],
    ['dep_mifi', 'BFC', 'Bafoussam III', 'da.bafoussam3'],
    ['dep_nde', 'BGT', 'Bangangté', 'da.bangangte'],
    ['dep_nde', 'BSB', 'Bassamba', 'da.bassamba'],
    ['dep_nde', 'BZU', 'Bazou', 'da.bazou'],
    ['dep_nde', 'TNG', 'Tonga', 'da.tonga'],
    ['dep_noun', 'BGR', 'Bangourain', 'da.bangourain'],
    ['dep_noun', 'FMB', 'Foumban', 'da.foumban'],
    ['dep_noun', 'FBT', 'Foumbot', 'da.foumbot'],
    ['dep_noun', 'KPT', 'Kouoptamo', 'da.kouoptamo'],
    ['dep_noun', 'KTB', 'Koutaba', 'da.koutaba'],
    ['dep_noun', 'MGB', 'Magba', 'da.magba'],
    ['dep_noun', 'MLT', 'Malantouen', 'da.malantouen'],
    ['dep_noun', 'MSG', 'Massangam', 'da.massangam'],
    ['dep_noun', 'NJM', 'Njimom', 'da.njimom']
  ];
  -- departement | identifiant du DD | fonction
  dd text[];
  delegues text[][] := ARRAY[
    ['dep_bamboutos', 'dd.bamboutos', 'Délégué départemental des Bamboutos'],
    ['dep_haut_nkam', 'dd.hautnkam', 'Délégué départemental du Haut-Nkam'],
    ['dep_hauts_plateaux', 'dd.hautsplateaux', 'Délégué départemental des Hauts-Plateaux'],
    ['dep_koung_khi', 'dd.koungkhi', 'Délégué départemental du Koung-Khi'],
    ['dep_mifi', 'dd.mifi', 'Délégué départemental de la Mifi'],
    ['dep_nde', 'dd.nde', 'Délégué départemental du Ndé'],
    ['dep_noun', 'dd.noun', 'Délégué départemental du Noun']
  ];
  rang int;
  precedent text := '';
BEGIN
  FOREACH a SLICE 1 IN ARRAY arrondissements LOOP
    IF a[1] <> precedent THEN
      rang := 0;
      precedent := a[1];
    END IF;
    rang := rang + 1;
    PERFORM set_config('app.departement_id', a[1], true);

    INSERT INTO "Arrondissement" ("id", "code", "nom", "ordre", "departementId")
    VALUES ('arr_' || lower(a[2]), a[2], a[3], rang, a[1])
    ON CONFLICT DO NOTHING;

    INSERT INTO "User" ("id", "nom", "username", "passwordHash", "mustChangePassword", "role", "actif", "arrondissementId", "departementId", "createdAt")
    VALUES (
      'usr_da_' || lower(a[2]),
      'Délégué d''arrondissement ' || CASE WHEN a[3] ~* '^[aeiouyéèêh]' THEN 'd''' ELSE 'de ' END || a[3],
      a[4], '!', true, 'DA', false, 'arr_' || lower(a[2]), a[1], now()
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  FOREACH dd SLICE 1 IN ARRAY delegues LOOP
    PERFORM set_config('app.departement_id', dd[1], true);
    INSERT INTO "User" ("id", "nom", "username", "passwordHash", "mustChangePassword", "role", "actif", "departementId", "createdAt")
    VALUES ('usr_dd_' || substr(dd[1], 5), dd[3], dd[2], '!', true, 'DD', false, dd[1], now())
    ON CONFLICT DO NOTHING;
  END LOOP;

  RAISE NOTICE '7 départements préparés : % arrondissements, % comptes de DA, 7 comptes de DD.', array_length(arrondissements, 1), array_length(arrondissements, 1);
END
$$;
