-- AlterTable
ALTER TABLE "ReferentielItem" ADD COLUMN     "enAttenteValidationDD" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "proposeParId" TEXT,
ADD COLUMN     "valideLe" TIMESTAMP(3),
ADD COLUMN     "valideParDDId" TEXT;

-- AddForeignKey
ALTER TABLE "ReferentielItem" ADD CONSTRAINT "ReferentielItem_proposeParId_fkey" FOREIGN KEY ("proposeParId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferentielItem" ADD CONSTRAINT "ReferentielItem_valideParDDId_fkey" FOREIGN KEY ("valideParDDId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
