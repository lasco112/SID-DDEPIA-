-- Pouvoir de validation hiérarchique du DD (§9) : le DD peut valider une
-- section à la place du chef compétent, mais la validation doit dire qu'elle
-- émane de lui. Migration purement additive : deux colonnes nullable/avec
-- défaut, aucune donnée existante n'est touchée.
ALTER TABLE "ValidationSection" ADD COLUMN "validationDirecteDD" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ValidationSection" ADD COLUMN "motifValidationDD" TEXT;
