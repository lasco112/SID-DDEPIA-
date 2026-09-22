#!/usr/bin/env bash
#
# 99 — Le serveur est-il en état de servir six arrondissements ?
#
# À lancer après l'installation, et de temps en temps ensuite. Il ne répare
# rien : il constate, et dit ce qui manque.
#
#   ./99-verifier.sh
#
set -uo pipefail   # pas de -e : on veut voir TOUS les défauts, pas le premier

ok=0; faute=0
dire() {
  if [ "$1" = "ok" ]; then echo "  ok      $2"; ok=$((ok+1));
  else echo "  FAUTE   $2"; faute=$((faute+1)); fi
}

echo
echo "  Vérification du serveur SID"

# --- Le service -------------------------------------------------------------
echo
echo "  L'application"
systemctl is-active --quiet sid \
  && dire ok "elle tourne" \
  || dire non "elle est arrêtée — journalctl -u sid -n 50"
systemctl is-enabled --quiet sid \
  && dire ok "elle redémarrera avec la machine" \
  || dire non "elle ne redémarrera PAS après un redémarrage du serveur"

CODE=$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:3000 2>/dev/null || echo "000")
[ "$CODE" = "200" ] || [ "$CODE" = "307" ] || [ "$CODE" = "302" ] \
  && dire ok "elle répond (code ${CODE})" \
  || dire non "elle ne répond pas (code ${CODE})"

# --- Le pare-feu ------------------------------------------------------------
echo
echo "  Le pare-feu"
ufw status | grep -q "Status: active" \
  && dire ok "il est actif" \
  || dire non "il est INACTIF — le serveur est exposé"

# Le point qui compte : la base ne doit être joignable QUE depuis la machine.
if ss -lntp 2>/dev/null | grep -q '0.0.0.0:5432\|:::5432'; then
  dire non "PostgreSQL écoute sur Internet — corrigez listen_addresses"
else
  dire ok "PostgreSQL n'écoute que localement"
fi
ufw status | grep -q "5432" \
  && dire non "le port 5432 est ouvert au pare-feu, il ne devrait pas l'être" \
  || dire ok "le port de la base n'est pas ouvert"

# --- Le cloisonnement -------------------------------------------------------
echo
echo "  Le cloisonnement de la base"
SUPER=$(sudo -u postgres psql -tAc "SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname='sid_app'" 2>/dev/null || echo "?")
case "$SUPER" in
  f) dire ok "le rôle applicatif n'est ni superutilisateur ni BYPASSRLS" ;;
  t) dire non "le rôle applicatif CONTOURNE les politiques — cloisonnement illusoire" ;;
  *) dire non "rôle sid_app introuvable" ;;
esac

POLITIQUES=$(sudo -u postgres psql -tAc "SELECT count(*) FROM pg_policies WHERE schemaname='public'" -d sid_menoua 2>/dev/null || echo 0)
[ "$POLITIQUES" -ge 19 ] \
  && dire ok "les politiques par département sont posées (${POLITIQUES})" \
  || dire non "seulement ${POLITIQUES} politique(s) — attendu au moins 19"

# --- Le certificat ----------------------------------------------------------
echo
echo "  Le certificat"
if [ -d /etc/letsencrypt/live ] && [ -n "$(ls -A /etc/letsencrypt/live 2>/dev/null)" ]; then
  DOM=$(ls /etc/letsencrypt/live | head -1)
  FIN=$(openssl x509 -enddate -noout -in "/etc/letsencrypt/live/${DOM}/cert.pem" 2>/dev/null | cut -d= -f2)
  JOURS=$(( ($(date -d "$FIN" +%s) - $(date +%s)) / 86400 ))
  [ "$JOURS" -gt 20 ] \
    && dire ok "valide encore ${JOURS} jours (${DOM})" \
    || dire non "expire dans ${JOURS} jours — vérifiez certbot.timer"
  systemctl is-enabled --quiet certbot.timer 2>/dev/null \
    && dire ok "renouvellement automatique armé" \
    || dire non "renouvellement automatique NON armé"
else
  dire non "aucun certificat — le service tourne en clair"
fi

# --- La sauvegarde ----------------------------------------------------------
echo
echo "  La sauvegarde"
systemctl is-enabled --quiet sauvegarde-sid.timer 2>/dev/null \
  && dire ok "la minuterie quotidienne est armée" \
  || dire non "AUCUNE sauvegarde automatique"

ETAT="/var/sauvegardes-sid/derniere-sauvegarde.txt"
if [ -f "$ETAT" ]; then
  if grep -q '^OK' "$ETAT"; then
    dire ok "$(cat "$ETAT")"
  else
    dire non "$(cat "$ETAT")"
  fi
  RECENT=$(find /var/sauvegardes-sid -name 'sid_*.sql.gz' -mtime -2 | head -1)
  [ -n "$RECENT" ] \
    && dire ok "une sauvegarde de moins de deux jours existe" \
    || dire non "aucune sauvegarde récente — la plus fraîche a plus de deux jours"
else
  dire non "aucune sauvegarde n'a jamais été faite"
fi

# --- La mémoire -------------------------------------------------------------
# Sur un petit serveur, c'est la mémoire qui lâche en premier, et elle lâche
# brutalement : le noyau tue l'application sans prévenir. Mieux vaut l'apprendre
# ici, un jour calme, qu'un mardi de fin de trimestre.
echo
echo "  La mémoire"
TOTAL_MO=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
DISPO_MO=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
SWAP_MO=$(awk '/SwapTotal/ {print int($2/1024)}' /proc/meminfo)

# En Go avec une décimale : la division entière affichait « 3 Go » pour un
# échange de 4 Go (4095 Mo / 1024 = 3), ce qui faisait douter d'un script qui
# avait pourtant bien travaillé.
SWAP_GO=$(awk -v m="$SWAP_MO" 'BEGIN{printf "%.1f", m/1024}')
[ "$SWAP_MO" -ge 2048 ] \
  && dire ok "fichier d'échange de ${SWAP_GO} Go" \
  || dire non "échange insuffisant (${SWAP_MO} Mo) — relancez ./01-serveur.sh"

# Moins d'un quart de la mémoire disponible, c'est la zone où un rendu de
# rapport peut faire basculer la machine.
SEUIL=$((TOTAL_MO / 4))
[ "$DISPO_MO" -gt "$SEUIL" ] \
  && dire ok "${DISPO_MO} Mo disponibles sur ${TOTAL_MO} Mo" \
  || dire non "plus que ${DISPO_MO} Mo disponibles sur ${TOTAL_MO} — il est temps d'agrandir le serveur"

# La preuve, et non la supposition : le noyau a-t-il DÉJÀ tué quelque chose ?
TUES=$(journalctl -k --since "7 days ago" 2>/dev/null | grep -c "Out of memory: Killed" || true)
[ "${TUES:-0}" -eq 0 ] \
  && dire ok "aucun processus tué par manque de mémoire en 7 jours" \
  || dire non "${TUES} processus tué(s) par manque de mémoire cette semaine — passez à une formule supérieure"

# --- Conclusion -------------------------------------------------------------
echo
echo "  ─────────────────────────────────────────"
echo "  ${ok} correct(s), ${faute} à corriger"
if [ "$faute" -gt 0 ]; then
  echo
  echo "  Ne confiez pas le service aux arrondissements avant d'avoir corrigé"
  echo "  ce qui précède."
  exit 1
fi
echo
echo "  Le serveur est en état. Dernier point, qui ne se vérifie pas d'ici :"
echo "  AVEZ-VOUS UNE COPIE DE LA SAUVEGARDE AILLEURS QUE SUR CE SERVEUR ?"
echo
