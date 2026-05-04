# TCG Snipers Release History

## v1.0.20 — 2026-05-04

**GitHub Release:** https://github.com/VentureNexus/TCG-Snipers/releases/tag/v1.0.20

### Downloads (9 assets)

| Platform | File |
|---|---|
| Windows x64 installer | [TCGSnipers-1.0.20-x64-win.exe](https://github.com/VentureNexus/TCG-Snipers/releases/download/v1.0.20/TCGSnipers-1.0.20-x64-win.exe) |
| Windows x64 installer blockmap | TCGSnipers-1.0.20-x64-win.exe.blockmap |
| Windows x64 zip | TCGSnipers-1.0.20-x64-win.zip |
| macOS arm64 DMG | [TCGSnipers-1.0.20-arm64.dmg](https://github.com/VentureNexus/TCG-Snipers/releases/download/v1.0.20/TCGSnipers-1.0.20-arm64.dmg) |
| macOS arm64 DMG blockmap | TCGSnipers-1.0.20-arm64.dmg.blockmap |
| macOS arm64 zip | TCGSnipers-1.0.20-arm64.zip |
| macOS arm64 zip blockmap | TCGSnipers-1.0.20-arm64.zip.blockmap |
| macOS auto-update manifest | latest-mac.yml |
| Windows auto-update manifest | latest.yml |

### Changes
- Add `VITE_MARKETING_SITE_URL` so the in-app release link points to the correct site
- CORS fixes: marketing site requests now use relative `/license/*` paths, proxied by Vercel

---

## v1.0.19 — 2026-05-04

**GitHub Release:** https://github.com/VentureNexus/TCG-Snipers/releases/tag/v1.0.19

### Changes
- Build preload as CommonJS (`.cjs`) to fix `window.electronAPI` being undefined in renderer
