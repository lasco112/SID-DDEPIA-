-- Notifications d'événement, notifications système (Web Push) et signal de
-- fin de saisie d'un agent. Migration strictement additive : colonnes
-- nullable et une nouvelle table. Aucune donnée existante n'est modifiée.

-- 1. Notification : état lu/non lu + page à ouvrir au clic
ALTER TABLE "Notification" ADD COLUMN "luLe" TIMESTAMP(3);
ALTER TABLE "Notification" ADD COLUMN "lien" TEXT;

-- 2. Un agent de saisie signale qu'il a terminé un tableau
ALTER TABLE "AssignationSaisie" ADD COLUMN "termineLe" TIMESTAMP(3);
ALTER TABLE "AssignationSaisie" ADD COLUMN "termineParId" TEXT;
ALTER TABLE "AssignationSaisie" ADD CONSTRAINT "AssignationSaisie_termineParId_fkey"
  FOREIGN KEY ("termineParId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Abonnements aux notifications système, un par appareil autorisé
CREATE TABLE "AbonnementPush" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "appareil" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dernierEnvoi" TIMESTAMP(3),
  CONSTRAINT "AbonnementPush_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AbonnementPush_endpoint_key" ON "AbonnementPush"("endpoint");
CREATE INDEX "AbonnementPush_userId_idx" ON "AbonnementPush"("userId");
ALTER TABLE "AbonnementPush" ADD CONSTRAINT "AbonnementPush_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Index de lecture de la pastille « non lues »
CREATE INDEX "Notification_destinataireId_luLe_idx" ON "Notification"("destinataireId", "luLe");
