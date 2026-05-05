# TCG Snipers Release History

## How to publish a release

The preferred one-command flow (bumps version, collects changelog, updates this file, tags, and pushes):

```bash
./scripts/release.sh 1.0.23
```

Alternatively, if you have already bumped and committed the version manually:

```bash
./scripts/publish-release.sh 1.0.23
```

Both scripts will:
1. Prompt you for changelog entries (one per line)
2. Prepend a new entry to this file with the date, asset table, and your changelog
3. Commit the changes, create an annotated tag, and push to trigger the build

After the GitHub Actions build finishes and the release is published, fill in the
actual file sizes by running:

```bash
./scripts/update-release-sizes.sh 1.0.23
```

The `release.yml` workflow triggers on `push` to `refs/tags/v*`, builds Windows x64
and macOS arm64 installers, and publishes them to GitHub Releases via
`electron-builder --publish always`.

> **Note:** Do not use workflow_dispatch to trigger builds — without a git tag,
> electron-builder cannot anchor the GitHub Release and no release will be created.

---

## v1.0.22 — 2026-05-05

**GitHub Release:** https://github.com/VentureNexus/TCG-Snipers/releases/tag/v1.0.22

### Assets (9 files)

| File | Size |
|---|---|
| [TCGSnipers-1.0.22-x64-win.exe](https://github.com/VentureNexus/TCG-Snipers/releases/download/v1.0.22/TCGSnipers-1.0.22-x64-win.exe) | 87.0 MB |
| TCGSnipers-1.0.22-x64-win.exe.blockmap | 0.09 MB |
| TCGSnipers-1.0.22-x64-win.zip | 116.8 MB |
| [TCGSnipers-1.0.22-arm64.dmg](https://github.com/VentureNexus/TCG-Snipers/releases/download/v1.0.22/TCGSnipers-1.0.22-arm64.dmg) | 104.4 MB |
| TCGSnipers-1.0.22-arm64.dmg.blockmap | 0.11 MB |
| TCGSnipers-1.0.22-arm64.zip | 100.3 MB |
| TCGSnipers-1.0.22-arm64.zip.blockmap | 0.10 MB |
| latest.yml (Windows auto-update) | — |
| latest-mac.yml (macOS auto-update) | — |

### Changes
- Add Sam's Club as a supported retailer for sniping
- Add Sam's Club membership fields to user profiles
- Add secure storage for sensitive payment information
- Add max price (before tax) field to task creation
- Improve price checking logic; add ability to clear saved price
- Block incomplete profiles from being assigned to new tasks
- Show warning icon on task rows when the assigned profile is incomplete
- Show a banner when the database stops responding mid-session
- Add info tooltips to task form fields
- Add Unlimited retries option to task form
- Add one-command release script (`scripts/release.sh`)

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
