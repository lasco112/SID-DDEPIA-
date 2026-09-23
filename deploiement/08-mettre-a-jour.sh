#!/usr/bin/env bash
#
# 08 — Mettre à jour le SID en production, SANS toucher aux données.
#
# 03-application.sh sert à l'INSTALLATION : il relance aussi le semis, qui
# recrée les établissements « (DÉMO) » et remet les noms des comptes par
# défaut. Sur un serveur en service, avec les saisies réelles des
# arrondissements, c'est exactement ce qu'il ne faut pas faire.
#
# Ce script ne fait que : récupérer le code publié sur GitHub, installer les
# dépendances si elles ont changé, appliquer les migrations, reconstruire,
# redémarrer. Aucun semis, aucune donnée modifiée.
#
#   bash /opt/sid/deploiement/08-mettre-a-jour.sh
#
set -euo pipefail

CIBLE="/opt/sid"
cd "$CIBLE"

echo "  → Récupération du code publié"
git config --global --add safe.directory "$CIBLE" 2>/dev/null || true
AVANT=$(git rev-parse --short HEAD)
git fetch --quiet origin
git reset --hard --quiet origin/main
APRES=$(git rev-parse --short HEAD)
echo "    $AVANT → $APRES"
chown -R sid:sid "$CIBLE"

# Les dépendances ne sont réinstallées que si la liste a changé : c'est
# l'étape la plus longue, inutile quand seul le code bouge.
EMPREINTE="$CIBLE/.empreinte-dependances"
NOUVELLE=$(sha256sum package-lock.json | cut -d' ' -f1)
if [ ! -f "$EMPREINTE" ] || [ "$(cat "$EMPREINTE")" != "$NOUVELLE" ]; then
  echo "  → Installation des dépendances (plusieurs minutes)"
  sudo -u sid env HOME="$CIBLE" npm ci --silent 2>&1 | tail -3
  echo "$NOUVELLE" > "$EMPREINTE"
  chown sid:sid "$EMPREINTE"
else
  echo "  → Dépendances inchangées"
fi

echo "  → Migrations de la base"
sudo -u sid env HOME="$CIBLE" node --env-file="$CIBLE/.env" scripts/migrer.mjs deploy 2>&1 | tail -4

echo "  → Construction de l'application (quelques minutes)"
sudo -u sid env HOME="$CIBLE" npm run build 2>&1 | tail -5

echo "  → Redémarrage du service"
systemctl restart sid

# Le service met quelques secondes à répondre après un redémarrage.
for i in $(seq 1 30); do
  if curl -fsS -o /dev/null http://localhost:3000/; then
    echo ""
    echo "  ✔ SID mis à jour ($APRES) et en service."
    exit 0
  fi
  sleep 2
done
echo ""
echo "  ✖ Le SID ne répond pas après 60 secondes. Journal :"
journalctl -u sid -n 30 --no-pager
exit 1
