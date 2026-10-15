#!/usr/bin/env bash
#
# 12 — Les clés des notifications sur les téléphones (VAPID).
#
# Sans elles, le SID marche, mais aucune alerte n'arrive au-dessus de l'écran
# des téléphones : l'invitation « Recevoir les alertes » ne s'affiche même pas.
# 03-application.sh les engendrait par `npx web-push`, qui a pu échouer sans
# bruit à l'installation et laisser deux lignes vides dans .env.
#
# Ce script les crée SI elles manquent ou sont vides — avec la bibliothèque
# web-push déjà installée par le SID — et ne touche JAMAIS des clés présentes :
# les changer couperait les notifications de tous les téléphones déjà abonnés.
#
# Appelé par 08-mettre-a-jour.sh ; peut aussi se lancer seul, en root :
#   bash /opt/sid/deploiement/12-cles-notifications.sh
#
set -euo pipefail

CIBLE="${SID_CIBLE:-/opt/sid}"   # SID_CIBLE : seulement pour l'essayer ailleurs
ENV_APP="$CIBLE/.env"
[ -f "$ENV_APP" ] || { echo "  ✖ $ENV_APP absent."; exit 1; }

valeur() { grep -E "^$1=" "$ENV_APP" | tail -1 | cut -d= -f2- | tr -d '"' || true; }

if [ -n "$(valeur VAPID_PUBLIC_KEY)" ] && [ -n "$(valeur VAPID_PRIVATE_KEY)" ]; then
  echo "  → Notifications sur les téléphones : clés présentes"
  exit 0
fi

echo "  → Notifications sur les téléphones : création des clés"
# En production, sous le compte « sid » ; sur un poste d'essai, tel quel.
if id sid >/dev/null 2>&1; then EXEC=(sudo -u sid env HOME="$CIBLE"); else EXEC=(); fi
CLES=$(cd "$CIBLE" && "${EXEC[@]}" node -e \
  "const k=require('web-push').generateVAPIDKeys(); console.log(k.publicKey + ' ' + k.privateKey)")
PUB=${CLES%% *}
PRIV=${CLES##* }
[ -n "$PUB" ] && [ -n "$PRIV" ] && [ "$PUB" != "$PRIV" ] || { echo "  ✖ Clés non créées."; exit 1; }

# Les lignes vides laissées par l'installation sont retirées, puis remplacées.
sed -i -E '/^VAPID_(PUBLIC_KEY|PRIVATE_KEY|SUBJECT)=/d' "$ENV_APP"
{
  echo ""
  echo "# Notifications sur les téléphones (12-cles-notifications.sh). NE PAS CHANGER :"
  echo "# de nouvelles clés couperaient les alertes de tous les téléphones abonnés."
  echo "VAPID_PUBLIC_KEY=\"$PUB\""
  echo "VAPID_PRIVATE_KEY=\"$PRIV\""
  echo "VAPID_SUBJECT=\"mailto:ddepia.menoua@minepia.cm\""
} >> "$ENV_APP"
chmod 600 "$ENV_APP"
if id sid >/dev/null 2>&1; then chown sid:sid "$ENV_APP"; fi
echo "  ✔ Clés des notifications créées (prises en compte au redémarrage)."
