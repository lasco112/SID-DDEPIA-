-- ============================================================================
-- La PORTEE d'une saisie trimestrielle : le departement, ou un arrondissement.
--
-- Les tableaux sans maille territoriale -- activites du budget-programme,
-- contraintes, ouvrages du BIP, veterinaires, bilan epidemiologique,
-- import-substitution -- existent en une version par arrondissement : chaque
-- DA y decrit SES activites, pour SON rapport (decision du Delegue, etape d).
--
-- Migration ADDITIVE, compatible avec l'ancien code :
--  - la colonne a une valeur par defaut, vide = le departement : toutes les
--    saisies existantes restent la version departementale, rien n'est efface ;
--  - elle n'est pas nullable, pour que l'index unique protege reellement du
--    doublon (deux NULL ne se genent pas dans un index unique PostgreSQL).
-- ============================================================================

ALTER TABLE "SaisieCanevas" ADD COLUMN "portee" TEXT NOT NULL DEFAULT '';

DROP INDEX IF EXISTS "SaisieCanevas_periodeId_numeroTableau_ligne_colonne_key";

CREATE UNIQUE INDEX "SaisieCanevas_periodeId_numeroTableau_ligne_colonne_portee_key"
    ON "SaisieCanevas"("periodeId", "numeroTableau", "ligne", "colonne", "portee");
