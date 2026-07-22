-- CreateTable
CREATE TABLE "ConfigSysteme" (
    "cle" TEXT NOT NULL,
    "valeur" TEXT NOT NULL,
    "modifieParId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfigSysteme_pkey" PRIMARY KEY ("cle")
);

-- AddForeignKey
ALTER TABLE "ConfigSysteme" ADD CONSTRAINT "ConfigSysteme_modifieParId_fkey" FOREIGN KEY ("modifieParId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
