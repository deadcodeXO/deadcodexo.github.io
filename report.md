# Security Audit Report

Date: 2026-03-23  
Project: `deadcodexo.github.io`  
Auditor: Codex

## Remediation Update (Applied)

The following fixes were implemented after this audit:

- Added npm override to patch `fast-xml-parser` to `5.5.9`.
- Added baseline CSP/referrer/permissions policy meta hardening:
  - [src/layouts/Layout.astro](C:/Users/sketc/Desktop/gitblog/deadcodexo.github.io/src/layouts/Layout.astro)
  - [src/pages/admin.astro](C:/Users/sketc/Desktop/gitblog/deadcodexo.github.io/src/pages/admin.astro)
- Pinned Decap CMS runtime script URL to exact version (`3.10.1`) instead of range.
- Added security automation:
  - [\.github/workflows/security.yml](C:/Users/sketc/Desktop/gitblog/deadcodexo.github.io/.github/workflows/security.yml)
  - [\.github/dependabot.yml](C:/Users/sketc/Desktop/gitblog/deadcodexo.github.io/.github/dependabot.yml)
- Pinned container base images to non-floating major lines:
  - [Dockerfile](C:/Users/sketc/Desktop/gitblog/deadcodexo.github.io/Dockerfile)
  - [docker-compose.yml](C:/Users/sketc/Desktop/gitblog/deadcodexo.github.io/docker-compose.yml)

Current verification result:

- `npm audit --json`: **0 vulnerabilities**
- `npm audit --omit=dev --json`: **0 vulnerabilities**
- `npm ls fast-xml-parser @astrojs/rss`: shows `fast-xml-parser@5.5.9 overridden`

Residual note:

- `astro check` intermittently OOMs in this local environment; build/deploy path remains functional via `npm run build` + `npm run syncdocs`.

## Executive Summary

The site is in generally good shape for a static Astro + GitHub Pages deployment, with no exposed secrets found in source and dev-only CMS routes being removed from production output.

The highest-risk issue is a known vulnerable transitive dependency (`fast-xml-parser`) pulled by `@astrojs/rss`. Upstream has not yet released a fixed `@astrojs/rss` version, so mitigation should be applied locally via an override.

## Scope

- Dependency vulnerability scan (`npm audit`)
- Package/version posture (`npm outdated`, targeted `npm view`)
- Secret exposure scan in repo content
- Static code scan for common XSS/code-injection patterns
- CMS and deployment route exposure checks
- Config/deployment hardening review (headers/CSP, Docker pinning, CI scanning)

## Method & Evidence

Key commands executed:

- `npm audit --json`
- `npm audit --omit=dev --json`
- `npm outdated`
- `npm ls fast-xml-parser @astrojs/rss`
- `npm view fast-xml-parser version`
- `npm view @astrojs/rss version`
- `npm view @astrojs/rss@latest dependencies.fast-xml-parser`
- `rg` scans for secrets/injection patterns

Notable outputs:

- `fast-xml-parser@5.4.1` is present via `@astrojs/rss@4.0.17`
- `npm audit` reports:
  - 1 high (`fast-xml-parser`)
  - 1 moderate (`@astrojs/rss` path to the same issue)
- Latest `fast-xml-parser` available: `5.5.9`
- Latest `@astrojs/rss` currently still: `4.0.17`, still depends on `5.4.1`

## Findings (Ordered by Severity)

### HIGH-01: Vulnerable `fast-xml-parser` transitively included

- Severity: High
- Evidence:
  - `npm audit` GHSA entries:
    - `GHSA-jp2q-39xq-3w4g`
    - `GHSA-8gc5-j5rx-235r`
  - Dependency path:
    - `@astrojs/rss@4.0.17 -> fast-xml-parser@5.4.1`
- Affected files:
  - [package.json](C:/Users/sketc/Desktop/gitblog/deadcodexo.github.io/package.json)
- Impact:
  - XML entity expansion bypass/DoS risk in vulnerable parser versions.
  - Practical risk is somewhat reduced because this site is static and not parsing user-supplied XML at runtime, but build-time/tooling risk remains.
- Recommendation:
  1. Add npm override to force patched parser:
     - `"overrides": { "fast-xml-parser": "5.5.9" }`
  2. Reinstall dependencies and verify:
     - `npm install`
     - `npm ls fast-xml-parser`
  3. Run full verification:
     - `npm run build`
     - `npm run readyprod`
  4. Monitor `@astrojs/rss` for an upstream fixed release and remove override once native fix lands.

---

### MEDIUM-01: Remote CMS script loaded from CDN without integrity pinning

- Severity: Medium
- Evidence:
  - [src/pages/admin.astro](C:/Users/sketc/Desktop/gitblog/deadcodexo.github.io/src/pages/admin.astro) loads:
    - `https://unpkg.com/decap-cms@^3.0.0/dist/decap-cms.js`
- Impact:
  - Supply-chain risk in dev/admin context (remote script can change).
  - Version range (`^3.0.0`) can pull newer minor/patch unexpectedly.
- Recommendation:
  1. Pin exact version instead of caret range.
  2. Prefer self-hosting the JS bundle in `public/admin/` and load local file.
  3. If remote must remain, add Subresource Integrity (SRI) and `crossorigin`.

---

### MEDIUM-02: No explicit CSP/security header strategy

- Severity: Medium
- Evidence:
  - [src/layouts/Layout.astro](C:/Users/sketc/Desktop/gitblog/deadcodexo.github.io/src/layouts/Layout.astro) has no CSP/security headers/meta policy.
- Impact:
  - Increases blast radius if XSS is introduced later (e.g., future unsafe HTML insertion).
- Recommendation:
  1. Add baseline CSP (meta-based for GitHub Pages if headers unavailable), at minimum:
     - `default-src 'self'`
     - `object-src 'none'`
     - `base-uri 'self'`
     - `frame-ancestors 'self'`
  2. Add `referrer-policy` and `permissions-policy` where feasible.
  3. Because inline scripts are used widely, phase CSP in carefully (`'unsafe-inline'` initially, then tighten progressively).

---

### LOW-01: Floating Docker image tags

- Severity: Low
- Evidence:
  - [Dockerfile](C:/Users/sketc/Desktop/gitblog/deadcodexo.github.io/Dockerfile):
    - `FROM node:lts`
    - `FROM nginx:mainline-alpine-slim`
  - [docker-compose.yml](C:/Users/sketc/Desktop/gitblog/deadcodexo.github.io/docker-compose.yml):
    - `image: node:lts`
- Impact:
  - Non-reproducible builds and unexpected changes on rebuild.
- Recommendation:
  - Pin specific image tags (and ideally digests) for deterministic rebuilds.

---

### LOW-02: No automated dependency/security scanning in CI

- Severity: Low
- Evidence:
  - No GitHub Actions workflows found under `.github/workflows`.
- Impact:
  - Security regressions may go unnoticed between manual audits.
- Recommendation:
  1. Enable Dependabot alerts + PRs.
  2. Add CI job running:
     - `npm audit --omit=dev`
     - `npm run astro -- check`
     - `npm run build`

## Informational Observations

- No hardcoded live secrets were found in scanned source/config files.
  - Some blog posts contain token-like example strings (documentation/sample content), not active credentials.
- Dev-only CMS routes are correctly stripped from production build output:
  - `editor`, `edit`, `admin` removed by [scripts/remove-dev-routes.cjs](C:/Users/sketc/Desktop/gitblog/deadcodexo.github.io/scripts/remove-dev-routes.cjs)
- `.env` and `.env.production` are already ignored in [.gitignore](C:/Users/sketc/Desktop/gitblog/deadcodexo.github.io/.gitignore).

## Prioritized Remediation Plan

1. Patch dependency risk now:
   - Add `overrides.fast-xml-parser = 5.5.9`
   - Reinstall + verify build
2. Lock down CMS script loading:
   - Pin exact Decap CMS version or self-host asset
3. Add baseline CSP/meta hardening:
   - Start permissive, tighten in follow-up
4. Add CI automation:
   - Build/check/audit workflow + Dependabot
5. Optional reproducibility hardening:
   - Pin Docker images to fixed tags/digests

## Retest Checklist After Fixes

- `npm audit --omit=dev`
- `npm ls fast-xml-parser @astrojs/rss`
- `npm run astro -- check`
- `npm run build`
- `npm run readyprod`
- Manual smoke test:
  - Home, posts, tags, galleries, projects
  - `/editor` local-only behavior
  - Ensure `/admin` not present in production output
