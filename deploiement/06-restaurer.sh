#!/usr/bin/env bash
#
# 06 — Verser une sauvegarde dans la base.
#
# Deux usages :
#   - récupérer les données de Railway, si vous parvenez un jour à les extraire ;
#   - revenir en arrière après une fausse manœuvre.
#
# Ce script ÉCRASE la base existante. Il fait donc d'abord une sauvegarde de
# ce qu'il s'apprête à remplacer — on ne détruit jamais l'état actuel pour en
# restaurer un autre sans filet.
#
#   ./06-restaurer.sh /chemin/vers/sauvegarde.sql.gz
#
set -euo pipefail

FICHIER="${1:-}"
BASE="sid_menoua"

echo
echo "  06 — Restauration"
echo

if [ "$(id -u)" -ne 0 ]; then
  echo "  Ce script doit être lancé en root." >&2
  exit 1
fi
if [ -z "$FICHIER" ] || [ ! -f "$FICHIER" ]; then
  echo "  Emploi : ./06-restaurer.sh /chemin/vers/sauvegarde.sql.gz" >&2
  exit 1
fi

# --- Vérifier le fichier AVANT de toucher à la base ------------------------
echo "  → Vérification du fichier"
if [[ "$FICHIER" == *.gz ]]; then
  gzip -t "$FICHIER" || { echo "  ✗ Fichier compressé illisible." >&2; exit 1; }
  LIRE="zcat"
else
  LIRE="cat"
fi

TABLES=$($LIRE "$FICHIER" | grep -c '^CREATE TABLE ' || true)
if [ "$TABLES" -lt 10 ]; then
  echo "  ✗ Seulement ${TABLES} tables dans ce fichier : il semble incomplet." >&2
  echo "    Restaurer maintenant remplacerait vos données par presque rien." >&2
  exit 1
fi
echo "    ${TABLES} tables trouvées"

# --- Filet de sécurité ------------------------------------------------------
AVANT="/var/sauvegardes-sid/avant-restauration_$(date +%Y-%m-%d_%Hh%M).sql.gz"
mkdir -p /var/sauvegardes-sid
echo "  → Sauvegarde de l'état ACTUEL avant de l'écraser"
sudo -u postgres pg_dump --no-owner --no-acl "$BASE" 2>/dev/null | gzip -9 > "$AVANT" || true
echo "    ${AVANT}"

# --- Confirmation -----------------------------------------------------------
echo
echo "  La base « ${BASE} » va être REMPLACÉE par le contenu de :"
echo "    ${FICHIER}"
echo
read -r -p "  Taper REMPLACER en majuscules pour confirmer : " reponse
if [ "$reponse" != "REMPLACER" ]; then
  echo "  Annulé. Rien n'a été modifié."
  exit 0
fi

# --- Restauration -----------------------------------------------------------
echo "  → Arrêt de l'application"
systemctl stop sid 2>/dev/null || true

echo "  → Remise à zéro du schéma"
sudo -u postgres psql -q -d "$BASE" <<'SQL'
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
SQL
sudo -u postgres psql -q -d "$BASE" -c "CREATE EXTENSION IF NOT EXISTS postgis;"

echo "  → Chargement des données (plusieurs minutes)"
$LIRE "$FICHIER" | sudo -u postgres psql -q -d "$BASE" 2>&1 | grep -vE "^(SET|COPY|ALTER|CREATE|GRANT|REVOKE)" | head -20 || true

# Les droits sont à redonner : le schéma a été recréé, les privilèges avec lui.
echo "  → Droits du rôle applicatif"
sudo -u postgres psql -q -d "$BASE" <<'SQL'
GRANT USAGE ON SCHEMA public TO sid_app;
REVOKE CREATE ON SCHEMA public FROM sid_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sid_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sid_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO sid_app;
SQL

echo "  → Migrations éventuellement manquantes"
cd /opt/sid && sudo -u sid env HOME=/opt/sid node scripts/migrer.mjs deploy 2>&1 | tail -3 || true

echo "  → Redémarrage"
systemctl start sid
sleep 8

echo
if systemctl is-active --quiet sid; then
  echo "  ✔ Restauration terminée, l'application tourne"
else
  echo "  ✗ L'application n'a pas redémarré :  journalctl -u sid -n 50 --no-pager"
fi
echo
echo "  L'état d'avant est conservé ici, au cas où :"
echo "    ${AVANT}"
echo
echo "  Vérifiez maintenant que le cloisonnement tient :"
echo "    cd /opt/sid && sudo -u sid node --env-file=.env --import tsx scripts/verifier-cloisonnement.ts"
echo
