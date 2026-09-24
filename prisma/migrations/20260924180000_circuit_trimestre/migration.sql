-- ============================================================================
-- Le circuit de validation du rapport trimestriel.
--
-- Decision du Delegue du 24/09/2026 : l agent de saisie prepare, le DA relit
-- et TRANSMET le rapport de son arrondissement, chaque chef de section VALIDE
-- son domaine du rapport departemental, le DD relit et produit la version
-- definitive. Une ligne par etape franchie.
--
-- Table distincte des tables du circuit mensuel, a dessein : les ecrans et les
-- relances du mensuel les lisent sans distinguer le type de periode.
-- Migration ADDITIVE : rien d existant n est modifie.
-- ============================================================================

CREATE TABLE "CircuitTrimestre" (
    "departementId" TEXT,
    "id" TEXT NOT NULL,
    "periodeId" TEXT NOT NULL,
    "niveau" TEXT NOT NULL,
    "cle" TEXT NOT NULL,
    "statut" TEXT NOT NULL,
    "motif" TEXT,
    "auteurId" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CircuitTrimestre_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CircuitTrimestre_periodeId_niveau_cle_key"
    ON "CircuitTrimestre"("periodeId", "niveau", "cle");

CREATE INDEX "CircuitTrimestre_periodeId_idx" ON "CircuitTrimestre"("periodeId");

ALTER TABLE "CircuitTrimestre" ADD CONSTRAINT "CircuitTrimestre_departementId_fkey"
    FOREIGN KEY ("departementId") REFERENCES "Departement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CircuitTrimestre" ADD CONSTRAINT "CircuitTrimestre_periodeId_fkey"
    FOREIGN KEY ("periodeId") REFERENCES "PeriodeReporting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CircuitTrimestre" ADD CONSTRAINT "CircuitTrimestre_auteurId_fkey"
    FOREIGN KEY ("auteurId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CircuitTrimestre" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CircuitTrimestre_departement" ON "CircuitTrimestre";
CREATE POLICY "CircuitTrimestre_departement" ON "CircuitTrimestre"
  USING ("departementId" = current_setting('app.departement_id', true))
  WITH CHECK ("departementId" = current_setting('app.departement_id', true));

DROP TRIGGER IF EXISTS "CircuitTrimestre_departement_insert" ON "CircuitTrimestre";
CREATE TRIGGER "CircuitTrimestre_departement_insert"
  BEFORE INSERT ON "CircuitTrimestre"
  FOR EACH ROW EXECUTE FUNCTION public.poser_departement();
