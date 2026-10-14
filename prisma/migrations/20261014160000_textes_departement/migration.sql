-- ============================================================================
-- Les textes permanents du rapport trimestriel, par département
-- (décision du Délégué du 14 octobre 2026 : « ouvre une option chez les DD pour
-- ajouter les éléments textuels de leur département qui entreront dans le
-- rapport », et un accès pour l'administrateur du système).
--
-- Une ligne par zone de texte, pour le département (portee = '') ou pour l'un
-- de ses arrondissements (portee = son identifiant). Migration ADDITIVE : rien
-- d'existant n'est modifié ; pour la Menoua, les textes de référence restent
-- dans le code et servent tant que rien n'est écrit ici.
--
-- Retour arrière : DROP TABLE "TexteDepartement";
-- ============================================================================

CREATE TABLE "TexteDepartement" (
    "departementId" TEXT,
    "id" TEXT NOT NULL,
    "portee" TEXT NOT NULL DEFAULT '',
    "cle" TEXT NOT NULL,
    "texte" TEXT NOT NULL,
    "modifieParId" TEXT,
    "modifieLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TexteDepartement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TexteDepartement_departementId_portee_cle_key"
    ON "TexteDepartement"("departementId", "portee", "cle");

ALTER TABLE "TexteDepartement" ADD CONSTRAINT "TexteDepartement_departementId_fkey"
    FOREIGN KEY ("departementId") REFERENCES "Departement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TexteDepartement" ADD CONSTRAINT "TexteDepartement_modifieParId_fkey"
    FOREIGN KEY ("modifieParId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TexteDepartement" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "TexteDepartement_departement" ON "TexteDepartement";
CREATE POLICY "TexteDepartement_departement" ON "TexteDepartement"
  USING ("departementId" = current_setting('app.departement_id', true))
  WITH CHECK ("departementId" = current_setting('app.departement_id', true));

DROP TRIGGER IF EXISTS "TexteDepartement_departement_insert" ON "TexteDepartement";
CREATE TRIGGER "TexteDepartement_departement_insert"
  BEFORE INSERT ON "TexteDepartement"
  FOR EACH ROW EXECUTE FUNCTION public.poser_departement();
