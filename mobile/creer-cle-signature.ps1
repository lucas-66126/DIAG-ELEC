# DIAG-MAINT — création de la clé de signature de l'application Android (à faire UNE SEULE FOIS).
#
# Ce script, lancé par toi dans ta propre fenêtre PowerShell :
#   1. te demande un mot de passe (tapé par toi, jamais affiché ni enregistré en clair) ;
#   2. crée la clé dans Documents\DIAG-MAINT\cle-signature\ (hors du dépôt GitHub) ;
#   3. l'enregistre dans les secrets du dépôt GitHub, pour que GitHub puisse signer l'application ;
#   4. relance la fabrication : le fichier .aab pour le Play Store sera prêt quelques minutes après.
#
# Sans cette clé et son mot de passe, plus aucune mise à jour de l'application ne peut être publiée :
# garde une copie du dossier cle-signature sur une clé USB et note le mot de passe en lieu sûr.

param([switch]$Essai, [string]$Dossier)

# (« Continue » : OpenSSL écrit sa progression sur la sortie d'erreur ; chaque étape vérifie son code de retour)
$ErrorActionPreference = 'Continue'
$repo = 'lucas-66126/DIAG-ELEC'
$alias = 'diagmaint'
$openssl = 'C:\Program Files\Git\mingw64\bin\openssl.exe'
if (-not (Test-Path $openssl)) { $openssl = 'C:\Program Files\Git\usr\bin\openssl.exe' }
if (-not (Test-Path $openssl)) { throw "OpenSSL introuvable (il est normalement installé avec Git)." }
if (-not $Dossier) { $Dossier = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'DIAG-MAINT\cle-signature' }
$fichier = Join-Path $Dossier 'diag-maint-cle-envoi.p12'

Write-Host ''
Write-Host 'DIAG-MAINT — création de la clé de signature' -ForegroundColor Yellow
Write-Host "La clé sera enregistrée dans : $fichier"
Write-Host ''

if (Test-Path $fichier) {
  Write-Host 'Une clé existe déjà à cet endroit. Je ne la remplace pas : elle doit rester la même pour toutes les mises à jour.' -ForegroundColor Red
  exit 1
}
if (-not $Essai) {
  gh auth status 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "GitHub CLI n'est pas connecté : lance d'abord « gh auth login »." }
}

# --- mot de passe (tapé deux fois, jamais affiché) ---
function Lire-MotDePasse {
  for (;;) {
    $a = Read-Host 'Choisis un mot de passe pour la clé (12 caractères minimum)' -AsSecureString
    $b = Read-Host 'Tape-le une deuxième fois' -AsSecureString
    $pa = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($a))
    $pb = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($b))
    if ($pa -ne $pb) { Write-Host 'Les deux saisies sont différentes, recommence.' -ForegroundColor Red; continue }
    if ($pa.Length -lt 12) { Write-Host 'Trop court : 12 caractères minimum.' -ForegroundColor Red; continue }
    return $pa
  }
}
if ($Essai) { $motDePasse = 'essai-mot-de-passe-1234' } else { $motDePasse = Lire-MotDePasse }

# --- création de la clé (le mot de passe passe par une variable d'environnement, jamais en ligne de commande) ---
New-Item -ItemType Directory -Force $Dossier | Out-Null
$tmp = Join-Path $env:TEMP ('diagmaint-cle-' + [guid]::NewGuid())
New-Item -ItemType Directory $tmp | Out-Null
try {
  $env:DIAGMAINT_PASS = $motDePasse
  & $openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:4096 -out "$tmp\cle.pem" 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'Création de la clé impossible.' }
  & $openssl req -new -x509 -key "$tmp\cle.pem" -out "$tmp\certificat.pem" -days 10000 -subj '/CN=DIAG-MAINT/O=DIAG-MAINT' 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'Création du certificat impossible.' }
  & $openssl pkcs12 -export -inkey "$tmp\cle.pem" -in "$tmp\certificat.pem" -name $alias -out $fichier -passout env:DIAGMAINT_PASS
  if ($LASTEXITCODE -ne 0) { throw 'Création du fichier de clé impossible.' }
  $empreinte = (& $openssl x509 -in "$tmp\certificat.pem" -noout -fingerprint -sha256) -replace '^.*=', ''
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
  Remove-Item Env:\DIAGMAINT_PASS -ErrorAction SilentlyContinue
}

@"
DIAG-MAINT — clé de signature de l'application Android (clé d'envoi Play Store)
Créée le : $(Get-Date -Format 'dd/MM/yyyy HH:mm')
Fichier : diag-maint-cle-envoi.p12
Nom de la clé (alias) : $alias
Empreinte SHA-256 du certificat : $empreinte

Le mot de passe n'est écrit nulle part ici. Note-le en lieu sûr.
Garde une copie de ce dossier sur une clé USB : sans ce fichier et son mot de passe,
plus aucune mise à jour de l'application ne pourra être publiée.
"@ | Out-File -Encoding utf8 (Join-Path $Dossier 'A-LIRE.txt')

Write-Host ''
Write-Host "Clé créée : $fichier" -ForegroundColor Green
Write-Host "Empreinte SHA-256 : $empreinte"

if ($Essai) { Write-Host '(mode essai : rien n''est envoyé à GitHub)'; exit 0 }

# --- enregistrement dans les secrets du dépôt GitHub (jamais affichés) ---
Write-Host ''
Write-Host 'Enregistrement dans les secrets du dépôt GitHub…'
$base64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($fichier))
$ok = $true
gh secret set DIAGMAINT_KEYSTORE_BASE64 --repo $repo --body $base64; if ($LASTEXITCODE -ne 0) { $ok = $false }
gh secret set DIAGMAINT_KEYSTORE_PASSWORD --repo $repo --body $motDePasse; if ($LASTEXITCODE -ne 0) { $ok = $false }
gh secret set DIAGMAINT_KEY_PASSWORD --repo $repo --body $motDePasse; if ($LASTEXITCODE -ne 0) { $ok = $false }
gh secret set DIAGMAINT_KEY_ALIAS --repo $repo --body $alias; if ($LASTEXITCODE -ne 0) { $ok = $false }
$motDePasse = $null; $base64 = $null
if (-not $ok) { throw "L'enregistrement des secrets a échoué. La clé est bien créée : relance seulement l'enregistrement avec moi." }

Write-Host 'Relance de la fabrication de l''application…'
gh workflow run android.yml --repo $repo --ref main
Write-Host ''
Write-Host 'C''est fait. Le fichier pour le Play Store sera prêt dans 5 à 10 minutes.' -ForegroundColor Green
Write-Host 'Pense à copier le dossier cle-signature sur une clé USB et à noter ton mot de passe en lieu sûr.' -ForegroundColor Yellow
