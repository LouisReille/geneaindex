# Geneaindex — débloquer les fichiers téléchargés (zone « Internet » / SmartScreen)
# pour une appli non signée par un éditeur reconnu. À utiliser uniquement si vous faites confiance à l’auteur.
#
# Usage (PowerShell) :
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
#   .\trust-geneaindex.ps1 -Path "C:\Users\Vous\Downloads\Geneaindex-1.0.0-win-x64.exe"
#
# Dossier dézippé (tous les fichiers) :
#   .\trust-geneaindex.ps1 -Folder "C:\Chemin\vers\Geneaindex-win32-x64"
#
param(
    [string]$Path = "",
    [string]$Folder = ""
)

$ErrorActionPreference = "Stop"

function Unblock-One {
    param([string]$ItemPath)
    if (-not (Test-Path -LiteralPath $ItemPath)) {
        throw "Introuvable : $ItemPath"
    }
    Unblock-File -LiteralPath $ItemPath
    # Flux Zone.Identifier (complément à Unblock-File selon versions Windows)
    $ads = "$ItemPath`:Zone.Identifier"
    if (Test-Path -LiteralPath $ads) {
        Remove-Item -LiteralPath $ads -Force -ErrorAction SilentlyContinue
    }
}

if ($Folder -ne "") {
    if (-not (Test-Path -LiteralPath $Folder -PathType Container)) {
        throw "Dossier introuvable : $Folder"
    }
    Get-ChildItem -LiteralPath $Folder -Recurse -File | ForEach-Object {
        try {
            Unblock-File -LiteralPath $_.FullName
            $zi = "$($_.FullName)`:Zone.Identifier"
            if (Test-Path -LiteralPath $zi) { Remove-Item -LiteralPath $zi -Force -ErrorAction SilentlyContinue }
        } catch { }
    }
    Write-Host "OK — Fichiers débloqués dans : $Folder"
    exit 0
}

if ($Path -eq "") {
    Write-Host @"
Usage :
  .\trust-geneaindex.ps1 -Path `"chemin\vers\installateur.exe`"
  .\trust-geneaindex.ps1 -Folder `"chemin\vers\dossier_dezippé`"

Exemple :
  .\trust-geneaindex.ps1 -Path `"$env:USERPROFILE\Downloads\Geneaindex-1.0.0-win-x64.exe`"
"@
    exit 1
}

Unblock-One -ItemPath $Path
Write-Host "OK — Fichier débloqué : $Path"
Write-Host "Relancez l’installateur ou l’exécutable. Si SmartScreen bloque encore : « Informations complémentaires » → « Exécuter quand même »."
