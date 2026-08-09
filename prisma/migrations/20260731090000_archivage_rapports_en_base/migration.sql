-- Conserve les rapports générés DANS la base plutôt que sur le disque du
-- conteneur, effacé à chaque redéploiement Railway : les documents produits
-- jusqu'ici avaient disparu, seule leur trace en base subsistait. Le DD ne
-- pouvait donc ni relire ni retélécharger le rapport transmis par un DA.
ALTER TABLE "ExportDocument" ADD COLUMN "contenu" BYTEA;

-- Arrondissement concerné pour un rapport de DA (null pour un document
-- départemental). Sans cette colonne, retrouver « le rapport de Santchou »
-- supposait de deviner via l'auteur du document.
ALTER TABLE "ExportDocument" ADD COLUMN "arrondissementId" TEXT;

ALTER TABLE "ExportDocument"
  ADD CONSTRAINT "ExportDocument_arrondissementId_fkey"
  FOREIGN KEY ("arrondissementId") REFERENCES "Arrondissement"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ExportDocument_periodeId_arrondissementId_type_idx"
  ON "ExportDocument"("periodeId", "arrondissementId", "type");

-- Reconstitue l'arrondissement des rapports DA déjà enregistrés, à partir du
-- compte qui les a générés : leur contenu est perdu, mais ils restent ainsi
-- correctement rattachés dans l'historique.
UPDATE "ExportDocument" e
SET "arrondissementId" = u."arrondissementId"
FROM "User" u
WHERE u."id" = e."auteurId"
  AND e."type" = 'RAPPORT_DA_DOCX'
  AND u."arrondissementId" IS NOT NULL;
