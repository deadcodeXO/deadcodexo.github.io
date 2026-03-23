# DEADCODEXO Site

Personal Astro site for GitHub Pages, with local-first content editing via Decap CMS.

Live site: `https://chaos.functionabuse.net/`

## Stack

- Astro 6
- Tailwind CSS 4
- TypeScript
- Decap CMS + `decap-server` (local editor workflow)
- Pagefind (search index generation)

## Local Development

### Install

```bash
npm install
```

### Run site only

```bash
npm run dev
```

### Run site + CMS workflow

```bash
npm run dev:cms
```

Then use:

- `/editor` for the themed editor page
- `/admin` for the Decap CMS app

## Content Model

- Posts: `src/data/blog/*.md`
- Galleries: `src/data/galleries/<slug>/index.md` + gallery images in the same folder
- Standalone pages: `src/pages/*.md` (example: `src/pages/about.md`)

## Scripts

- `npm run dev` - Astro dev server
- `npm run dev:cms` - Astro + local Decap backend
- `npm run build` - typecheck + build + remove dev-only routes + pagefind index
- `npm run syncdocs` - sync `dist/` to `docs/` (restores `CNAME`, writes `.nojekyll`)
- `npm run readyprod` - `build` + `syncdocs`
- `npm run new:post` - interactive post generator
- `npm run astro -- check` - Astro checks only
- `npm run astro -- build` - Astro build only

## Production Notes

- Dev-only routes are removed from production output by `scripts/remove-dev-routes.cjs`:
  - `/editor`
  - `/edit`
  - `/admin`
- GitHub Pages output is served from `docs/`.
- Deploy flow:

```bash
npm run readyprod
git add -A
git commit -m "Update site"
git push
```

## OG Image Generation

- Per-post social cards: `src/pages/posts/[...slug]/index.png.ts`
- Site fallback OG image: `src/pages/og.png.ts`
- Templates:
  - `src/utils/og-templates/post.js`
  - `src/utils/og-templates/site.js`
- Toggle in `src/config.ts` with `dynamicOgImage`.

## Configuration

Main site options live in `src/config.ts`:

- site URL/title/description
- timezone
- pagination
- feature toggles (projects, archives, galleries, etc.)

## Backup Recommendation

Primary backup: git remote(s).  
Secondary backup: zip/rar of repo (exclude `node_modules`, `.astro`, `dist`).

