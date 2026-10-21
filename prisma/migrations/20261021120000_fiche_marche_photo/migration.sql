-- ============================================================================
-- La fiche d'un marché et la photo d'un établissement (demande du Délégué,
-- 21 octobre 2026).
--
--  - "Etablissement"."fiche" (JSONB, facultatif) : type de marché, jours du
--    calendrier traditionnel, effectifs par espèce, provenances et
--    destinations avec le lieu principal, équipements et leur état, contrôle
--    vétérinaire, accès. Codes : src/lib/marches.ts.
--  - "PhotoEtablissement" : la photo, dans une table À PART pour qu'aucune
--    liste ni aucun téléphone ne la charge sans la demander.
--
-- Migration ADDITIVE : une colonne facultative, une table nouvelle. Aucune
-- donnée existante n'est modifiée ; l'ancien code ignore les deux.
-- La position GPS réutilise les colonnes déjà prévues pour le SIG
-- (precisionGPS, dateCollecteGPS, sourceGPS).
--
-- Retour arrière :
--   DROP TABLE "PhotoEtablissement";
--   ALTER TABLE "Etablissement" DROP COLUMN "fiche";
-- ============================================================================

ALTER TABLE "Etablissement" ADD COLUMN IF NOT EXISTS "fiche" JSONB;

CREATE TABLE IF NOT EXISTS "PhotoEtablissement" (
    "departementId" TEXT,
    "etablissementId" TEXT NOT NULL,
    "contenu" BYTEA NOT NULL,
    "typeMime" TEXT NOT NULL DEFAULT 'image/jpeg',
    "prisLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "auteurId" TEXT,

    CONSTRAINT "PhotoEtablissement_pkey" PRIMARY KEY ("etablissementId")
);

ALTER TABLE "PhotoEtablissement" ADD CONSTRAINT "PhotoEtablissement_departementId_fkey"
    FOREIGN KEY ("departementId") REFERENCES "Departement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PhotoEtablissement" ADD CONSTRAINT "PhotoEtablissement_etablissementId_fkey"
    FOREIGN KEY ("etablissementId") REFERENCES "Etablissement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Cloisonnement par département, comme toutes les tables métier.
ALTER TABLE "PhotoEtablissement" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "PhotoEtablissement_departement" ON "PhotoEtablissement";
CREATE POLICY "PhotoEtablissement_departement" ON "PhotoEtablissement"
  USING ("departementId" = current_setting('app.departement_id', true))
  WITH CHECK ("departementId" = current_setting('app.departement_id', true));

DROP TRIGGER IF EXISTS "PhotoEtablissement_departement_insert" ON "PhotoEtablissement";
CREATE TRIGGER "PhotoEtablissement_departement_insert"
  BEFORE INSERT ON "PhotoEtablissement"
  FOR EACH ROW EXECUTE FUNCTION public.poser_departement();
