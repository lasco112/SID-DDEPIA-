-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'AGENT_SAISIE';

-- AlterTable
ALTER TABLE "SaisieEvenement" ADD COLUMN     "saisiParId" TEXT;

-- AlterTable
ALTER TABLE "SaisieMatrice" ADD COLUMN     "saisiParId" TEXT;

-- AlterTable
ALTER TABLE "SaisieNominative" ADD COLUMN     "saisiParId" TEXT;

-- AddForeignKey
ALTER TABLE "SaisieMatrice" ADD CONSTRAINT "SaisieMatrice_saisiParId_fkey" FOREIGN KEY ("saisiParId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaisieNominative" ADD CONSTRAINT "SaisieNominative_saisiParId_fkey" FOREIGN KEY ("saisiParId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaisieEvenement" ADD CONSTRAINT "SaisieEvenement_saisiParId_fkey" FOREIGN KEY ("saisiParId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
