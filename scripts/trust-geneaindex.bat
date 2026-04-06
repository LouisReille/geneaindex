@echo off
REM Lance le script PowerShell (double-clic possible si l'exécution de scripts est restreinte)
set SCRIPT=%~dp0trust-geneaindex.ps1
if "%~1"=="" (
  echo Usage: glissez l'exe ou le dossier dezippé sur ce fichier, ou :
  echo   trust-geneaindex.bat "C:\...\Geneaindex-1.0.0-win-x64.exe"
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" -Path "%~1"
