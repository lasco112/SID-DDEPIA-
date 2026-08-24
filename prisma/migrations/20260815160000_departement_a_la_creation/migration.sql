-- ============================================================================
-- Le departement est pose A LA CREATION de chaque ligne.
--
-- Ce qui manquait
-- ---------------
-- Le client cloisonne declare le departement a la base, ce qui suffit pour LIRE
-- et pour MODIFIER : les politiques comparent la colonne au reglage de session.
-- Mais il n INJECTE pas la colonne dans les lignes creees. Jusqu ici une valeur
-- par defaut, 'dep_menoua', comblait ce trou -- ce qui marche tant qu il n y a
-- qu un departement, et devient faux des le second : ses creations auraient pris
-- la valeur par defaut et se seraient fait refuser par le WITH CHECK.
--
-- Pourquoi une regle de la BASE et non du code
-- --------------------------------------------
-- Une injection ecrite dans le client cloisonne ne couvrirait pas tout : une
-- transaction remet a l appelant un client de transaction BRUT, qui ne passe pas
-- par l extension. Les sept transactions applicatives auraient donc echappe a
-- l injection. Un declencheur, lui, s applique a toute insertion, quel que soit
-- le chemin -- extension, transaction, ou SQL ecrit a la main.
--
-- Le sens de l echec
-- ------------------
-- La valeur par defaut est retiree. Une insertion sans departement declare ne
-- produit plus une ligne rattachee a la Menoua par accident : elle est REFUSEE,
-- avec un message qui dit pourquoi. Une ligne qui n appartient a personne est
-- pire qu une insertion qui echoue -- elle devient invisible a tous et fausse
-- les totaux sans que rien ne le signale.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Le declencheur
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.poser_departement()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."departementId" IS NULL THEN
    -- Le meme reglage que celui lu par les politiques. `true` : ne leve pas si
    -- le reglage n a jamais ete pose, rend NULL -- le cas traite juste apres.
    NEW."departementId" := nullif(current_setting('app.departement_id', true), '');
  END IF;

  IF NEW."departementId" IS NULL THEN
    -- PAS de USING ERRCODE ici. Avec un code standard comme 23502
    -- (not_null_violation), Prisma reconnait l erreur, la traduit en P2011 et
    -- REMPLACE le message par « Null constraint violation on the fields: () ».
    -- Le motif reel est perdu, et l agent qui le lit ne sait pas quoi corriger.
    -- Le code par defaut de RAISE (P0001) n est pas reconnu : le message passe
    -- alors tel quel, comme le fait deja le refus des politiques.
    RAISE EXCEPTION
      'Aucun departement declare : la ligne inseree dans « % » n appartiendrait a aucun departement. Passer par le client cloisonne d une session (user.db) ou par transactionCloisonnee.',
      TG_TABLE_NAME;
  END IF;

  RETURN NEW;
END
$$;

COMMENT ON FUNCTION public.poser_departement() IS
  'Renseigne "departementId" depuis le reglage de session a l insertion, et refuse la ligne '
  'si aucun departement n est declare. Pose sur toutes les tables cloisonnees.';


-- ----------------------------------------------------------------------------
-- 2. Pose sur chaque table cloisonnee
--
-- La liste n est pas recopiee : elle est LUE dans le catalogue, comme etant
-- l ensemble des tables qui portent une colonne "departementId". Une table
-- cloisonnee ajoutee demain sans etre inscrite ici ne pourra donc pas etre
-- oubliee -- il suffira de rejouer ce bloc.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  t text;
  n int := 0;
BEGIN
  FOR t IN
    SELECT c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables tb
        ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
     WHERE c.table_schema = 'public'
       AND c.column_name = 'departementId'
       AND tb.table_type = 'BASE TABLE'
     ORDER BY c.table_name
  LOOP
    -- Plus de valeur par defaut : l absence de departement doit se voir.
    EXECUTE format('ALTER TABLE %I ALTER COLUMN "departementId" DROP DEFAULT', t);

    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_departement_insert', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION public.poser_departement()',
      t || '_departement_insert', t
    );
    n := n + 1;
  END LOOP;

  RAISE NOTICE 'Declencheur pose sur % table(s) cloisonnee(s).', n;

  IF n = 0 THEN
    RAISE EXCEPTION 'Aucune table cloisonnee trouvee : la migration n aurait rien fait.';
  END IF;
END
$$;
