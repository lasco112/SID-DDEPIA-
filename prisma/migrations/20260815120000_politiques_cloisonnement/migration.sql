-- ============================================================================
-- Le cloisonnement devient une regle de la BASE, et non plus une discipline du
-- code applicatif.
--
-- Chaque table cloisonnee ne laisse passer que les lignes dont le departement
-- egale le reglage de session "app.departement_id". Ce reglage est pose par
-- transaction, par le client cloisonne (src/lib/dbCloisonne.ts).
--
-- LE BON SENS DE L ECHEC. current_setting(..., true) rend NULL quand le
-- reglage est absent. La comparaison est alors NULL, donc fausse, et AUCUNE
-- ligne ne passe. Un chemin de code non cloisonne ne voit rien -- plutot que de
-- tout voir. L inverse, une politique permissive quand le reglage manque,
-- donnerait le sentiment d une securite qui n existe pas : c est exactement ce
-- que le memorandum d architecture interdit.
--
-- PAS DE "FORCE ROW LEVEL SECURITY". Le proprietaire des tables (postgres)
-- doit continuer a migrer et a reparer sans etre filtre. Seul le role
-- applicatif, qui ne possede aucune table et ne porte pas BYPASSRLS, est
-- soumis aux politiques.
--
-- ORDRE DE DEPLOIEMENT. Les fonctions d amorcage sont creees AVANT les
-- politiques : entre les deux instructions, aucune fenetre ou l authentifi-
-- cation serait cassee. En revanche, si l ancien code tourne encore contre la
-- base migree -- le temps d une bascule de conteneur -- il ne declare aucun
-- departement et ne voit donc plus rien. Deployer a une heure creuse.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. L AMORCAGE DE L AUTHENTIFICATION
--
-- L authentification doit lire un compte AVANT de connaitre son departement :
-- on cherche par nom d utilisateur, et c est la ligne trouvee qui apprend a
-- quel departement elle appartient. Aucune politique ne peut resoudre cette
-- circularite.
--
-- On ouvre donc UNE porte, et une seule : une fonction qui rend un compte par
-- identifiant ou par nom d utilisateur, et rien d autre. Elle ne permet ni de
-- parcourir la table, ni de la filtrer, ni d atteindre une autre table. Tout le
-- reste de l acces aux comptes reste soumis aux politiques.
--
-- SECURITY DEFINER : la fonction s execute avec les droits de son proprietaire
-- (postgres), qui n est pas filtre. SET search_path fige le schema, sans quoi
-- un appelant pourrait faire pointer "User" ailleurs.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.compte_pour_authentification(
  p_username text,
  p_id       text
)
RETURNS TABLE (
  id                   text,
  username             text,
  "passwordHash"       text,
  nom                  text,
  role                 "Role",
  actif                boolean,
  "mustChangePassword" boolean,
  "sessionRevoqueeLe"  timestamp(3),
  "arrondissementId"   text,
  "sectionId"          text,
  "departementId"      text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id,
         u.username,
         u."passwordHash",
         u.nom,
         u.role,
         u.actif,
         u."mustChangePassword",
         u."sessionRevoqueeLe",
         u."arrondissementId",
         u."sectionId",
         u."departementId"
    FROM "User" u
   WHERE (p_username IS NOT NULL AND u.username = p_username)
      OR (p_id       IS NOT NULL AND u.id       = p_id)
   LIMIT 1;
$$;

COMMENT ON FUNCTION public.compte_pour_authentification(text, text) IS
  'Amorcage de l authentification : rend UN compte par identifiant ou par nom d utilisateur. '
  'Seule lecture de "User" qui precede le cloisonnement. Ne jamais elargir sa signature.';

-- Un identifiant est unique sur TOUTE la base, pas par departement : verifier
-- sa disponibilite traverse donc les departements par nature. Cette fonction
-- ne rend qu un booleen -- elle n expose aucune ligne.
CREATE OR REPLACE FUNCTION public.identifiant_disponible(p_username text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM "User" WHERE username = p_username);
$$;

COMMENT ON FUNCTION public.identifiant_disponible(text) IS
  'Un identifiant est-il libre ? Rend un booleen, jamais une ligne. '
  'L unicite des identifiants est globale, la verification traverse les departements.';


-- ----------------------------------------------------------------------------
-- 2. LES POLITIQUES, UNE PAR TABLE CLOISONNEE
--
-- "DROP POLICY IF EXISTS" avant chaque creation : la migration se rejoue alors
-- sans erreur sur une base ou elle serait deja passee a moitie.
-- ----------------------------------------------------------------------------

ALTER TABLE "Arrondissement" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Arrondissement_departement" ON "Arrondissement";
CREATE POLICY "Arrondissement_departement" ON "Arrondissement"
  USING ("departementId" = current_setting('app.departement_id', true))
  WITH CHECK ("departementId" = current_setting('app.departement_id', true));

ALTER TABLE "PeriodeReporting" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "PeriodeReporting_departement" ON "PeriodeReporting";
CREATE POLICY "PeriodeReporting_departement" ON "PeriodeReporting"
  USING ("departementId" = current_setting('app.departement_id', true))
  WITH CHECK ("departementId" = current_setting('app.departement_id', true));

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "User_departement" ON "User";
CREATE POLICY "User_departement" ON "User"
  USING ("departementId" = current_setting('app.departement_id', true))
  WITH CHECK ("departementId" = current_setting('app.departement_id', true));

ALTER TABLE "Etablissement" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Etablissement_departement" ON "Etablissement";
CREATE POLICY "Etablissement_departement" ON "Etablissement"
  USING ("departementId" = current_setting('app.departement_id', true))
  WITH CHECK ("departementId" = current_setting('app.departement_id', true));

ALTER TABLE "AssignationSaisie" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "AssignationSaisie_departement" ON "AssignationSaisie";
CREATE POLICY "AssignationSaisie_departement" ON "AssignationSaisie"
  USING ("departementId" = current_setting('app.departement_id', true))
  WITH CHECK ("departementId" = current_setting('app.departement_id', true));

ALTER TABLE "RapportArrondissement" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "RapportArrondissement_departement" ON "RapportArrondissement";
CREATE POLICY "RapportArrondissement_departement" ON "RapportArrondissement"
  USING ("departementId" = current_setting('app.departement_id', true))
  WITH CHECK ("departementId" = current_setting('app.departement_id', true));

ALTER TABLE "ValidationSection" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ValidationSection_departement" ON "ValidationSection";
CREATE POLICY "ValidationSection_departement" ON "ValidationSection"
  USING ("departementId" = current_setting('app.departement_id', true))
  WITH CHECK ("departementId" = current_setting('app.departement_id', true));

ALTER TABLE "SaisieMatrice" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "SaisieMatrice_departement" ON "SaisieMatrice";
CREATE POLICY "SaisieMatrice_departement" ON "SaisieMatrice"
  USING ("departementId" = current_setting('app.departement_id', true))
  WITH CHECK ("departementId" = current_setting('app.departement_id', true));

ALTER TABLE "SaisieNominative" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "SaisieNominative_departement" ON "SaisieNominative";
CREATE POLICY "SaisieNominative_departement" ON "SaisieNominative"
  USING ("departementId" = current_setting('app.departement_id', true))
  WITH CHECK ("departementId" = current_setting('app.departement_id', true));

ALTER TABLE "SaisieEvenement" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "SaisieEvenement_departement" ON "SaisieEvenement";
CREATE POLICY "SaisieEvenement_departement" ON "SaisieEvenement"
  USING ("departementId" = current_setting('app.departement_id', true))
  WITH CHECK ("departementId" = current_setting('app.departement_id', true));

ALTER TABLE "Correction" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Correction_departement" ON "Correction";
CREATE POLICY "Correction_departement" ON "Correction"
  USING ("departementId" = current_setting('app.departement_id', true))
  WITH CHECK ("departementId" = current_setting('app.departement_id', true));

ALTER TABLE "RubriqueNarrative" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "RubriqueNarrative_departement" ON "RubriqueNarrative";
CREATE POLICY "RubriqueNarrative_departement" ON "RubriqueNarrative"
  USING ("departementId" = current_setting('app.departement_id', true))
  WITH CHECK ("departementId" = current_setting('app.departement_id', true));

ALTER TABLE "SyntheseSection" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "SyntheseSection_departement" ON "SyntheseSection";
CREATE POLICY "SyntheseSection_departement" ON "SyntheseSection"
  USING ("departementId" = current_setting('app.departement_id', true))
  WITH CHECK ("departementId" = current_setting('app.departement_id', true));

ALTER TABLE "ExportDocument" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ExportDocument_departement" ON "ExportDocument";
CREATE POLICY "ExportDocument_departement" ON "ExportDocument"
  USING ("departementId" = current_setting('app.departement_id', true))
  WITH CHECK ("departementId" = current_setting('app.departement_id', true));

ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Notification_departement" ON "Notification";
CREATE POLICY "Notification_departement" ON "Notification"
  USING ("departementId" = current_setting('app.departement_id', true))
  WITH CHECK ("departementId" = current_setting('app.departement_id', true));

ALTER TABLE "AbonnementPush" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "AbonnementPush_departement" ON "AbonnementPush";
CREATE POLICY "AbonnementPush_departement" ON "AbonnementPush"
  USING ("departementId" = current_setting('app.departement_id', true))
  WITH CHECK ("departementId" = current_setting('app.departement_id', true));

ALTER TABLE "PointSIG" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "PointSIG_departement" ON "PointSIG";
CREATE POLICY "PointSIG_departement" ON "PointSIG"
  USING ("departementId" = current_setting('app.departement_id', true))
  WITH CHECK ("departementId" = current_setting('app.departement_id', true));

ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "AuditLog_departement" ON "AuditLog";
CREATE POLICY "AuditLog_departement" ON "AuditLog"
  USING ("departementId" = current_setting('app.departement_id', true))
  WITH CHECK ("departementId" = current_setting('app.departement_id', true));

ALTER TABLE "DemandeAide" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "DemandeAide_departement" ON "DemandeAide";
CREATE POLICY "DemandeAide_departement" ON "DemandeAide"
  USING ("departementId" = current_setting('app.departement_id', true))
  WITH CHECK ("departementId" = current_setting('app.departement_id', true));
