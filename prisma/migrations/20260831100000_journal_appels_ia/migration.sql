-- ============================================================================
-- Le journal des appels a l'assistance redactionnelle.
--
-- Une seule table, proportionnee (etude § 8). Elle est creee AVANT qu'un modele
-- soit branche : le premier appel doit etre trace, pas le deuxieme.
--
-- Elle conserve les REFERENCES des faits soumis, jamais leurs valeurs :
-- reproductible sans etre redondant.
--
-- Deux durees de conservation, a ne pas confondre :
--   - `sortieBrute` porte de la donnee et s'efface au bout de 30 jours ;
--   - le reste est permanent -- quelques centaines d'octets par appel.
--
-- `modifieParHumain` est la colonne qui dira si l'IA sert a quelque chose. Si le
-- Delegue reecrit neuf textes sur dix, la fonction ne fait pas gagner de temps
-- et doit etre retiree. Sans cette colonne, personne ne le saura jamais.
-- ============================================================================

CREATE TABLE "AppelIA" (
    "departementId" TEXT,
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fonction" TEXT NOT NULL,
    "modele" TEXT NOT NULL,
    "versionModele" TEXT,
    "versionPrompt" TEXT NOT NULL,
    "faitIds" TEXT[],
    "empreinteEntree" TEXT NOT NULL,
    "sortieBrute" TEXT,
    "retenu" BOOLEAN NOT NULL,
    "motifRejet" TEXT,
    "texteValide" TEXT,
    "modifieParHumain" BOOLEAN,
    "exportDocumentId" TEXT,

    CONSTRAINT "AppelIA_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AppelIA_createdAt_idx" ON "AppelIA"("createdAt");
CREATE INDEX "AppelIA_fonction_retenu_idx" ON "AppelIA"("fonction", "retenu");

ALTER TABLE "AppelIA" ADD CONSTRAINT "AppelIA_departementId_fkey"
    FOREIGN KEY ("departementId") REFERENCES "Departement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Table cloisonnee comme les vingt autres : politique, declencheur, inventaire.
ALTER TABLE "AppelIA" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "AppelIA_departement" ON "AppelIA";
CREATE POLICY "AppelIA_departement" ON "AppelIA"
  USING ("departementId" = current_setting('app.departement_id', true))
  WITH CHECK ("departementId" = current_setting('app.departement_id', true));

DROP TRIGGER IF EXISTS "AppelIA_departement_insert" ON "AppelIA";
CREATE TRIGGER "AppelIA_departement_insert"
  BEFORE INSERT ON "AppelIA"
  FOR EACH ROW EXECUTE FUNCTION public.poser_departement();
