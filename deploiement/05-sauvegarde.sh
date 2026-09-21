#!/usr/bin/env bash
#
# 05 — La sauvegarde quotidienne. Le script le plus important des cinq.
#
# Ce qui est arrivé en septembre 2026 : toutes les données du SID dans un seul
# endroit, sans aucune copie, devenues inaccessibles du jour au lendemain parce
# qu'un paiement n'était pas passé. Des mois de saisie de six arrondissements.
#
# Une sauvegarde qui reste sur la machine qu'elle sauvegarde ne protège de RIEN
# contre ce cas-là : si le serveur disparaît, elle disparaît avec lui. Elle
# protège seulement de l'erreur humaine — une purge malheureuse, une migration
# ratée. C'est déjà utile, mais ce n'est pas suffisant.
#
# D'où deux niveaux, et le second n'est pas optionnel :
#   1. ici, chaque nuit, quatorze jours conservés ;
#   2. AILLEURS, par vos soins — la fin du script dit exactement comment.
#
#   ./05-sauvegarde.sh
#
set -euo pipefail

echo
echo "  05 — Sauvegarde quotidienne"
echo

if [ "$(id -u)" -ne 0 ]; then
  echo "  Ce script doit être lancé en root." >&2
  exit 1
fi

DOSSIER="/var/sauvegardes-sid"
JOURS_CONSERVES=14

mkdir -p "$DOSSIER"
chmod 700 "$DOSSIER"

# --- Le script de sauvegarde ------------------------------------------------
cat > /usr/local/bin/sauvegarder-sid <<'SCRIPT'
#!/usr/bin/env bash
#
# Sauvegarde la base du SID. Lancé chaque nuit par systemd.
# Vérifie son propre résultat : une sauvegarde vide est pire que pas de
# sauvegarde, parce qu'on croit en avoir une.
#
set -euo pipefail

DOSSIER="/var/sauvegardes-sid"
BASE="sid_menoua"
JOURS=14
HORODATAGE=$(date +%Y-%m-%d_%Hh%M)
FICHIER="${DOSSIER}/sid_${HORODATAGE}.sql.gz"
ETAT="${DOSSIER}/derniere-sauvegarde.txt"

echouer() {
  echo "ÉCHEC $(date -Iseconds) — $1" > "$ETAT"
  logger -t sauvegarder-sid "ÉCHEC : $1"
  exit 1
}

# --no-owner / --no-acl : la copie doit pouvoir être restaurée sur un AUTRE
# serveur, où les rôles PostgreSQL ne portent pas les mêmes noms.
sudo -u postgres pg_dump --no-owner --no-acl "$BASE" 2>/dev/null | gzip -9 > "$FICHIER" \
  || echouer "pg_dump n'a pas abouti"

TAILLE=$(stat -c%s "$FICHIER")
[ "$TAILLE" -gt 10240 ] || echouer "sauvegarde anormalement petite (${TAILLE} octets)"

# On relit ce qu'on vient d'écrire : un fichier gzip tronqué passerait le test
# de taille mais serait irrécupérable.
gzip -t "$FICHIER" || echouer "fichier compressé illisible"
TABLES=$(zcat "$FICHIER" | grep -c '^CREATE TABLE ' || true)
[ "$TABLES" -ge 10 ] || echouer "seulement ${TABLES} tables dans la sauvegarde"

find "$DOSSIER" -name 'sid_*.sql.gz' -mtime "+${JOURS}" -delete

echo "OK $(date -Iseconds) — ${FICHIER} — $((TAILLE/1024)) Ko — ${TABLES} tables" > "$ETAT"
logger -t sauvegarder-sid "OK ${FICHIER} ($((TAILLE/1024)) Ko, ${TABLES} tables)"
SCRIPT

chmod 700 /usr/local/bin/sauvegarder-sid

# --- La minuterie -----------------------------------------------------------
cat > /etc/systemd/system/sauvegarde-sid.service <<'EOF'
[Unit]
Description=Sauvegarde de la base du SID

[Service]
Type=oneshot
ExecStart=/usr/local/bin/sauvegarder-sid
EOF

# 02h15 : la nuit au Cameroun, personne ne saisit.
cat > /etc/systemd/system/sauvegarde-sid.timer <<'EOF'
[Unit]
Description=Sauvegarde quotidienne du SID

[Timer]
OnCalendar=*-*-* 02:15:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now sauvegarde-sid.timer >/dev/null 2>&1

echo "  → Première sauvegarde, maintenant"
/usr/local/bin/sauvegarder-sid

echo
echo "  ✔ $(cat ${DOSSIER}/derniere-sauvegarde.txt)"
echo
echo "  Chaque nuit à 02h15, ${JOURS_CONSERVES} jours conservés."
echo
echo "  ─────────────────────────────────────────────────────────────────"
echo "  IL MANQUE ENCORE LE PLUS IMPORTANT : LA COPIE HORS DU SERVEUR"
echo "  ─────────────────────────────────────────────────────────────────"
echo
echo "  Tout ce qui précède disparaît avec le serveur. Depuis votre ThinkPad,"
echo "  récupérez la dernière sauvegarde — une fois par semaine au minimum :"
echo
echo "    scp root@$(hostname -I | awk '{print $1}'):/var/sauvegardes-sid/\$(ls -t ${DOSSIER}/sid_*.sql.gz | head -1 | xargs basename) ."
echo
echo "  Plus simple : le script recuperer-sauvegarde.ps1 fourni dans"
echo "  deploiement/ le fait pour vous, et garde les dix dernières."
echo
echo "  Et mettez-en une copie ailleurs encore : clé USB, disque externe,"
echo "  votre espace Google Drive. Deux endroits, c'est un minimum. Un seul,"
echo "  c'est la situation que vous venez de vivre."
echo
