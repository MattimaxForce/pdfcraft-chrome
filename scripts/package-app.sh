#!/usr/bin/env bash
# Copies a finished PdfCraft web build (trunk output) into extension/app/ and makes it
# Manifest V3 compliant: no inline scripts (extension pages forbid them), stable file names.
#
# Usage: scripts/package-app.sh [path/to/dist/web]     (default: build/pdfcraft/dist/web)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SITE="${1:-$ROOT/build/pdfcraft/dist/web}"
OUT="$ROOT/extension/app"

JS=$(ls "$SITE"/pdfcraft-web-*.js 2>/dev/null | grep -v '_bg' | head -n1 || true)
WASM=$(ls "$SITE"/pdfcraft-web-*_bg.wasm 2>/dev/null | head -n1 || true)
[[ -f "$JS" && -f "$WASM" ]] || { echo "error: no pdfcraft-web-*.js / *_bg.wasm in $SITE" >&2; exit 1; }

rm -rf "$OUT" && mkdir -p "$OUT"
cp "$JS" "$OUT/app.js"
cp "$WASM" "$OUT/app_bg.wasm"

cat > "$OUT/boot.js" <<'JS'
import init from './app.js';
await init({ module_or_path: './app_bg.wasm' });
JS

cat > "$OUT/index.html" <<'HTML'
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PdfCraft</title>
<style>
html,body{margin:0;height:100%;overflow:hidden;background:#f1f1f3}
canvas{width:100%;height:100%;display:block;outline:none}
@media (prefers-color-scheme:dark){html,body{background:#19191c}}
</style>
<script type="module" src="boot.js"></script>
</head>
<body><canvas id="pdfcraft"></canvas></body>
</html>
HTML

echo "packaged app into $OUT ($(du -h "$OUT/app_bg.wasm" | cut -f1) wasm)"
