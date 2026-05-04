# TCG Snipers Release History

## How to publish a release

Use the `scripts/publish-release.sh` script:

```bash
# 1. Bump version in artifacts/sniper-bot/package.json, commit it
# 2. Run the release script — it tags HEAD and pushes, triggering the build
./scripts/publish-release.sh 1.0.21
```

The `release.yml` workflow triggers on `push` to `refs/tags/v*`, builds Windows x64
and macOS arm64 installers, and publishes them to GitHub Releases via
`electron-builder --publish always`.

> **Note:** Do not use workflow_dispatch to trigger builds — without a git tag,
> electron-builder cannot anchor the GitHub Release and no release will be created.

---

## v1.0.20 — 2026-05-04

**GitHub Release:** https://github.com/VentureNexus/TCG-Snipers/releases/tag/v1.0.20

**Workflow run:** https://github.com/VentureNexus/TCG-Snipers/actions/runs/25349451167

### Assets (9 files)

| File | Size |
|---|---|
| [TCGSnipers-1.0.20-x64-win.exe](https://github.com/VentureNexus/TCG-Snipers/releases/download/v1.0.20/TCGSnipers-1.0.20-x64-win.exe) | 87.0 MB |
| TCGSnipers-1.0.20-x64-win.exe.blockmap | 0.09 MB |
| TCGSnipers-1.0.20-x64-win.zip | 116.8 MB |
| [TCGSnipers-1.0.20-arm64.dmg](https://github.com/VentureNexus/TCG-Snipers/releases/download/v1.0.20/TCGSnipers-1.0.20-arm64.dmg) | 104.3 MB |
| TCGSnipers-1.0.20-arm64.dmg.blockmap | 0.11 MB |
| TCGSnipers-1.0.20-arm64.zip | 100.3 MB |
| TCGSnipers-1.0.20-arm64.zip.blockmap | 0.10 MB |
| latest.yml (Windows auto-update) | — |
| latest-mac.yml (macOS auto-update) | — |

### Changes
- Add `VITE_MARKETING_SITE_URL` so the in-app release link points to the correct site
- CORS fixes: marketing site requests use relative `/license/*` paths, proxied by Vercel

---

## v1.0.19 — 2026-05-04

**GitHub Release:** https://github.com/VentureNexus/TCG-Snipers/releases/tag/v1.0.19

### Changes
- Build preload as CommonJS (`.cjs`) to fix `window.electronAPI` being undefined in renderer
