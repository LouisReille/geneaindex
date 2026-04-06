#!/usr/bin/env bash
# Geneaindex — retirer la quarantaine macOS (Gatekeeper) sur un .dmg ou .app
# sans certificat Apple Developer. À utiliser uniquement si vous faites confiance à l’auteur.
#
# Usage :
#   chmod +x trust-geneaindex.sh
#   ./trust-geneaindex.sh ~/Downloads/Geneaindex-1.0.0-mac-arm64.dmg
#   ./trust-geneaindex.sh /Applications/Geneaindex.app
#
set -euo pipefail

die() { echo "Erreur : $*" >&2; exit 1; }

[[ "${1:-}" ]] || die "Indiquez le chemin du .dmg ou du .app.
Exemple : $0 \"\$HOME/Downloads/Geneaindex-1.0.0-mac-arm64.dmg\""

TARGET=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
[[ -e "$TARGET" ]] || die "Fichier introuvable : $TARGET"

echo "→ Suppression des attributs étendus (dont com.apple.quarantaine) sur :"
echo "  $TARGET"
xattr -cr "$TARGET" 2>/dev/null || true
xattr -d com.apple.quarantine "$TARGET" 2>/dev/null || true

case "$TARGET" in
*.dmg)
  echo ""
  echo "Étapes suivantes :"
  echo "  1. Ouvrez le .dmg (double-clic)."
  echo "  2. Glissez Geneaindex.app dans le dossier Applications."
  echo "  3. Relancez ce script sur l’app :"
  echo "     $0 /Applications/Geneaindex.app"
  echo ""
  echo "Si macOS affiche encore un avertissement : clic droit sur l’app → Ouvrir → Ouvrir."
  ;;
*.app)
  echo ""
  echo "Terminé. Essayez d’ouvrir l’app (ou clic droit → Ouvrir la première fois)."
  ;;
*)
  echo ""
  echo "Si c’est un dossier .app, passez le chemin complet se terminant par .app"
  ;;
esac
