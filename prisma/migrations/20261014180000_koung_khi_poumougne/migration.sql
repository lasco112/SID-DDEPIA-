-- ============================================================================
-- Koung-Khi : l'arrondissement s'appelle POUMOUGNE (chef-lieu Bandjoun), et
-- non « Bandjoun » (correction du Délégué du 14 octobre 2026). Le département
-- compte donc Poumougne, Bayangam et Djebem.
--
-- Le département n'est pas encore lancé : aucune saisie ne dépend de ces
-- lignes. L'identifiant interne (arr_bdn, usr_da_bdn) est gardé ; le code, le
-- nom et l'identifiant de connexion suivent le vrai nom. Un compte qui se
-- serait déjà connecté ne serait pas renommé.
--
-- Retour arrière : les mêmes UPDATE avec 'BDN', 'Bandjoun', 'da.bandjoun'.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Departement" WHERE id = 'dep_koung_khi') THEN
    RETURN;
  END IF;
  PERFORM set_config('app.departement_id', 'dep_koung_khi', true);

  UPDATE "Arrondissement"
     SET code = 'PMG', nom = 'Poumougne'
   WHERE id = 'arr_bdn' AND "departementId" = 'dep_koung_khi';

  UPDATE "User"
     SET username = 'da.poumougne', nom = 'Délégué d''arrondissement de Poumougne'
   WHERE id = 'usr_da_bdn' AND "departementId" = 'dep_koung_khi' AND "lastLoginAt" IS NULL;
END
$$;
