#!/bin/bash
# Double-clic dans le Finder : ouvre Geneaindex après retrait de la quarantaine (app non signée).
# Prérequis : Geneaindex.app doit être dans Applications, ou dans le même dossier que ce fichier.
#
# Si macOS affiche encore un avertissement : fermer, puis clic droit sur Geneaindex.app → Ouvrir.

set +e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP=""

if [ -d "/Applications/Geneaindex.app" ]; then
  APP="/Applications/Geneaindex.app"
elif [ -d "$SCRIPT_DIR/Geneaindex.app" ]; then
  APP="$SCRIPT_DIR/Geneaindex.app"
else
  osascript -e 'display dialog "Geneaindex.app introuvable.\n\nCopiez Geneaindex.app dans le dossier Applications, ou placez-le à côté de ce fichier (.command)." buttons {"OK"} default button "OK" with title "Geneaindex"' 2>/dev/null
  echo "Geneaindex.app introuvable (Applications ou dossier du script)." >&2
  exit 1
fi

echo "→ Nettoyage quarantaine : $APP"
xattr -cr "$APP" 2>/dev/null
xattr -rd com.apple.quarantine "$APP" 2>/dev/null

if command -v codesign >/dev/null 2>&1; then
  echo "→ Re-signature ad hoc…"
  codesign --force --deep --sign - "$APP" 2>/dev/null
fi

echo "→ Lancement…"
open "$APP"
exit 0
