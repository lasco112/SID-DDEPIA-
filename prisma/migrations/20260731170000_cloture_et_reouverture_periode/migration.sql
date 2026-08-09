-- Clôture, gel et réouverture d'une période de rapportage (§13).
-- Migration strictement additive : cinq colonnes nullable, aucune donnée
-- existante n'est touchée et l'ancienne version du code continue de
-- fonctionner contre ce schéma.
ALTER TABLE "PeriodeReporting" ADD COLUMN "clotureeLe" TIMESTAMP(3);
ALTER TABLE "PeriodeReporting" ADD COLUMN "clotureeParId" TEXT;
ALTER TABLE "PeriodeReporting" ADD COLUMN "reouverteLe" TIMESTAMP(3);
ALTER TABLE "PeriodeReporting" ADD COLUMN "reouvertePar" TEXT;
ALTER TABLE "PeriodeReporting" ADD COLUMN "motifReouverture" TEXT;

ALTER TABLE "PeriodeReporting" ADD CONSTRAINT "PeriodeReporting_clotureeParId_fkey"
  FOREIGN KEY ("clotureeParId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
