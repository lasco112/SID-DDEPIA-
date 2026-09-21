#!/usr/bin/env bash
#
# 04 — Nginx et certificat HTTPS.
#
# Pourquoi HTTPS n'est pas facultatif ici : sans lui, les mots de passe des
# agents circulent en clair sur le réseau mobile, et le navigateur affiche un
# avertissement de sécurité sur un service administratif. De plus, le mode hors
# ligne du SID (service worker) ne fonctionne QUE sur une page sécurisée.
#
#   ./04-https.sh sid.example.cm
#
set -euo pipefail

DOMAINE="${1:-}"

echo
echo "  04 — HTTPS"
echo

if [ "$(id -u)" -ne 0 ]; then
  echo "  Ce script doit être lancé en root." >&2
  exit 1
fi
if [ -z "$DOMAINE" ]; then
  echo "  Emploi : ./04-https.sh votre-domaine.cm" >&2
  echo
  echo "  Vous n'avez pas encore de domaine ? Il en faut un : un certificat ne" >&2
  echo "  s'obtient pas pour une adresse IP nue. Un .cm ou un .com coûte" >&2
  echo "  quelques milliers de francs par an." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
echo "  → Nginx et certbot"
apt-get install -y -qq nginx certbot python3-certbot-nginx

# --- Vérifier que le domaine pointe bien ici -------------------------------
# Certbot échouerait de toute façon, mais avec un message obscur. Mieux vaut
# s'arrêter ici en disant pourquoi.
IP_SERVEUR=$(curl -fsS --max-time 10 https://api.ipify.org || echo "")
IP_DOMAINE=$(getent hosts "$DOMAINE" | awk '{print $1}' | head -1 || echo "")
if [ -n "$IP_SERVEUR" ] && [ -n "$IP_DOMAINE" ] && [ "$IP_SERVEUR" != "$IP_DOMAINE" ]; then
  echo
  echo "  ✗ « ${DOMAINE} » pointe vers ${IP_DOMAINE}, or ce serveur est ${IP_SERVEUR}." >&2
  echo "    Corrigez l'enregistrement DNS (type A) et relancez." >&2
  echo "    La propagation peut prendre jusqu'à une heure." >&2
  exit 1
fi

# --- Le relais vers l'application ------------------------------------------
echo "  → Configuration de nginx"
cat > /etc/nginx/sites-available/sid <<EOF
server {
    listen 80;
    server_name ${DOMAINE};

    # Les rapports .docx font plusieurs mégaoctets ; la valeur par défaut de
    # nginx (1 Mo) ferait échouer les envois volumineux depuis les appareils.
    client_max_body_size 32M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;

        # La génération d'un rapport trimestriel dépasse les 60 s par défaut.
        proxy_read_timeout 300s;
    }
}
EOF

ln -sf /etc/nginx/sites-available/sid /etc/nginx/sites-enabled/sid
rm -f /etc/nginx/sites-enabled/default
nginx -t >/dev/null
systemctl reload nginx

# --- Le certificat ---------------------------------------------------------
echo "  → Certificat Let's Encrypt"
certbot --nginx -d "$DOMAINE" --non-interactive --agree-tos \
  --register-unsafely-without-email --redirect 2>&1 | tail -5

# Le renouvellement automatique est installé par le paquet ; on vérifie qu'il
# est bien armé plutôt que de le supposer.
if systemctl is-enabled --quiet certbot.timer 2>/dev/null; then
  echo "  → Renouvellement automatique : armé"
else
  systemctl enable --now certbot.timer >/dev/null 2>&1 || true
fi

echo
echo "  ✔ HTTPS en place"
echo "    https://${DOMAINE}"
echo
echo "  N'OUBLIEZ PAS de corriger NEXTAUTH_URL dans /opt/sid/.env s'il ne"
echo "  correspond pas exactement à https://${DOMAINE} — l'authentification"
echo "  échouerait silencieusement. Puis :  systemctl restart sid"
echo
echo "  Suite, et ne la remettez pas à plus tard :  ./05-sauvegarde.sh"
echo
