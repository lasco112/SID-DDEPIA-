-- CreateTable
CREATE TABLE "DemandeAide" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "tableauCode" TEXT,
    "message" TEXT NOT NULL,
    "traite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemandeAide_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DemandeAide_traite_createdAt_idx" ON "DemandeAide"("traite", "createdAt");

-- AddForeignKey
ALTER TABLE "DemandeAide" ADD CONSTRAINT "DemandeAide_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
