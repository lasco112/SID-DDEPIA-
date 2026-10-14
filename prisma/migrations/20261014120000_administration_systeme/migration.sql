-- ============================================================================
-- Administration du système et activation des départements
-- (décisions du Délégué du 14 octobre 2026).
--
-- Le SID s'ouvre aux autres départements de l'Ouest. Deux marques :
--
--   "Departement"."actif" — un département préparé reste éteint jusqu'à son
--   lancement : ses comptes ne se connectent pas, aucune relance ne part.
--   La Menoua, en service, reste allumée (valeur par défaut).
--
--   "User"."adminSysteme" — le compte qui administre le système : lui seul
--   active un département, purge des données d'essai, valide une nouvelle
--   espèce. Le Délégué de la Menoua l'a demandé pour lui seul.
--
-- Retour arrière :
--   ALTER TABLE "User" DROP COLUMN "adminSysteme";
--   ALTER TABLE "Departement" DROP COLUMN "actif";
-- ============================================================================

ALTER TABLE "Departement" ADD COLUMN IF NOT EXISTS "actif" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "adminSysteme" BOOLEAN NOT NULL DEFAULT false;

-- Le compte du Délégué de la Menoua. "User" est cloisonné : on se déclare dans
-- la Menoua le temps de la mise à jour (réglage local à ce bloc).
DO $$
DECLARE
  n int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Departement" WHERE id = 'dep_menoua') THEN
    RETURN; -- base sans la Menoua (base neuve, démonstration vierge) : rien à marquer
  END IF;

  PERFORM set_config('app.departement_id', 'dep_menoua', true);

  UPDATE "User" SET "adminSysteme" = true
   WHERE username = 'dd.menoua' AND role = 'DD' AND "departementId" = 'dep_menoua';
  GET DIAGNOSTICS n = ROW_COUNT;

  -- Identifiant différent sur cette base : le seul DD actif de la Menoua.
  IF n = 0 THEN
    UPDATE "User" SET "adminSysteme" = true
     WHERE role = 'DD' AND actif AND "departementId" = 'dep_menoua'
       AND (SELECT count(*) FROM "User" WHERE role = 'DD' AND actif AND "departementId" = 'dep_menoua') = 1;
    GET DIAGNOSTICS n = ROW_COUNT;
  END IF;

  RAISE NOTICE 'Administrateur du système : % compte(s) marqué(s).', n;
END
$$;
