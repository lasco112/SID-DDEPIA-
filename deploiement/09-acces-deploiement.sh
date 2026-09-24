#!/usr/bin/env bash
#
# 09 — Autoriser UNE clé à mettre le SID à jour, et à rien d'autre.
#
# Pour que l'assistant du Délégué puisse déployer SUR SON ORDRE, sans jamais
# recevoir de mot de passe : une clé SSH dont la partie secrète reste sur le
# PC du Délégué, et que le serveur n'accepte que pour trois commandes :
#
#   etat            la version en service, le site répond-il, la dernière sauvegarde
#   mettre-a-jour   sauvegarde de la base, PUIS 08-mettre-a-jour.sh
#   journal         les 80 dernières lignes du journal du SID
#
# Pas de terminal, pas de transfert, pas de copie de fichiers : la clé ne
# peut ni lire les données, ni ouvrir une session. Pour la retirer, effacer
# sa ligne dans /root/.ssh/authorized_keys.
#
#   bash 09-acces-deploiement.sh "ssh-ed25519 AAAA… claude-deploiement-sid"
#
set -euo pipefail

CLE="${1:?Donnez la clé publique entre guillemets.}"
[ "$(id -u)" -eq 0 ] || { echo "À lancer en root." >&2; exit 1; }

cat > /usr/local/bin/sid-deployer <<'SCRIPT'
#!/usr/bin/env bash
# La SEULE commande que la clé de déploiement peut lancer (voir 09-acces-deploiement.sh).
set -euo pipefail
case "${SSH_ORIGINAL_COMMAND:-}" in
  etat)
    cd /opt/sid
    echo "Version en service : $(git rev-parse --short HEAD) — $(git log -1 --format='%s (%cr)')"
    echo "Service : $(systemctl is-active sid)"
    curl -fsS -o /dev/null -w "Réponse du site : %{http_code}\n" http://localhost:3000/ || echo "Le site ne répond pas."
    cat /var/sauvegardes-sid/derniere-sauvegarde.txt 2>/dev/null || echo "Aucune sauvegarde trouvée."
    ;;
  mettre-a-jour)
    logger -t sid-deployer "mise à jour demandée par la clé de déploiement"
    # Jamais de mise à jour sans une sauvegarde fraîche : une migration ratée
    # doit pouvoir se défaire.
    if ! command -v sauvegarder-sid >/dev/null; then
      echo "  ✖ Script de sauvegarde absent (05-sauvegarde.sh) : mise à jour refusée."
      exit 1
    fi
    echo "  → Sauvegarde de la base avant mise à jour"
    sauvegarder-sid
    cat /var/sauvegardes-sid/derniere-sauvegarde.txt
    bash /opt/sid/deploiement/08-mettre-a-jour.sh
    ;;
  journal)
    journalctl -u sid -n 80 --no-pager
    ;;
  *)
    echo "Commande non autorisée. Autorisées : etat, mettre-a-jour, journal."
    exit 1
    ;;
esac
SCRIPT
chmod 755 /usr/local/bin/sid-deployer

mkdir -p /root/.ssh && chmod 700 /root/.ssh
touch /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys
# La clé n'est ajoutée qu'une fois, et TOUJOURS avec ses restrictions.
if ! grep -qF "$CLE" /root/.ssh/authorized_keys; then
  echo "command=\"/usr/local/bin/sid-deployer\",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty $CLE" >> /root/.ssh/authorized_keys
fi
echo "  ✔ Clé de déploiement autorisée — pour : etat, mettre-a-jour, journal."
