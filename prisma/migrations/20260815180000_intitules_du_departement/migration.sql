-- ============================================================================
-- De quoi nommer un departement correctement, en francais.
--
-- Le nom du departement etait ecrit en dur dans une trentaine d endroits :
-- en-tetes de documents officiels, messages de relance, noms de fichiers,
-- metadonnees d export. Le sortir du code suppose de pouvoir le RECOMPOSER --
-- et c est la que le francais resiste.
--
-- « DE LA MENOUA », mais « DU NOUN », « DES BAMBOUTOS ». L article depend du
-- nom, pas d une regle mecanique. Le composer dans le code produirait
-- « DE NOUN » dans un rapport transmis au MINEPIA. Il est donc porte par la
-- donnee, comme le nom lui-meme.
--
-- MIGRATION ADDITIVE. La colonne est NULLABLE : l ancien code qui tournerait
-- encore contre le nouveau schema n en sait rien et continue de fonctionner.
-- Le code qui la lit se rabat sur « de <nom> » quand elle est absente.
-- ============================================================================

ALTER TABLE "Departement" ADD COLUMN IF NOT EXISTS "nomAvecArticle" TEXT;

COMMENT ON COLUMN "Departement"."nomAvecArticle" IS
  'Le nom precede de son article, tel qu il s ecrit dans une phrase : '
  '« de la Menoua », « du Noun ». Sert a composer les intitules officiels.';

-- La Menoua, seul departement en service a ce jour.
UPDATE "Departement" SET "nomAvecArticle" = 'de la Menoua' WHERE code = 'MEN' AND "nomAvecArticle" IS NULL;
