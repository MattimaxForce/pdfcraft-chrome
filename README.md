# PdfCraft for Chrome

A lightweight Chrome extension that opens PDFs in [PdfCraft](https://github.com/storytold/pdfcraft) — a full PDF
reader and editor written in Rust and compiled to WebAssembly — instead of Chrome's built-in viewer or a
separate desktop reader. Everything runs locally in your browser: no account, no cloud, no telemetry.

> Not affiliated with or endorsed by Adobe, Google or the PdfCraft authors. "Adobe" and "Acrobat" are
> trademarks of Adobe Inc., mentioned only to describe what kind of software this replaces.

## Features

- **Opens PDFs automatically** — links, `.pdf` addresses, and files recognised by their `Content-Type`
  (even with no `.pdf` in the URL) open in PdfCraft instead of Chrome's viewer.
- **Opens downloads** — a PDF you just downloaded opens in a new tab.
- **"Open with PdfCraft" badge** — when automatic opening is off, a small badge appears on PDF pages and opens
  the file in a new tab.
- **Right-click menu** — *Open with PdfCraft* on PDF links and pages.
- **Escape hatch** — the popup can reopen the current PDF once in Chrome's own viewer.
- **The full PdfCraft toolset**: read and search, annotate and comment, Fill & Sign, edit text, create PDFs,
  combine/split/organize pages, convert/export, OCR, protect with passwords, redact, compress, prepare forms,
  stamps, certificates and digital signatures, and more.
- **Automatic language** — the extension follows Chrome's display language (English, Italian), and the
  PdfCraft interface follows the browser's preferred languages (around 30 languages are bundled upstream,
  including English and Italian). Nothing to configure; you can still override the app language in
  *Menu → Edit → Preferences*.
- **Light when idle** — the service worker sleeps until a PDF is involved, and the WebAssembly app is only
  loaded when you open a document. The app itself is large (~42 MB unpacked, ~16 MB zipped).

## Install

### From a release (no build needed)

1. Download `pdfcraft-chrome-<version>.zip` from the [Releases](../../releases) page (or from the latest
   *Build extension* workflow run → Artifacts) and unzip it into a folder you will keep.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and choose the unzipped folder (the one containing `manifest.json`).
4. Open the extension's **Details** and turn on **Allow access to file URLs**. This is needed to open local
   and downloaded PDFs.

Chromium-based browsers (Edge, Brave, …) should work the same way but have not been tested.

### Build it yourself

Requirements: `git`, [Rust](https://rustup.rs) ≥ 1.95, `zip`, `python3`. The first build compiles PdfCraft to
WebAssembly and takes roughly 15–20 minutes.

```sh
scripts/build.sh                       # clones upstream PdfCraft (tag v0.13.0), builds, packages
PDFCRAFT_REF=v0.13.0 scripts/build.sh  # choose another upstream tag or branch
scripts/build.sh --skip-build /path/to/dist/web   # reuse an existing `trunk build --release` output
```

The result is `dist/pdfcraft-chrome-<version>.zip`. To load the folder directly instead, run
`scripts/package-app.sh <path-to-dist/web>` and load `extension/`.

### Build with GitHub Actions

The workflow in `.github/workflows/build.yml` does the same on every push to `main`, uploads the zip as an
artifact, and attaches it to a GitHub Release when you push a tag such as `v0.13.0`. You can also run it by
hand from the **Actions** tab and pick the upstream PdfCraft tag to compile.

## How it works

```
extension/
  manifest.json      Manifest V3, default locale "en"
  background.js      service worker: redirect rules, Content-Type detection, downloads, context menu
  badge.js           the "Open with PdfCraft" badge (injected only on PDF pages)
  popup.html/js      settings popup
  viewer/            wrapper page: fetches the PDF (with the site's cookies) and hands it to the app
  app/               generated — the PdfCraft WebAssembly build (not committed)
  _locales/en, it    extension strings
scripts/             build and packaging
```

The viewer page embeds PdfCraft in a same-origin iframe and talks to it over `postMessage` using PdfCraft's
built-in `?host=parent` bridge: it sends the PDF bytes in, and saved files come back out and are written with
`chrome.downloads`. Extension pages forbid inline scripts, so `scripts/package-app.sh` replaces the loader that
trunk generates with an external `boot.js`.

### Permissions

| Permission | Why |
| --- | --- |
| `declarativeNetRequest` | Redirect plain `.pdf` navigations to the viewer before Chrome's viewer flashes up |
| `webRequest` | Read response headers (`Content-Type`, `Content-Disposition`) to spot PDFs without a `.pdf` URL — read-only, nothing is blocked or modified |
| `webNavigation`, `scripting` | Detect PDF pages and inject the badge |
| `downloads` | Open freshly downloaded PDFs and save edited files |
| `contextMenus` | The right-click entries |
| `storage` | Your three on/off settings |
| `<all_urls>` host access | Fetch the PDF with your cookies so protected/logged-in documents open |

No data leaves your machine; the extension makes no network requests of its own beyond fetching the PDF you
asked to open.

## Limitations

- PdfCraft draws with WebGL2. If hardware acceleration is off in Chrome, the viewer shows an error explaining it.
- With *Allow access to file URLs* off, a downloaded PDF is reopened from its web address, which can fail for
  one-time download links.
- Chrome loads unpacked extensions from a folder, not from a zip; the Chrome Web Store is not used.

## Credits and license

The viewer/editor is [PdfCraft](https://github.com/storytold/pdfcraft) by its contributors, compiled unmodified
from upstream. The extension code in this repository is dual-licensed under **MIT OR Apache-2.0**, the same as
PdfCraft; see `LICENSE-MIT`, `LICENSE-APACHE` and `NOTICE`.
