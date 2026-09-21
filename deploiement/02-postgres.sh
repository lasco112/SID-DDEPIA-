#!/usr/bin/env bash
#
# 02 — PostgreSQL et PostGIS, avec le cloisonnement du SID.
#
# Deux principes, tirés de ce qui a déjà coûté cher à ce projet :
#
#   1. La base n'écoute QUE localement. Elle n'a aucune raison d'être joignable
#      depuis Internet : l'application tourne sur la même machine. Une base
#      exposée est trouvée par les robots en quelques heures.
#
#   2. L'application ne se connecte PAS en superutilisateur. Elle utilise un
#      rôle dédié, sans BYPASSRLS — sans quoi les politiques de sécurité par
#      ligne seraient ignorées en silence, et le cloisonnement par département
#      ne serait qu'une illusion.
#
#   ./02-postgres.sh
#
set -euo pipefail

echo
echo "  02 — PostgreSQL + PostGIS"
echo

if [ "$(id -u)" -ne 0 ]; then
  echo "  Ce script doit être lancé en root." >&2
  exit 1
fi

BASE="sid_menoua"
ROLE="sid_app"
FICHIER_SECRETS="/root/sid-secrets.txt"

export DEBIAN_FRONTEND=noninteractive

echo "  → Installation de PostgreSQL et PostGIS"
apt-get install -y -qq postgresql postgresql-contrib postgis postgresql-postgis \
  2>/dev/null || apt-get install -y -qq postgresql postgresql-contrib postgis

VERSION=$(ls /etc/postgresql | sort -n | tail -1)
CONF="/etc/postgresql/${VERSION}/main/postgresql.conf"

# --- La base n'écoute que localement ---------------------------------------
echo "  → La base n'écoutera que sur cette machine"
sed -i "s/^#\?listen_addresses.*/listen_addresses = 'localhost'/" "$CONF"
systemctl restart postgresql

# --- Base et rôle -----------------------------------------------------------
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${BASE}'" | grep -q 1; then
  echo "  → La base « ${BASE} » existe déjà, conservée"
else
  echo "  → Création de la base « ${BASE} »"
  sudo -u postgres createdb "$BASE"
fi

echo "  → Extension PostGIS"
sudo -u postgres psql -q -d "$BASE" -c "CREATE EXTENSION IF NOT EXISTS postgis;"

# Un mot de passe tiré au sort : personne ne le choisit, personne ne le devine.
if [ -f "$FICHIER_SECRETS" ]; then
  echo "  → Secrets déjà présents, conservés (${FICHIER_SECRETS})"
  # shellcheck disable=SC1090
  source "$FICHIER_SECRETS"
else
  MDP_APP=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-28)
  MDP_ADMIN=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-28)
  SECRET_AUTH=$(openssl rand -base64 48 | tr -d '\n')

  cat > "$FICHIER_SECRETS" <<EOF
# Secrets du SID — NE JAMAIS partager, ne jamais copier dans le dépôt.
MDP_APP='${MDP_APP}'
MDP_ADMIN='${MDP_ADMIN}'
SECRET_AUTH='${SECRET_AUTH}'
EOF
  chmod 600 "$FICHIER_SECRETS"
  echo "  → Secrets engendrés et rangés dans ${FICHIER_SECRETS}"
fi

# Le rôle d'administration sert aux migrations : il crée et modifie les tables.
# Le rôle applicatif, lui, ne peut que lire et écrire des DONNÉES.
echo "  → Rôle d'administration (migrations)"
sudo -u postgres psql -q -d "$BASE" <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sid_admin') THEN
    CREATE ROLE sid_admin LOGIN PASSWORD '${MDP_ADMIN}';
  ELSE
    ALTER ROLE sid_admin PASSWORD '${MDP_ADMIN}';
  END IF;
END \$\$;
ALTER DATABASE ${BASE} OWNER TO sid_admin;
GRANT ALL ON SCHEMA public TO sid_admin;
SQL

# NOBYPASSRLS est le mot qui compte dans cette commande. Sans lui, toutes les
# politiques de cloisonnement posées dans le SID seraient ignorées.
echo "  → Rôle applicatif « ${ROLE} », SANS BYPASSRLS"
sudo -u postgres psql -q -d "$BASE" <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ROLE}') THEN
    CREATE ROLE ${ROLE} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS
      NOREPLICATION PASSWORD '${MDP_APP}';
  ELSE
    ALTER ROLE ${ROLE} NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS
      NOREPLICATION PASSWORD '${MDP_APP}';
  END IF;
END \$\$;

GRANT CONNECT ON DATABASE ${BASE} TO ${ROLE};
GRANT USAGE ON SCHEMA public TO ${ROLE};
REVOKE CREATE ON SCHEMA public FROM ${ROLE};
SQL

# Les droits sur les tables sont accordés APRÈS les migrations : les tables
# n'existent pas encore. Le script 03 s'en charge.

echo
echo "  ✔ PostgreSQL installé et cloisonné"
echo "    base   : ${BASE}"
echo "    écoute : localhost uniquement (vérifiable : ss -lntp | grep 5432)"
echo "    rôle applicatif : ${ROLE}, sans superutilisateur, sans BYPASSRLS"
echo
echo "  Suite :  ./03-application.sh"
echo
