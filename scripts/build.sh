#!/usr/bin/env bash
# Builds the whole extension from source and writes dist/pdfcraft-chrome-<version>.zip
#
# Needs: git, rustup/cargo (Rust >= 1.95), zip. trunk is installed on demand.
# Usage: scripts/build.sh            # clone upstream PdfCraft, compile to wasm (~15-20 min), package
#        PDFCRAFT_REF=v0.13.0 scripts/build.sh   # pick another upstream tag/branch
#        scripts/build.sh --skip-build /path/to/dist/web   # reuse an existing trunk output
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REF="${PDFCRAFT_REF:-v0.13.0}"
SRC="$ROOT/build/pdfcraft"

if [[ "${1:-}" == "--skip-build" ]]; then
  SITE="${2:?usage: build.sh --skip-build <dist/web>}"
else
  command -v cargo >/dev/null || { echo "error: cargo not found (install Rust from https://rustup.rs)" >&2; exit 1; }
  rustup target add wasm32-unknown-unknown
  command -v trunk >/dev/null || cargo install trunk --locked
  if [[ ! -d "$SRC/.git" ]]; then
    mkdir -p "$ROOT/build"
    git clone --depth 1 --branch "$REF" https://github.com/storytold/pdfcraft "$SRC"
  fi
  (cd "$SRC/apps/pdfcraft-web" && trunk build --release)
  SITE="$SRC/dist/web"
fi

"$ROOT/scripts/package-app.sh" "$SITE"

VERSION=$(python3 -c "import json;print(json.load(open('$ROOT/extension/manifest.json'))['version'])")
mkdir -p "$ROOT/dist"
ZIP="$ROOT/dist/pdfcraft-chrome-$VERSION.zip"
rm -f "$ZIP"
cp "$ROOT"/LICENSE-* "$ROOT/NOTICE" "$ROOT/extension/"
(cd "$ROOT/extension" && zip -qr9 "$ZIP" . -x '.DS_Store')
rm -f "$ROOT/extension/LICENSE-"* "$ROOT/extension/NOTICE"
echo "wrote $ZIP"; ls -lh "$ZIP"
