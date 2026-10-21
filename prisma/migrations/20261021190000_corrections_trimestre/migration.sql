-- ============================================================================
-- Les corrections au trimestre des cases calculées à partir du mensuel
-- (décision du Délégué, 21 octobre 2026) : quand le chiffre réel manque au
-- mensuel — vaccinations, consultations, déparasitages, castrations,
-- circulation, lésions, pisciculture —, le chef de la section l'inscrit sur
-- ordre du DD, avec son motif et sa source. Le mensuel n'est pas modifié.
--
-- Migration ADDITIVE : une table nouvelle. Rien d'existant n'est modifié.
--
-- Retour arrière :
--   DROP TABLE "CorrectionTrimestre";
-- ============================================================================

CREATE TABLE IF NOT EXISTS "CorrectionTrimestre" (
    "departementId" TEXT,
    "id" TEXT NOT NULL,
    "periodeId" TEXT NOT NULL,
    "numeroTableau" INTEGER NOT NULL,
    "ligne" TEXT NOT NULL,
    "colonne" TEXT NOT NULL,
    "valeur" DOUBLE PRECISION NOT NULL,
    "valeurMensuelle" DOUBLE PRECISION,
    "motif" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "auteurId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CorrectionTrimestre_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CorrectionTrimestre_periodeId_idx" ON "CorrectionTrimestre"("periodeId");
CREATE UNIQUE INDEX IF NOT EXISTS "CorrectionTrimestre_periodeId_numeroTableau_ligne_colonne_key"
    ON "CorrectionTrimestre"("periodeId", "numeroTableau", "ligne", "colonne");

ALTER TABLE "CorrectionTrimestre" ADD CONSTRAINT "CorrectionTrimestre_departementId_fkey"
    FOREIGN KEY ("departementId") REFERENCES "Departement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CorrectionTrimestre" ADD CONSTRAINT "CorrectionTrimestre_periodeId_fkey"
    FOREIGN KEY ("periodeId") REFERENCES "PeriodeReporting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Cloisonnement par département, comme toutes les tables métier.
ALTER TABLE "CorrectionTrimestre" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CorrectionTrimestre_departement" ON "CorrectionTrimestre";
CREATE POLICY "CorrectionTrimestre_departement" ON "CorrectionTrimestre"
  USING ("departementId" = current_setting('app.departement_id', true))
  WITH CHECK ("departementId" = current_setting('app.departement_id', true));

DROP TRIGGER IF EXISTS "CorrectionTrimestre_departement_insert" ON "CorrectionTrimestre";
CREATE TRIGGER "CorrectionTrimestre_departement_insert"
  BEFORE INSERT ON "CorrectionTrimestre"
  FOR EACH ROW EXECUTE FUNCTION public.poser_departement();
