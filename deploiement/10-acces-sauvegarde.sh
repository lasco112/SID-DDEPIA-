#!/usr/bin/env bash
#
# 10 - Autoriser UNE cle a telecharger les sauvegardes, et a rien d'autre.
#
# Les sauvegardes du script 05 restent sur le serveur : elles disparaissent
# avec lui. Le PC du Delegue les recupere donc chaque jour (tache Windows
# "Sauvegarde SID", deploiement/recuperer-sauvegarde-cle.ps1) et en depose
# une copie dans son Google Drive.
#
# Cette cle est DISTINCTE de celle du deploiement (09) : elle ne peut ni
# mettre a jour, ni ouvrir une session, ni rien ecrire. Quatre commandes :
#
#   derniere         le nom de la sauvegarde la plus recente
#   etat             le compte rendu de la derniere sauvegarde
#   empreinte NOM    l'empreinte SHA-256 du fichier (controle apres copie)
#   envoyer NOM      le fichier lui-meme
#
# ASCII seulement : le script est envoye par un tube PowerShell, qui abime
# les accents.
#
#   bash 10-acces-sauvegarde.sh "ssh-ed25519 AAAA... sid-sauvegarde-pc"
#
set -euo pipefail

CLE="${1:?Donnez la cle publique entre guillemets.}"
[ "$(id -u)" -eq 0 ] || { echo "A lancer en root." >&2; exit 1; }

cat > /usr/local/bin/sid-sauvegarde-sortie <<'SCRIPT'
#!/usr/bin/env bash
# La SEULE commande que la cle de sauvegarde peut lancer (voir 10-acces-sauvegarde.sh).
set -euo pipefail
DOSSIER=/var/sauvegardes-sid
set -f
set -- ${SSH_ORIGINAL_COMMAND:-}
set +f
case "${1:-}" in
  derniere)
    ls -1t "$DOSSIER"/sid_*.sql.gz 2>/dev/null | head -1 | xargs -r basename
    ;;
  etat)
    cat "$DOSSIER/derniere-sauvegarde.txt" 2>/dev/null || echo "Aucune sauvegarde trouvee."
    ;;
  empreinte|envoyer)
    NOM="${2:-}"
    # Un nom de sauvegarde, rien d'autre : aucun chemin, aucun autre fichier.
    if ! [[ "$NOM" =~ ^sid_[0-9A-Za-z_-]+\.sql\.gz$ ]] || [ ! -f "$DOSSIER/$NOM" ]; then
      echo "Sauvegarde inconnue." >&2
      exit 1
    fi
    logger -t sid-sauvegarde "$1 $NOM demande par la cle de sauvegarde"
    if [ "$1" = empreinte ]; then
      sha256sum "$DOSSIER/$NOM" | cut -d' ' -f1
    else
      cat "$DOSSIER/$NOM"
    fi
    ;;
  *)
    echo "Commande non autorisee. Autorisees : derniere, etat, empreinte NOM, envoyer NOM." >&2
    exit 1
    ;;
esac
SCRIPT
chmod 755 /usr/local/bin/sid-sauvegarde-sortie

mkdir -p /root/.ssh && chmod 700 /root/.ssh
touch /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys
if ! grep -qF "$CLE" /root/.ssh/authorized_keys; then
  echo "command=\"/usr/local/bin/sid-sauvegarde-sortie\",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty $CLE" >> /root/.ssh/authorized_keys
fi
echo "  OK - Cle de sauvegarde autorisee - pour : derniere, etat, empreinte, envoyer."
