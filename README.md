# 🚀 DEADCODEXOs Astro Site

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Deployed-2ea44f)](https://chaos.functionabuse.net/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Personal Astro site for GitHub Pages, with local-first content editing via Decap CMS.

🌐 **Live site**: [https://chaos.functionabuse.net/](https://chaos.functionabuse.net/)

## 🛠️ Tech Stack

- ⚡ **Astro 6** - Static site generator
- 🎨 **Tailwind CSS 4** - Utility-first CSS framework
- 📝 **TypeScript** - Type-safe JavaScript
- 📚 **Decap CMS** + `decap-server` - Local-first content management
- 🔍 **Pagefind** - Client-side search
- 🖥️ **Electron** - Cross-platform desktop apps

## 🚀 Quick Start

### Installation

```bash
npm install
```

### Development

#### Run site only
```bash
npm run dev
```

#### Run site + CMS workflow
```bash
npm run dev:cms
```

Then visit:
- 🎨 `/editor` - Themed editor page
- ⚙️ `/admin` - Decap CMS interface

### Portable CMS App

For quick content editing without setup:

```bash
npm run cms:app:portable
```

Creates `release/DeadCodeXO CMS 1.0.0.exe` - run it anywhere (keep in repo folder structure)!

✏️ **Edit → Commit → Push**:
```bash
git add .
git commit -m "Update content"
git push
```

## 📄 Content Model

- 📝 **Posts**: `src/data/blog/*.md`
- 🖼️ **Galleries**: `src/data/galleries/<slug>/index.md` + images in same folder
- 📄 **Pages**: `src/pages/*.md` (e.g., `src/pages/about.md`)

## 📜 Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | 🚀 Start Astro dev server |
| `npm run dev:cms` | 🚀 Astro + Decap CMS backend |
| `npm run cms:app` | 🖥️ Electron CMS app (dev mode) |
| `npm run cms:app:portable` | 📦 Build portable Windows exe |
| `npm run cms:app:installer` | 📦 Build Windows installer |
| `npm run build` | 🔨 Typecheck + build + pagefind index |
| `npm run syncdocs` | 🔄 Sync dist/ to docs/ |
| `npm run readyprod` | 🎯 Build + sync for production |
| `npm run new:post` | ✏️ Interactive post generator |
| `npm run astro -- check` | ✅ Astro checks only |
| `npm run astro -- build` | 🔨 Astro build only |

## 🌐 Production Notes

⚠️ **Dev routes removed in production** (`scripts/remove-dev-routes.cjs`):
- `/editor`
- `/edit`
- `/admin`

📁 **GitHub Pages**: Served from `docs/` folder

🖥️ **Portable CMS**: Use `release/DeadCodeXO CMS 1.0.0.exe` for content editing

### Deploy Flow
```bash
npm run readyprod
git add -A
git commit -m "🚀 Update site"
git push
```
```

## Configuration

Main site options live in `src/config.ts`:

- site URL/title/description
- timezone
- pagination
- feature toggles (projects, archives, galleries, etc.)


