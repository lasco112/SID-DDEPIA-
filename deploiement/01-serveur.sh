#!/usr/bin/env bash
#
# 01 — Sécuriser le serveur avant d'y mettre quoi que ce soit.
#
# Un serveur neuf exposé à Internet reçoit des tentatives de connexion dans
# l'heure qui suit. On ferme d'abord, on installe ensuite.
#
#   ./01-serveur.sh
#
set -euo pipefail

echo
echo "  01 — Sécurisation du serveur"
echo

if [ "$(id -u)" -ne 0 ]; then
  echo "  Ce script doit être lancé en root." >&2
  exit 1
fi

# --- Mises à jour -----------------------------------------------------------
echo "  → Mise à jour du système"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq

echo "  → Outils de base"
apt-get install -y -qq curl ca-certificates gnupg ufw fail2ban unattended-upgrades

# --- Mises à jour de sécurité automatiques ----------------------------------
# Un serveur qu'on n'entretient pas devient vulnérable en quelques mois. Les
# correctifs de sécurité s'appliquent seuls ; les autres non, pour éviter
# qu'une mise à jour majeure casse le service sans prévenir.
echo "  → Mises à jour de sécurité automatiques"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

# --- Mémoire d'échange ------------------------------------------------------
# PostgreSQL et Node ensemble peuvent dépasser la mémoire lors d'un pic. Sans
# échange, le système tue l'un des deux — en général la base, au pire moment.
#
# La taille se règle sur la mémoire de la machine. Sur un petit serveur (2 Go),
# `npm run build` de Next.js demande à lui seul plus que la mémoire physique :
# 2 Go d'échange ne suffisent pas, la compilation est tuée en cours de route.
# Sur une machine plus grande, 2 Go restent le filet suffisant.
MO=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$MO" -lt 3072 ]; then TAILLE=4; else TAILLE=2; fi

ACTUEL=$(awk '/^\/swapfile/ {print int($3/1024/1024)}' /proc/swaps 2>/dev/null | head -1)
ACTUEL=${ACTUEL:-0}

if [ "$ACTUEL" -lt "$TAILLE" ]; then
  echo "  → Fichier d'échange de ${TAILLE} Go (mémoire physique : ${MO} Mo)"
  swapoff /swapfile 2>/dev/null || true
  rm -f /swapfile
  # fallocate échoue sur certains systèmes de fichiers ; dd est plus lent mais
  # fonctionne partout. On ne veut pas d'un serveur sans échange parce que la
  # méthode rapide n'était pas disponible.
  fallocate -l "${TAILLE}G" /swapfile 2>/dev/null \
    || dd if=/dev/zero of=/swapfile bs=1M count=$((TAILLE*1024)) status=none
  chmod 600 /swapfile
  mkswap -q /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
else
  echo "  → Fichier d'échange déjà à ${ACTUEL} Go"
fi

# L'échange est un filet, pas un lieu de séjour : on ne veut y descendre que
# sous pression réelle, sinon les pages de PostgreSQL y migrent et la base
# ralentit sans raison.
if ! grep -q '^vm.swappiness' /etc/sysctl.d/99-sid.conf 2>/dev/null; then
  echo 'vm.swappiness=10' >> /etc/sysctl.d/99-sid.conf
  sysctl -q -p /etc/sysctl.d/99-sid.conf 2>/dev/null || true
fi

# --- Pare-feu ---------------------------------------------------------------
# Tout est fermé sauf le strict nécessaire. PostgreSQL (5432) n'est PAS ouvert :
# la base n'a aucune raison d'être joignable depuis Internet, l'application
# tourne sur la même machine.
echo "  → Pare-feu : seuls SSH, HTTP et HTTPS"
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp  comment 'SSH' >/dev/null
ufw allow 80/tcp  comment 'HTTP (redirection vers HTTPS)' >/dev/null
ufw allow 443/tcp comment 'HTTPS' >/dev/null
ufw --force enable >/dev/null

# --- Protection contre les tentatives répétées ------------------------------
echo "  → fail2ban sur SSH"
cat > /etc/fail2ban/jail.local <<'EOF'
[sshd]
enabled = true
maxretry = 5
bantime = 3600
findtime = 600
EOF
systemctl enable --now fail2ban >/dev/null 2>&1

# --- SSH --------------------------------------------------------------------
# On ne coupe PAS l'authentification par mot de passe ici : si vous n'avez pas
# encore déposé votre clé, vous vous enfermeriez dehors. Le script vous dit
# comment le faire, et vous le ferez quand votre clé sera en place.
echo "  → SSH : connexion root par mot de passe conservée POUR L'INSTANT"
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config
systemctl reload ssh 2>/dev/null || systemctl reload sshd

echo
echo "  ✔ Serveur sécurisé"
echo
echo "  À FAIRE DÈS QUE POSSIBLE — passer à la connexion par clé :"
echo
echo "    1. Depuis votre ThinkPad, si vous n'avez pas encore de clé :"
echo "         ssh-keygen -t ed25519"
echo "    2. Envoyez-la sur le serveur :"
echo "         type \$env:USERPROFILE\\.ssh\\id_ed25519.pub | ssh root@IP \"cat >> ~/.ssh/authorized_keys\""
echo "    3. Vérifiez que « ssh root@IP » entre SANS mot de passe."
echo "    4. ALORS SEULEMENT, sur le serveur :"
echo "         sed -i 's/^#\\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config"
echo "         systemctl reload ssh"
echo
echo "  Ne faites l'étape 4 qu'après avoir vérifié l'étape 3, sinon vous"
echo "  perdez l'accès au serveur."
echo
echo "  Suite :  ./02-postgres.sh"
echo
