-- Droits du rôle applicatif sur les tables créées par les migrations.
--
-- Incident du 24 septembre 2026 (HOSTKEY) : « permission denied for table
-- CircuitTrimestre ». En production, les migrations tournent sous sid_admin,
-- et les droits de sid_app n'avaient été accordés qu'une fois, à
-- l'installation (03-application.sh), sur les tables de ce jour-là. Les
-- « privilèges par défaut » posés alors par postgres ne valent que pour les
-- tables créées PAR postgres : toute table ajoutée depuis restait fermée à
-- l'application. En local, les migrations passent par postgres : invisible.
--
-- Cette migration rattrape les tables existantes, puis pose les privilèges
-- par défaut au nom du rôle qui migre : les tables des migrations futures
-- seront ouvertes à sid_app dès leur création. Le cloisonnement ne change
-- pas : sid_app reste soumis aux politiques par ligne (RLS).
--
-- Sans effet là où sid_app n'existe pas (base de démonstration, autres
-- environnements) ; seules les tables dont le rôle qui migre est
-- propriétaire sont touchées, pour ne jamais échouer sur un droit manquant.
DO $$
DECLARE
  t record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sid_app') THEN
    RETURN;
  END IF;

  FOR t IN
    SELECT c.relname, c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'S')
      AND c.relname <> '_prisma_migrations'
      AND pg_get_userbyid(c.relowner) = current_user
  LOOP
    IF t.relkind = 'S' THEN
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO sid_app', t.relname);
    ELSE
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO sid_app', t.relname);
    END IF;
  END LOOP;

  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sid_app;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO sid_app;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO sid_app;
END $$;
