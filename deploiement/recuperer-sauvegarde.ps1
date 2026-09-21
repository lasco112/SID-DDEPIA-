# Récupère la dernière sauvegarde du serveur sur votre ThinkPad.
#
# À lancer une fois par semaine au minimum. C'est LA copie qui vous protège
# vraiment : celles qui restent sur le serveur disparaissent avec lui.
#
#   .\recuperer-sauvegarde.ps1 -Serveur 1.2.3.4
#
# Pour ne plus y penser, voir tout en bas : Windows peut le faire seul.

param(
  [Parameter(Mandatory = $true)][string]$Serveur,
  [string]$Utilisateur = "root",
  [string]$Destination = "$env:USERPROFILE\sauvegardes-sid",
  [int]$Conserver = 10
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  Récupération de la sauvegarde du SID"
Write-Host "  serveur : $Serveur"
Write-Host ""

New-Item -ItemType Directory -Force -Path $Destination | Out-Null

# On demande au serveur quel est son fichier le plus récent, plutôt que de le
# deviner à partir de la date : si une sauvegarde a échoué cette nuit, on veut
# la dernière VALIDE, pas un fichier inexistant.
$dernier = ssh "$Utilisateur@$Serveur" "ls -t /var/sauvegardes-sid/sid_*.sql.gz 2>/dev/null | head -1"
if (-not $dernier) {
  Write-Host "  FAUTE   aucune sauvegarde trouvée sur le serveur." -ForegroundColor Red
  Write-Host "          Vérifiez :  systemctl status sauvegarde-sid.timer"
  exit 1
}

$nom = Split-Path $dernier -Leaf
$cible = Join-Path $Destination $nom

if (Test-Path $cible) {
  Write-Host "  ok      déjà récupérée : $nom"
} else {
  Write-Host "  → copie de $nom"
  scp "$Utilisateur@${Serveur}:$dernier" $cible
  $ko = [math]::Round((Get-Item $cible).Length / 1KB, 0)
  Write-Host "  ok      $nom  ($ko Ko)"
}

# L'état que le serveur a écrit après sa dernière tentative : il dit si la
# sauvegarde de cette nuit a réussi, pas seulement si un vieux fichier existe.
$etat = ssh "$Utilisateur@$Serveur" "cat /var/sauvegardes-sid/derniere-sauvegarde.txt 2>/dev/null"
Write-Host "  état du serveur : $etat"
if ($etat -like "ÉCHEC*") {
  Write-Host "  FAUTE   la dernière sauvegarde du serveur a ÉCHOUÉ." -ForegroundColor Red
}

# On ne garde pas tout indéfiniment : dix copies suffisent, et le disque du
# portable n'est pas extensible.
$vieilles = Get-ChildItem $Destination -Filter "sid_*.sql.gz" |
            Sort-Object LastWriteTime -Descending | Select-Object -Skip $Conserver
foreach ($v in $vieilles) { Remove-Item $v.FullName }

$total = (Get-ChildItem $Destination -Filter "sid_*.sql.gz").Count
Write-Host ""
Write-Host "  $total sauvegarde(s) dans $Destination"
Write-Host ""
Write-Host "  ET METTEZ-EN UNE SUR UNE CLÉ USB." -ForegroundColor Yellow
Write-Host "  Votre portable peut tomber en panne comme un serveur."
Write-Host ""

# ---------------------------------------------------------------------------
# Pour que Windows le fasse tout seul, chaque lundi à 9 h — une seule commande,
# à lancer une fois dans un PowerShell ADMINISTRATEUR :
#
#   $a = New-ScheduledTaskAction -Execute "powershell.exe" `
#          -Argument "-File `"$PWD\recuperer-sauvegarde.ps1`" -Serveur VOTRE_IP"
#   $d = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 9am
#   Register-ScheduledTask -TaskName "Sauvegarde SID" -Action $a -Trigger $d
#
# Cela suppose que la connexion SSH se fasse par clé, sans mot de passe.
# ---------------------------------------------------------------------------
