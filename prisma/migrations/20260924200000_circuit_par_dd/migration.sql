-- Le DD peut franchir une etape du circuit trimestriel a la place d un DA ou
-- d un chef de section defaillant (decision du Delegue, 24/09/2026), comme
-- « Valider en tant que DD » au mensuel. L etape reste marquee comme telle.
-- Migration ADDITIVE.
ALTER TABLE "CircuitTrimestre" ADD COLUMN "parLeDD" BOOLEAN NOT NULL DEFAULT false;
