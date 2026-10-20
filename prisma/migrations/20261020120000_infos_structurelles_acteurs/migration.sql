-- ============================================================================
-- Informations structurelles des acteurs du registre (demande du Délégué,
-- 20 octobre 2026) : coordonnées GPS, espèces vendues ou élevées, jours de
-- marché, équipements, observations — d'abord pour les marchés, ouvertes à
-- tous les types d'établissements.
--
-- Migration ADDITIVE : six colonnes facultatives (ou à liste vide par défaut)
-- sur une table existante. Aucune donnée n'est modifiée ; l'ancien code les
-- ignore. Le cloisonnement par département de la table est inchangé.
--
-- Retour arrière :
--   ALTER TABLE "Etablissement" DROP COLUMN "latitude", DROP COLUMN "longitude",
--     DROP COLUMN "especes", DROP COLUMN "joursMarche",
--     DROP COLUMN "infrastructures", DROP COLUMN "observations";
-- ============================================================================

ALTER TABLE "Etablissement"
  ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "especes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "joursMarche" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "infrastructures" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "observations" TEXT;
