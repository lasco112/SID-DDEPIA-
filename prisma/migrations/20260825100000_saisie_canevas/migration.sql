-- ============================================================================
-- La saisie des tableaux du canevas, cellule par cellule.
--
-- Les treize tableaux du Bureau des Affaires Communes (n° 1 a 13 : personnel,
-- infrastructures, materiel de transport, equipements, budget, recettes) ne
-- sont collectes NULLE PART : la section BAC ne porte aucun formulaire mensuel.
-- Le chef BAC n avait donc rien a saisir, et ces tableaux sortaient vides du
-- rapport trimestriel.
--
-- CE MODELE N ENFREINT PAS « une donnee est saisie une seule fois ». Cet
-- invariant interdit une table trimestrielle PARALLELE qui redemanderait ce que
-- les mois portent deja. Ces donnees-la ne se deduisent d aucun mois : elles n
-- existent nulle part ailleurs, et c est ici leur seule saisie.
--
-- La cellule est reperee par ses COORDONNEES DANS LE CANEVAS -- numero de
-- tableau, libelle de ligne, libelle de colonne. Le canevas decrit deja ces
-- tableaux et sait les rendre ; il devient sa propre grille de saisie, et
-- aucune structure ne peut diverger de lui.
-- ============================================================================

CREATE TABLE "SaisieCanevas" (
    "departementId" TEXT,
    "id" TEXT NOT NULL,
    "periodeId" TEXT NOT NULL,
    "numeroTableau" INTEGER NOT NULL,
    "ligne" TEXT NOT NULL,
    "colonne" TEXT NOT NULL,
    "valeur" DECIMAL(14,3),
    "valeurTexte" TEXT,
    "auteurId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SaisieCanevas_pkey" PRIMARY KEY ("id")
);

-- Les quatre parties de la cle sont obligatoires : aucune n est nullable, cet
-- index unique protege donc reellement du doublon -- contrairement a celui des
-- rubriques narratives, ou un arrondissement nul obligeait a des index partiels.
CREATE UNIQUE INDEX "SaisieCanevas_periodeId_numeroTableau_ligne_colonne_key"
    ON "SaisieCanevas"("periodeId", "numeroTableau", "ligne", "colonne");

CREATE INDEX "SaisieCanevas_periodeId_numeroTableau_idx"
    ON "SaisieCanevas"("periodeId", "numeroTableau");

ALTER TABLE "SaisieCanevas" ADD CONSTRAINT "SaisieCanevas_departementId_fkey"
    FOREIGN KEY ("departementId") REFERENCES "Departement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SaisieCanevas" ADD CONSTRAINT "SaisieCanevas_periodeId_fkey"
    FOREIGN KEY ("periodeId") REFERENCES "PeriodeReporting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SaisieCanevas" ADD CONSTRAINT "SaisieCanevas_auteurId_fkey"
    FOREIGN KEY ("auteurId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Table cloisonnee : elle recoit la meme politique et le meme declencheur que
-- les dix-neuf autres. Sans reglage de session, aucune ligne ne passe, et une
-- insertion sans departement declare est refusee.
ALTER TABLE "SaisieCanevas" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "SaisieCanevas_departement" ON "SaisieCanevas";
CREATE POLICY "SaisieCanevas_departement" ON "SaisieCanevas"
  USING ("departementId" = current_setting('app.departement_id', true))
  WITH CHECK ("departementId" = current_setting('app.departement_id', true));

DROP TRIGGER IF EXISTS "SaisieCanevas_departement_insert" ON "SaisieCanevas";
CREATE TRIGGER "SaisieCanevas_departement_insert"
  BEFORE INSERT ON "SaisieCanevas"
  FOR EACH ROW EXECUTE FUNCTION public.poser_departement();
