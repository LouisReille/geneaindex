#!/bin/bash
# Enlève la quarantaine puis lance Geneaindex.
# À placer dans le même dossier que Geneaindex.app (ex. dans le zip à distribuer).

cd "$(dirname "$0")"
APP_NAME="Geneaindex.app"

if [ ! -d "$APP_NAME" ]; then
  echo "Geneaindex.app introuvable dans ce dossier."
  echo "Placez ce script dans le même dossier que Geneaindex.app."
  read -p "Appuyez sur Entrée pour fermer."
  exit 1
fi

# Enlève la quarantaine (évite le message « endommagée »)
xattr -cr "$APP_NAME"

# Lance l'app
open "$APP_NAME"
