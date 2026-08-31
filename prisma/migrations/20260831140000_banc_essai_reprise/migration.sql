-- ============================================================================
-- Le banc d'essai devient interruptible.
--
-- Sans conservation de l'avancement, fermer l'onglet au douzieme cas oblige a
-- tout recommencer -- et un essai qu'on doit refaire est un essai qu'on ne fait
-- pas. Le Delegue doit pouvoir juger vingt cas en plusieurs fois.
--
-- ATTENTION : "propositions" porte le nom du modele de chaque lettre. Cette
-- colonne ne doit JAMAIS partir vers le navigateur avant que la lettre soit
-- choisie, sans quoi l'essai cesse d'etre a l'aveugle.
-- ============================================================================

CREATE TABLE "CasBancEssai" (
    "departementId" TEXT,
    "id" TEXT NOT NULL,
    "essaiId" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL,
    "intitule" TEXT NOT NULL,
    "propositions" JSONB NOT NULL,
    "lettreChoisie" TEXT,
    "repondueLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CasBancEssai_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CasBancEssai_essaiId_ordre_key" ON "CasBancEssai"("essaiId", "ordre");
CREATE INDEX "CasBancEssai_essaiId_lettreChoisie_idx" ON "CasBancEssai"("essaiId", "lettreChoisie");

ALTER TABLE "CasBancEssai" ADD CONSTRAINT "CasBancEssai_departementId_fkey"
    FOREIGN KEY ("departementId") REFERENCES "Departement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CasBancEssai" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CasBancEssai_departement" ON "CasBancEssai";
CREATE POLICY "CasBancEssai_departement" ON "CasBancEssai"
  USING ("departementId" = current_setting('app.departement_id', true))
  WITH CHECK ("departementId" = current_setting('app.departement_id', true));

DROP TRIGGER IF EXISTS "CasBancEssai_departement_insert" ON "CasBancEssai";
CREATE TRIGGER "CasBancEssai_departement_insert"
  BEFORE INSERT ON "CasBancEssai"
  FOR EACH ROW EXECUTE FUNCTION public.poser_departement();
