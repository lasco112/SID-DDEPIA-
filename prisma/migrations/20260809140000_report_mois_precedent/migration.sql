-- Report des valeurs du mois précédent : une case reprise est marquée tant
-- que l'agent ne l'a pas confirmée. Migration additive, valeur par défaut
-- false : toutes les données existantes sont considérées comme confirmées.
ALTER TABLE "SaisieMatrice" ADD COLUMN "reporte" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SaisieNominative" ADD COLUMN "reporte" BOOLEAN NOT NULL DEFAULT false;
