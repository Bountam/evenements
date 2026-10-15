#!/usr/bin/env bash
# Construit le paquet .deb (Debian, Ubuntu, Mint) autour du binaire Linux autonome.
#   packaging/linux/build-deb.sh <version> <binaire> <dossier de sortie>
set -euo pipefail

VERSION="$1"
BINARY="$2"
OUT_DIR="$3"
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
PKG="insertech-evenements"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
chmod 755 "$STAGE"

install -Dm755 "$BINARY" "$STAGE/opt/$PKG/InsertechEvenements-linux-x64"
mkdir -p "$STAGE/usr/bin"
ln -s "/opt/$PKG/InsertechEvenements-linux-x64" "$STAGE/usr/bin/$PKG"
install -Dm644 "$ROOT_DIR/public/pwa-512x512.png" "$STAGE/usr/share/icons/hicolor/512x512/apps/$PKG.png"

# Même nom de fichier que l'entrée créée par le lanceur dans ~/.local : une seule entrée au menu
install -Dm644 /dev/stdin "$STAGE/usr/share/applications/$PKG.desktop" <<DESKTOP
[Desktop Entry]
Version=1.0
Type=Application
Name=Insertech Événements
Comment=Tableau de bord événementiel hors-ligne Insertech
Exec=/opt/$PKG/InsertechEvenements-linux-x64
Icon=$PKG
Terminal=false
Categories=Office;Utility;
StartupWMClass=InsertechEvenements
DESKTOP

INSTALLED_KB=$(du -sk "$STAGE" | cut -f1)
install -Dm644 /dev/stdin "$STAGE/DEBIAN/control" <<CONTROL
Package: $PKG
Version: $VERSION
Architecture: amd64
Maintainer: Insertech Angus <5290331+Bountam@users.noreply.github.com>
Installed-Size: $INSTALLED_KB
Section: utils
Priority: optional
Recommends: chromium | chromium-browser | google-chrome-stable | microsoft-edge-stable
Homepage: https://github.com/Bountam/evenements
Description: Tableau de bord événementiel hors-ligne Insertech
 Réparothons, kiosques-concours et Install Fest Linux : suivi en direct,
 chronos, tirages au sort et écran public, sans connexion Internet.
 S'ouvre dans une fenêtre Chromium dédiée (repli Firefox sinon).
CONTROL

mkdir -p "$OUT_DIR"
dpkg-deb --build --root-owner-group "$STAGE" "$OUT_DIR/${PKG}_${VERSION}_amd64.deb"
