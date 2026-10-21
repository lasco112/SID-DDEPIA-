-- ============================================================================
-- Les collectes ponctuelles (demande du Délégué, 21 octobre 2026) : le DD
-- lance une petite collecte — le recensement des marchés, par exemple — comme
-- activité prioritaire, pour des arrondissements et des rôles, entre deux
-- dates. Les fiches collectées vont au registre des établissements ; la
-- collecte ne fait que les compter.
--
-- Migration ADDITIVE : une table nouvelle. Rien d'existant n'est modifié.
--
-- Retour arrière :
--   DROP TABLE "CollecteCampagne";
-- ============================================================================

CREATE TABLE IF NOT EXISTS "CollecteCampagne" (
    "departementId" TEXT,
    "id" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "consigne" TEXT,
    "typeCode" TEXT NOT NULL,
    "arrondissementIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "debut" TEXT NOT NULL,
    "fin" TEXT NOT NULL,
    "prioritaire" BOOLEAN NOT NULL DEFAULT true,
    "creeParId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clotureeLe" TIMESTAMP(3),

    CONSTRAINT "CollecteCampagne_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CollecteCampagne_fin_idx" ON "CollecteCampagne"("fin");

ALTER TABLE "CollecteCampagne" ADD CONSTRAINT "CollecteCampagne_departementId_fkey"
    FOREIGN KEY ("departementId") REFERENCES "Departement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Cloisonnement par département, comme toutes les tables métier.
ALTER TABLE "CollecteCampagne" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CollecteCampagne_departement" ON "CollecteCampagne";
CREATE POLICY "CollecteCampagne_departement" ON "CollecteCampagne"
  USING ("departementId" = current_setting('app.departement_id', true))
  WITH CHECK ("departementId" = current_setting('app.departement_id', true));

DROP TRIGGER IF EXISTS "CollecteCampagne_departement_insert" ON "CollecteCampagne";
CREATE TRIGGER "CollecteCampagne_departement_insert"
  BEFORE INSERT ON "CollecteCampagne"
  FOR EACH ROW EXECUTE FUNCTION public.poser_departement();
