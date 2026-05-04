# TCG Snipers Release History

## v1.0.20 — 2026-05-04

**GitHub Release:** https://github.com/VentureNexus/TCG-Snipers/releases/tag/v1.0.20

### Downloads
| Platform | File | Size |
|---|---|---|
| Windows x64 | [TCGSnipers-1.0.20-x64-win.exe](https://github.com/VentureNexus/TCG-Snipers/releases/download/v1.0.20/TCGSnipers-1.0.20-x64-win.exe) | 87 MB |
| Windows x64 (zip) | [TCGSnipers-1.0.20-x64-win.zip](https://github.com/VentureNexus/TCG-Snipers/releases/download/v1.0.20/TCGSnipers-1.0.20-x64-win.zip) | 117 MB |
| macOS arm64 | [TCGSnipers-1.0.20-arm64.dmg](https://github.com/VentureNexus/TCG-Snipers/releases/download/v1.0.20/TCGSnipers-1.0.20-arm64.dmg) | 104 MB |
| macOS arm64 (zip) | [TCGSnipers-1.0.20-arm64.zip](https://github.com/VentureNexus/TCG-Snipers/releases/download/v1.0.20/TCGSnipers-1.0.20-arm64.zip) | 100 MB |

### Changes
- Add `VITE_MARKETING_SITE_URL` so the in-app release link points to the correct site
- CORS fixes: marketing site requests now use relative `/license/*` paths, proxied by Vercel

### Release process
Published by creating an annotated git tag `v1.0.20` pointing to main HEAD, which triggered the `release.yml` workflow (run [#25349451167](https://github.com/VentureNexus/TCG-Snipers/actions/runs/25349451167)).
Both build jobs completed in under 5 minutes. All 9 assets were published via electron-builder `--publish always`.

---

## v1.0.19 — 2026-05-04

**GitHub Release:** https://github.com/VentureNexus/TCG-Snipers/releases/tag/v1.0.19

### Changes
- Build preload as CommonJS (`.cjs`) to fix `window.electronAPI` being undefined in renderer
