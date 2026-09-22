#!/usr/bin/env bash
#
# 07 — Récupérer les sauvegardes par HTTPS, quand SSH est bloqué.
#
# Pourquoi ce script existe. La sauvegarde du script 05 vit sur le serveur
# qu'elle sauvegarde : elle protège d'une fausse manœuvre, PAS de la perte du
# serveur. Or c'est exactement ce qui est arrivé en septembre 2026 — des mois
# de saisie devenus inaccessibles parce qu'un paiement n'était pas passé.
#
# La méthode prévue (scp, recuperer-sauvegarde.ps1) passe par SSH, port 22. Sur
# certains réseaux d'entreprise ou d'administration — dont celui de la
# Délégation — ce port est filtré : impossible de sortir le fichier.
#
# Le port 443, lui, est ouvert, puisque c'est celui du service. On expose donc
# le dossier des sauvegardes derrière nginx, à une adresse imprévisible ET
# protégée par mot de passe. Deux serrures, pas une : l'adresse seule finirait
# par fuiter (historique de navigateur, journal d'un proxy, capture d'écran).
#
# Ce fichier contient TOUTES les données du département. Il ne doit être
# téléchargé que par le Délégué, et rangé ensuite hors du serveur.
#
#   ./07-sauvegardes-web.sh
#
set -euo pipefail

CONF="/etc/nginx/sites-available/sid"
HTPASSWD="/etc/nginx/.sauvegardes"
DOSSIER="/var/sauvegardes-sid"
UTILISATEUR="ddepia"

echo
echo "  07 — Téléchargement des sauvegardes par HTTPS"
echo

if [ "$(id -u)" -ne 0 ]; then
  echo "  Ce script doit être lancé en root." >&2
  exit 1
fi
if [ ! -f "$CONF" ]; then
  echo "  Configuration nginx introuvable. Lancez d'abord ./04-https.sh" >&2
  exit 1
fi
if [ ! -d "$DOSSIER" ]; then
  echo "  Aucune sauvegarde. Lancez d'abord ./05-sauvegarde.sh" >&2
  exit 1
fi

DOMAINE=$(grep -m1 -E '^\s*server_name' "$CONF" | awk '{print $2}' | tr -d ';')
if [ -z "$DOMAINE" ]; then
  echo "  Impossible de lire server_name dans ${CONF}." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
command -v htpasswd >/dev/null 2>&1 || apt-get install -y -qq apache2-utils >/dev/null 2>&1

# --- Laisser nginx lire le dossier ------------------------------------------
# 05 pose 700 root:root : personne d'autre que root n'entre. nginx tourne en
# www-data et doit pouvoir traverser le dossier et lire les fichiers. On passe
# donc en 750 root:www-data — le groupe lit, le reste du monde ne voit rien.
chown root:www-data "$DOSSIER"
chmod 750 "$DOSSIER"

# --- Sauvegarde de la configuration avant d'y toucher ------------------------
HORODATAGE=$(date +%Y-%m-%d_%Hh%M)
cp "$CONF" "${CONF}.bak_${HORODATAGE}"

# --- Retirer un éventuel accès précédent ------------------------------------
# Relancer ce script doit donner une adresse NEUVE et invalider l'ancienne :
# c'est ce qu'on veut le jour où l'adresse a été montrée à quelqu'un par
# mégarde. On supprime donc le bloc existant avant d'en écrire un autre.
awk '
  /location \/sauvegardes-/ { dans_bloc = 1; next }
  dans_bloc && /^\s*\}/      { dans_bloc = 0; next }
  dans_bloc                  { next }
  { print }
' "$CONF" > "${CONF}.tmp" && mv "${CONF}.tmp" "$CONF"

# --- Écrire le nouvel accès --------------------------------------------------
SECRET=$(openssl rand -hex 8)

awk -v s="$SECRET" '
  /location \/ \{/ && !pose {
    print "    # Sauvegardes de la base — voir deploiement/07-sauvegardes-web.sh"
    print "    location /sauvegardes-" s "/ {"
    print "        alias /var/sauvegardes-sid/;"
    print "        autoindex on;"
    print "        auth_basic \"Sauvegardes SID\";"
    print "        auth_basic_user_file /etc/nginx/.sauvegardes;"
    print "    }"
    print ""
    pose = 1
  }
  { print }
' "$CONF" > "${CONF}.tmp" && mv "${CONF}.tmp" "$CONF"

if ! grep -q "sauvegardes-${SECRET}" "$CONF"; then
  echo "  ✗ Le bloc n'a pas pu être inséré (aucun « location / { » trouvé)." >&2
  echo "    Configuration remise en l'état." >&2
  cp "${CONF}.bak_${HORODATAGE}" "$CONF"
  exit 1
fi

# --- Le mot de passe ---------------------------------------------------------
echo "  Choisissez le mot de passe de téléchargement."
echo "  Il ne s'affichera pas pendant la frappe. Lettres et chiffres seulement"
echo "  si vous êtes sur la console web : son clavier est en QWERTY."
echo
htpasswd -c "$HTPASSWD" "$UTILISATEUR"
chown root:www-data "$HTPASSWD"
chmod 640 "$HTPASSWD"

# --- Vérifier puis appliquer -------------------------------------------------
if ! nginx -t >/dev/null 2>&1; then
  echo "  ✗ Configuration nginx invalide. Remise en l'état, rien n'a changé." >&2
  cp "${CONF}.bak_${HORODATAGE}" "$CONF"
  nginx -t
  exit 1
fi
systemctl reload nginx

echo
echo "  ✔ Accès en place"
echo
echo "  ─────────────────────────────────────────────────────────────────"
echo "  ADRESSE — À NOTER SUR PAPIER, À NE PAS PHOTOGRAPHIER"
echo "  ─────────────────────────────────────────────────────────────────"
echo
echo "    https://${DOMAINE}/sauvegardes-${SECRET}/"
echo
echo "    utilisateur : ${UTILISATEUR}"
echo "    mot de passe : celui que vous venez de choisir"
echo
echo "  Ouvrez-la depuis un navigateur — téléphone ou ordinateur. La liste des"
echo "  sauvegardes s'affiche ; un clic télécharge le fichier."
echo
echo "  CE FICHIER CONTIENT TOUTES LES DONNÉES DU DÉPARTEMENT."
echo "  Rangez-le hors du serveur : Drive, clé USB, disque externe. C'est"
echo "  cette copie-là, et elle seule, qui vous protège de perdre la machine."
echo
echo "  Pour invalider cette adresse (si elle a été vue), relancez ce script :"
echo "  il en engendre une nouvelle et supprime l'ancienne."
echo
