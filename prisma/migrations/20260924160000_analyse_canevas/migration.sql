-- ============================================================================
-- Les analyses des tableaux du rapport trimestriel, telles que validees.
--
-- Le texte est CALCULE par le SID a partir des chiffres (aucun modele de
-- langage). Cette table ne garde que l apport humain : la validation, la
-- correction eventuelle, l explication. Decision du Delegue du 24/09/2026 :
-- l agent de saisie valide pour son arrondissement, le chef de section pour
-- son domaine au departement ; le DA et le DD relisent.
--
-- Migration ADDITIVE : une table nouvelle, rien d existant n est modifie.
-- ============================================================================

CREATE TABLE "AnalyseCanevas" (
    "departementId" TEXT,
    "id" TEXT NOT NULL,
    "periodeId" TEXT NOT NULL,
    "numeroTableau" INTEGER NOT NULL,
    "portee" TEXT NOT NULL DEFAULT '',
    "texteCalcule" TEXT NOT NULL,
    "texte" TEXT NOT NULL,
    "explication" TEXT,
    "valideParId" TEXT,
    "valideLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalyseCanevas_pkey" PRIMARY KEY ("id")
);

-- Aucune partie de la cle n est nullable (portee vaut '' pour le departement) :
-- l index unique protege reellement du doublon.
CREATE UNIQUE INDEX "AnalyseCanevas_periodeId_numeroTableau_portee_key"
    ON "AnalyseCanevas"("periodeId", "numeroTableau", "portee");

CREATE INDEX "AnalyseCanevas_periodeId_portee_idx"
    ON "AnalyseCanevas"("periodeId", "portee");

ALTER TABLE "AnalyseCanevas" ADD CONSTRAINT "AnalyseCanevas_departementId_fkey"
    FOREIGN KEY ("departementId") REFERENCES "Departement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AnalyseCanevas" ADD CONSTRAINT "AnalyseCanevas_periodeId_fkey"
    FOREIGN KEY ("periodeId") REFERENCES "PeriodeReporting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AnalyseCanevas" ADD CONSTRAINT "AnalyseCanevas_valideParId_fkey"
    FOREIGN KEY ("valideParId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Table cloisonnee : meme politique et meme declencheur que les autres.
ALTER TABLE "AnalyseCanevas" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "AnalyseCanevas_departement" ON "AnalyseCanevas";
CREATE POLICY "AnalyseCanevas_departement" ON "AnalyseCanevas"
  USING ("departementId" = current_setting('app.departement_id', true))
  WITH CHECK ("departementId" = current_setting('app.departement_id', true));

DROP TRIGGER IF EXISTS "AnalyseCanevas_departement_insert" ON "AnalyseCanevas";
CREATE TRIGGER "AnalyseCanevas_departement_insert"
  BEFORE INSERT ON "AnalyseCanevas"
  FOR EACH ROW EXECUTE FUNCTION public.poser_departement();
