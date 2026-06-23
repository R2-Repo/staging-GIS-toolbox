# Deployment

## Staging — GitHub Pages (`staging-GIS-toolbox`)

**URL:** https://r2-repo.github.io/staging-GIS-toolbox/

Workflow: [`.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml)

On push to `main`:

1. `npm ci` → `npm run build` → upload `dist/`
2. Deploy via GitHub Actions (`deploy-pages@v4`)

### One-time GitHub setup

1. Repo **Settings → Pages → Build and deployment → Source:** **GitHub Actions**
2. On first workflow run, approve the **`github-pages`** environment if prompted (Settings → Environments).

Local smoke before push:

```bash
npm test
npm run build
npm run preview -- --port 4174
npm run smoke:preview
```

---

## Production — Cloudflare Pages (`gis-toolbox`)

**Live repo:** https://github.com/R2-Repo/gis-toolbox  
**Domain:** GIS-Toolbox.com (via Cloudflare)

### Cloudflare Pages build settings

| Setting | Value |
|---------|--------|
| Production branch | `main` |
| Build command | `npm ci && npm run build` |
| Build output directory | `dist` |
| Node.js version | `20` (see [`.node-version`](../.node-version)) |

Previously the site was static HTML/JS from repo root (no build). After the React cutover, Cloudflare must run the Vite build.

### Production cutover checklist

1. Run [`scripts/sync-to-production-repo.ps1`](../scripts/sync-to-production-repo.ps1) against a local `gis-toolbox` clone (tags `vanilla-pre-react`, creates `react-migration` branch).
2. Push tag and branch: `git push origin vanilla-pre-react` and `git push -u origin react-migration`
3. Update Cloudflare Pages project build settings (table above).
4. Deploy on a preview branch first (`*.pages.dev`), then merge to `main`.
5. Verify custom domain, HTTPS, PWA/service worker, map, import, dual-screen (`map-window.html`).

### Rollback

Revert Cloudflare to **no build command** and restore the `vanilla-pre-react` tag on `main`.
