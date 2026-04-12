#!/usr/bin/env bash
# Crée dist/Geneaindex-mac-avec-lanceur.zip = Geneaindex.app + Lancer-Geneaindex.command
# Prérequis : npm run pack (ou electron-builder --dir)

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

APP=""
for candidate in dist/mac/Geneaindex.app dist/mac-universal/Geneaindex.app dist/mac-arm64/Geneaindex.app dist/mac-x64/Geneaindex.app; do
  if [ -d "$candidate" ]; then
    APP="$candidate"
    break
  fi
done
if [ -z "$APP" ] && [ -d dist ]; then
  APP="$(find dist -path '*/Geneaindex.app' -type d 2>/dev/null | head -1 || true)"
fi

if [ -z "$APP" ]; then
  echo "Geneaindex.app introuvable sous dist/. Lance d’abord : npm run pack"
  exit 1
fi

LANCEUR="$ROOT/scripts/Lancer-Geneaindex.command"
OUT="$ROOT/dist/Geneaindex-mac-avec-lanceur.zip"

chmod +x "$LANCEUR"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cp -R "$APP" "$TMP/Geneaindex.app"
cp "$LANCEUR" "$TMP/Lancer-Geneaindex.command"
chmod +x "$TMP/Lancer-Geneaindex.command"

( cd "$TMP" && zip -r -q "$OUT" Geneaindex.app Lancer-Geneaindex.command )
echo "OK → $OUT"
