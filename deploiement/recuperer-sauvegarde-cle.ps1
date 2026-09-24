# Récupère chaque jour la dernière sauvegarde du SID sur le PC du Délégué, et
# en dépose une copie dans son Google Drive.
#
# Pourquoi. Les sauvegardes du script 05 vivent sur le serveur qu'elles
# sauvegardent : si le serveur disparaît (septembre 2026 : un paiement qui ne
# passe pas), elles disparaissent avec lui. Il faut une copie AILLEURS — deux,
# même : ce PC, et le Drive.
#
# Comment. Par SSH avec la clé ~/.ssh/sid_hostkey_sauvegarde, que le serveur
# n'accepte que pour lire ses sauvegardes (deploiement/10-acces-sauvegarde.sh) :
# aucun mot de passe, aucune question, rien d'autre de possible. Le fichier
# copié est comparé à l'empreinte SHA-256 calculée par le serveur : une copie
# tronquée est jetée, jamais gardée.
#
# Le Drive. Aucun compte Google ici : si l'application « Google Drive pour
# ordinateur » est installée, elle présente « Mon Drive » comme un disque ; le
# script y écrit, et c'est elle qui envoie le fichier dans le nuage.
#
# Lancé chaque jour par la tâche Windows « Sauvegarde SID ». À la main :
#
#   powershell -File recuperer-sauvegarde-cle.ps1
#
# Compte rendu de chaque passage : Documents\Sauvegardes SID\journal.txt

param(
  [string]$Serveur = "148.135.184.95",
  [string]$Cle = "$env:USERPROFILE\.ssh\sid_hostkey_sauvegarde",
  [string]$Local = "$env:USERPROFILE\Documents\Sauvegardes SID",
  [int]$Conserver = 30
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $Local | Out-Null
$journal = Join-Path $Local "journal.txt"

function Noter([string]$message) {
  $ligne = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm"), $message
  Write-Host "  $message"
  Add-Content -Path $journal -Value $ligne -Encoding UTF8
}

$ssh = "$env:SystemRoot\System32\OpenSSH\ssh.exe"
$options = @("-i", $Cle, "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes", "-o", "ConnectTimeout=30", "root@$Serveur")

function Demander([string]$commande) {
  $sortie = & $ssh @options $commande 2>&1
  if ($LASTEXITCODE -ne 0) { throw "le serveur ne répond pas à « $commande » : $sortie" }
  return ($sortie | Out-String).Trim()
}

# Le fichier arrive par la sortie de ssh. PowerShell 5 transforme en texte ce
# qu'il reçoit d'un programme : on lit donc le flux brut, octet pour octet.
function Telecharger([string]$nom, [string]$cible) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $ssh
  $psi.Arguments = "-i `"$Cle`" -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=30 root@$Serveur envoyer $nom"
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $processus = [System.Diagnostics.Process]::Start($psi)
  $erreurs = $processus.StandardError.ReadToEndAsync()
  $fichier = [System.IO.File]::Create($cible)
  try { $processus.StandardOutput.BaseStream.CopyTo($fichier) } finally { $fichier.Close() }
  $processus.WaitForExit()
  if ($processus.ExitCode -ne 0) { throw "copie interrompue : $($erreurs.Result)" }
}

# Google Drive pour ordinateur : « Mon Drive » (ou « My Drive ») à la racine
# d'un disque virtuel, en général G:.
function DossierDrive() {
  foreach ($disque in Get-PSDrive -PSProvider FileSystem) {
    foreach ($nom in "Mon Drive", "My Drive") {
      $racine = Join-Path $disque.Root $nom
      if (Test-Path $racine) { return (Join-Path $racine "Sauvegardes SID") }
    }
  }
  foreach ($chemin in "$env:USERPROFILE\Google Drive", "$env:USERPROFILE\Mon Drive", "$env:USERPROFILE\My Drive") {
    if (Test-Path $chemin) { return (Join-Path $chemin "Sauvegardes SID") }
  }
  return $null
}

function Elaguer([string]$dossier) {
  Get-ChildItem $dossier -Filter "sid_*.sql.gz" | Sort-Object Name -Descending |
    Select-Object -Skip $Conserver | ForEach-Object { Remove-Item $_.FullName }
}

try {
  $etat = Demander "etat"
  if ($etat -like "*CHEC*") { Noter "ATTENTION — la dernière sauvegarde du SERVEUR a échoué : $etat" }

  $nom = Demander "derniere"
  if ($nom -notmatch '^sid_[0-9A-Za-z_-]+\.sql\.gz$') { throw "aucune sauvegarde sur le serveur ($nom)" }
  $cible = Join-Path $Local $nom

  if (Test-Path $cible) {
    Noter "déjà sur ce PC : $nom"
  } else {
    $attendu = Demander "empreinte $nom"
    $partiel = "$cible.partiel"
    Telecharger $nom $partiel
    $obtenu = (Get-FileHash $partiel -Algorithm SHA256).Hash.ToLower()
    if ($obtenu -ne $attendu.ToLower()) {
      Remove-Item $partiel
      throw "copie de $nom abîmée (empreinte différente) : jetée, nouvel essai au prochain passage"
    }
    Move-Item $partiel $cible
    Noter ("copiée et contrôlée sur ce PC : {0} ({1} Ko)" -f $nom, [math]::Round((Get-Item $cible).Length / 1KB))
  }
  Elaguer $Local

  $drive = DossierDrive
  if ($drive) {
    New-Item -ItemType Directory -Force -Path $drive | Out-Null
    $copie = Join-Path $drive $nom
    if (-not (Test-Path $copie)) {
      Copy-Item $cible $copie
      Noter "déposée dans Google Drive : $copie"
    }
    Elaguer $drive
  } else {
    Noter "Google Drive pour ordinateur absent de ce PC : copie gardée sur le PC seulement."
  }
  exit 0
} catch {
  Noter "ÉCHEC — $($_.Exception.Message)"
  exit 1
}
