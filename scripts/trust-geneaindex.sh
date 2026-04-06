#!/usr/bin/env bash
# Geneaindex — retirer la quarantaine + re-signer en ad hoc (apps non notarisées).
# À utiliser uniquement si vous faites confiance à l’auteur.
#
# Usage :
#   chmod +x trust-geneaindex.sh
#   ./trust-geneaindex.sh ~/Downloads/Geneaindex-1.0.0-mac-arm64.dmg
#   ./trust-geneaindex.sh /Applications/Geneaindex.app
#
set -uo pipefail

die() { echo "Erreur : $*" >&2; exit 1; }

strip_quarantine() {
  local p="$1"
  echo "→ Retrait des attributs étendus (quarantaine) sur : $p"
  xattr -cr "$p" 2>/dev/null || true
  xattr -rd com.apple.quarantine "$p" 2>/dev/null || true
}

resign_adhoc() {
  local p="$1"
  if ! command -v codesign >/dev/null 2>&1; then
    echo "→ codesign introuvable (installez les outils de ligne de commande Xcode : xcode-select --install)"
    return 0
  fi
  echo "→ Re-signature ad hoc (souvent nécessaire si macOS affiche « damaged »)…"
  if codesign --force --deep --sign - "$p" 2>/dev/null; then
    echo "   OK."
  else
    echo "   Échec — essayez quand même après clic droit → Ouvrir."
  fi
}

[[ "${1:-}" ]] || die "Indiquez le chemin du .dmg ou du .app.
Exemple : $0 /Applications/Geneaindex.app"

TARGET=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
[[ -e "$TARGET" ]] || die "Fichier introuvable : $TARGET"

strip_quarantine "$TARGET"

case "$TARGET" in
*.app)
  resign_adhoc "$TARGET"
  echo ""
  echo "Ensuite :"
  echo "  1. Clic droit sur Geneaindex → Ouvrir → confirmer « Ouvrir » (pas un double-clic)."
  echo "  2. Ou : Réglages Système → Confidentialité et sécurité → chercher « Geneaindex » → Ouvrir quand même."
  echo "  3. Si rien n’apparaît, rouvrez l’app une fois pour déclencher le bouton dans Réglages."
  ;;
*.dmg)
  echo ""
  echo "Étapes :"
  echo "  1. Ouvrez le .dmg, copiez Geneaindex.app dans Applications."
  echo "  2. Relancez : $0 /Applications/Geneaindex.app"
  ;;
*)
  echo ""
  echo "Pour un bundle .app, utilisez le chemin complet se terminant par .app"
  ;;
esac
