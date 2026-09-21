#!/usr/bin/env bash
#
# 03 — Installer le SID et le faire tourner en service.
#
# Le service redémarre tout seul : au démarrage de la machine, et après un
# plantage. Personne n'a à se connecter en SSH pour relancer l'application un
# dimanche soir.
#
#   ./03-application.sh https://sid.example.cm
#
set -euo pipefail

URL_PUBLIQUE="${1:-}"

echo
echo "  03 — Installation de l'application"
echo

if [ "$(id -u)" -ne 0 ]; then
  echo "  Ce script doit être lancé en root." >&2
  exit 1
fi
if [ -z "$URL_PUBLIQUE" ]; then
  echo "  Emploi : ./03-application.sh https://votre-domaine" >&2
  echo "  Sans domaine et pour un essai : ./03-application.sh http://VOTRE_IP:3000" >&2
  exit 1
fi
if [ ! -f /root/sid-secrets.txt ]; then
  echo "  Secrets introuvables. Lancez d'abord ./02-postgres.sh" >&2
  exit 1
fi
# shellcheck disable=SC1091
source /root/sid-secrets.txt

DEPOT="${DEPOT_SID:-https://github.com/lasco112/SID-DDEPIA-.git}"
CIBLE="/opt/sid"
BASE="sid_menoua"

# --- Node ------------------------------------------------------------------
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 22 ]; then
  echo "  → Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs
fi
echo "    node $(node -v)"

apt-get install -y -qq git

# --- Le code ---------------------------------------------------------------
# Trois cas, dans cet ordre.
#
# Le premier existe parce que le code du serveur n'est pas forcément celui de
# GitHub : tant que le travail n'est pas poussé, le dépôt distant est EN RETARD.
# Cloner reviendrait alors à installer une version ancienne sans s'en rendre
# compte — le service démarrerait, et il manquerait le cloisonnement.
# Si le code a été déposé à la main (scp depuis le poste), on n'y touche pas.
if [ -f "$CIBLE/package.json" ] && [ ! -d "$CIBLE/.git" ]; then
  echo "  → Code déposé à la main, conservé tel quel"
  echo "    (les mises à jour se feront par scp, pas par git)"
elif [ -d "$CIBLE/.git" ]; then
  echo "  → Mise à jour du dépôt"
  git -C "$CIBLE" fetch --quiet origin
  git -C "$CIBLE" reset --hard --quiet origin/HEAD 2>/dev/null || git -C "$CIBLE" pull --quiet
else
  echo "  → Récupération du code"
  rm -rf "$CIBLE"
  git clone --quiet "$DEPOT" "$CIBLE"
fi

# --- Un utilisateur dédié --------------------------------------------------
# L'application ne tourne pas en root. Si elle était compromise, l'attaquant
# n'aurait pas la main sur la machine entière.
if ! id sid >/dev/null 2>&1; then
  echo "  → Utilisateur système « sid »"
  useradd --system --home "$CIBLE" --shell /usr/sbin/nologin sid
fi

# --- La configuration ------------------------------------------------------
# Les clés VAPID servent aux notifications sur les téléphones. Engendrées ici
# si elles n'existent pas : sans elles, l'application démarre quand même mais
# les notifications système sont silencieusement désactivées.
if [ ! -f "$CIBLE/.env" ]; then
  echo "  → Fichier de configuration"
  VAPID=$(npx --yes web-push generate-vapid-keys --json 2>/dev/null || echo '{}')
  VAPID_PUB=$(echo "$VAPID" | grep -oP '"publicKey":\s*"\K[^"]+' || true)
  VAPID_PRIV=$(echo "$VAPID" | grep -oP '"privateKey":\s*"\K[^"]+' || true)

  cat > "$CIBLE/.env" <<EOF
# Connexion de l'APPLICATION : rôle sans privilèges, soumis au cloisonnement.
DATABASE_URL="postgresql://sid_app:${MDP_APP}@localhost:5432/${BASE}?schema=public"

# Connexion des MIGRATIONS : elle seule peut modifier la structure.
MIGRATE_DATABASE_URL="postgresql://sid_admin:${MDP_ADMIN}@localhost:5432/${BASE}?schema=public"

NEXTAUTH_SECRET="${SECRET_AUTH}"
NEXTAUTH_URL="${URL_PUBLIQUE}"

VAPID_PUBLIC_KEY="${VAPID_PUB}"
VAPID_PRIVATE_KEY="${VAPID_PRIV}"
VAPID_SUBJECT="mailto:ddepia.menoua@minepia.cm"
EOF
  chmod 600 "$CIBLE/.env"
else
  echo "  → Configuration déjà présente, conservée"
fi

chown -R sid:sid "$CIBLE"

# --- Construction ----------------------------------------------------------
echo "  → Installation des dépendances (plusieurs minutes)"
cd "$CIBLE"
sudo -u sid npm ci --silent 2>&1 | tail -3 || sudo -u sid npm install --silent 2>&1 | tail -3

echo "  → Migrations de la base"
sudo -u sid --preserve-env=HOME env HOME="$CIBLE" node scripts/migrer.mjs deploy 2>&1 | tail -4

# Les droits sur les tables ne peuvent être accordés qu'une fois les tables
# créées. C'est pourquoi cette étape est ici, et non dans le script 02.
echo "  → Droits du rôle applicatif sur les tables"
sudo -u postgres psql -q -d "$BASE" <<SQL
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sid_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sid_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO sid_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sid_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO sid_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO sid_app;
SQL

echo "  → Semis initial (comptes, référentiels, formulaires)"
sudo -u sid env HOME="$CIBLE" npx tsx prisma/seed.ts 2>&1 | tail -5 || \
  echo "    (semis déjà fait, ou à relancer à la main)"

echo "  → Construction de l'application (plusieurs minutes)"
sudo -u sid env HOME="$CIBLE" npm run build 2>&1 | tail -5

# --- Le service ------------------------------------------------------------
echo "  → Service qui démarre seul et se relance après un plantage"
cat > /etc/systemd/system/sid.service <<EOF
[Unit]
Description=SID DDEPIA-Menoua
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=sid
WorkingDirectory=${CIBLE}
Environment=NODE_ENV=production
Environment=PORT=3000
EnvironmentFile=${CIBLE}/.env
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=10

# Cloisonnement du service : il ne voit presque rien du reste du système.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${CIBLE}

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now sid >/dev/null 2>&1
sleep 8

echo
if systemctl is-active --quiet sid; then
  echo "  ✔ L'application tourne"
  echo "    état   : systemctl status sid"
  echo "    trace  : journalctl -u sid -f"
else
  echo "  ✗ Le service n'a pas démarré. Regardez :"
  echo "      journalctl -u sid -n 50 --no-pager"
fi
echo
echo "  Comptes créés par le semis : mot de passe initial « password123 »,"
echo "  À CHANGER à la première connexion."
echo
echo "  Suite :  ./04-https.sh votre-domaine"
echo
