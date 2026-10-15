#!/usr/bin/env bash
#
# 11 — Installer la base de DÉMONSTRATION, à côté de la base réelle.
#
# Sur le même serveur, une seconde base, « sid_demo », distincte de
# « sid_menoua » : les faux chiffres des formations ne se mêlent jamais aux
# vrais. Mêmes rôles que la base réelle (02-postgres.sh) — sid_admin migre,
# sid_app lit et écrit, SANS BYPASSRLS —, donc le même cloisonnement entre
# départements.
#
# Rejouable sans risque : chaque étape regarde si elle est déjà faite. Appelé
# à chaque mise à jour par 08-mettre-a-jour.sh ; une fois la démonstration
# installée, il ne fait plus que vérifier. Il NE TOUCHE JAMAIS à sid_menoua.
#
#   bash /opt/sid/deploiement/11-base-demonstration.sh            (puis redémarrer)
#   bash /opt/sid/deploiement/11-base-demonstration.sh --redemarrer
#
set -euo pipefail

CIBLE="/opt/sid"
BASE="sid_demo"
BASE_REELLE="sid_menoua"
ENV_APP="${CIBLE}/.env"
FICHIER_SECRETS="/root/sid-secrets.txt"

if [ "$(id -u)" -ne 0 ]; then
  echo "  Ce script doit être lancé en root." >&2
  exit 1
fi
if [ ! -f "$FICHIER_SECRETS" ] || [ ! -f "$ENV_APP" ]; then
  echo "  ✖ ${FICHIER_SECRETS} ou ${ENV_APP} introuvable : installation du SID incomplète." >&2
  exit 1
fi
# shellcheck disable=SC1090
source "$FICHIER_SECRETS"   # MDP_APP, MDP_ADMIN — jamais affichés

if [ "$BASE" = "$BASE_REELLE" ]; then
  echo "  ✖ La base de démonstration doit être distincte de la base réelle." >&2
  exit 1
fi

psql_demo() { sudo -u postgres psql -qtA -d "$BASE" "$@"; }

# --- 1. La base ---------------------------------------------------------------
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${BASE}'" | grep -q 1; then
  echo "  → Création de la base de démonstration « ${BASE} »"
  sudo -u postgres createdb -O sid_admin "$BASE"
fi

# PostGIS ne s'installe qu'en superutilisateur : avant les migrations, comme
# pour la base réelle. Puis les mêmes droits que 02-postgres.sh.
psql_demo <<SQL
CREATE EXTENSION IF NOT EXISTS postgis;
ALTER DATABASE ${BASE} OWNER TO sid_admin;
GRANT ALL ON SCHEMA public TO sid_admin;
GRANT CONNECT ON DATABASE ${BASE} TO sid_app;
GRANT USAGE ON SCHEMA public TO sid_app;
REVOKE CREATE ON SCHEMA public FROM sid_app;
SQL

# --- 2. Les deux connexions, dans le fichier de configuration -----------------
if ! grep -q '^DEMO_DATABASE_URL=' "$ENV_APP"; then
  echo "  → Connexions de la démonstration ajoutées à la configuration"
  {
    echo ""
    echo "# Base de DÉMONSTRATION (11-base-demonstration.sh) : distincte de la base réelle."
    echo "DEMO_DATABASE_URL=\"postgresql://sid_app:${MDP_APP}@localhost:5432/${BASE}?schema=public\""
    echo "MIGRATE_DEMO_DATABASE_URL=\"postgresql://sid_admin:${MDP_ADMIN}@localhost:5432/${BASE}?schema=public\""
  } >> "$ENV_APP"
  chown sid:sid "$ENV_APP"
  chmod 600 "$ENV_APP"
fi

# --- 3. Les tables (mêmes migrations que la base réelle) ----------------------
cd "$CIBLE"
sudo -u sid env HOME="$CIBLE" node --env-file="$ENV_APP" scripts/migrations-demo.mjs 2>&1 | tail -3
if ! psql_demo -c "SELECT 1 FROM \"Departement\" WHERE code='MEN'" | grep -q 1; then
  echo "  ✖ Les migrations de la démonstration n'ont pas abouti (la base réelle n'est pas touchée)." >&2
  exit 1
fi

# --- 4. Le contenu : tableaux, comptes et chiffres fictifs des 8 départements -
COMPTES=$(psql_demo -c "SELECT count(*) FROM \"User\" WHERE username LIKE 'demo.%'")
if [ "${COMPTES:-0}" -eq 0 ]; then
  echo "  → Remplissage de la démonstration (8 départements, quelques minutes)"
  sudo -u sid env HOME="$CIBLE" node --env-file="$ENV_APP" --import tsx prisma/seed-demo.ts 2>&1 | tail -4
  COMPTES=$(psql_demo -c "SELECT count(*) FROM \"User\" WHERE username LIKE 'demo.%'")
fi
SAISIES=$(psql_demo -c "SELECT count(*) FROM \"SaisieMatrice\"")
echo "  ✔ Démonstration installée : ${COMPTES} comptes de démonstration, ${SAISIES} saisies."

if [ "${1:-}" = "--redemarrer" ]; then
  systemctl restart sid
  echo "  ✔ Service redémarré."
fi
