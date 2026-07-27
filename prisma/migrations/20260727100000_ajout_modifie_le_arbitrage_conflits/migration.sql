-- Date de dernière modification SUR L'APPAREIL, distincte de syncedAt qui est
-- la date d'ARRIVÉE au serveur. Elle sert à arbitrer les conflits entre deux
-- appareils ayant touché la même cellule : la modification la plus RÉCENTE
-- l'emporte, et non la dernière synchronisée.
--
-- Pourquoi ce changement (demande du DD) : une dernière modification est
-- généralement une correction. Sans cet arbitrage, un agent resté longtemps
-- hors ligne écrasait, en se reconnectant, la correction faite entre-temps par
-- son DA — la version la plus ancienne gagnait simplement parce qu'elle
-- arrivait en dernier.
--
-- Nullable : les lignes déjà en base n'ont pas cette information. Elles sont
-- traitées comme les plus anciennes, donc toute nouvelle saisie datée les
-- remplace — comportement voulu pour la reprise.
ALTER TABLE "SaisieMatrice"    ADD COLUMN "modifieLe" TIMESTAMP(3);
ALTER TABLE "SaisieNominative" ADD COLUMN "modifieLe" TIMESTAMP(3);
ALTER TABLE "SaisieEvenement"  ADD COLUMN "modifieLe" TIMESTAMP(3);
