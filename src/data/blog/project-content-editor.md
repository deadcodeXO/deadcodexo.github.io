---
title: "Project: Integrated Content Editor"
description: Built a local-first content editor in Astro with Decap CMS, theme
  sync, and project auto-listing.
pubDatetime: 2026-03-23T17:35:00.000Z
author: DEADCODEXO
featured: true
draft: false
tags:
  - project
  - astro
  - cms
  - site
---

I wrapped Decap CMS into a native `/editor` page so it feels like part of the site instead of a separate admin panel.

The editor link is local-only:

```astro
{
  import.meta.env.DEV && (
    <a href="/editor" class="nav-link">Editor</a>
  )
}
```

The CMS is embedded and theme-synced with the main site:

```astro
<iframe id="cms-frame" src="/admin/" class="h-[78vh] w-full"></iframe>
```

```js
frame.contentWindow.postMessage(
  { type: "site-theme", value: currentTheme },
  window.location.origin
);
```

Project posts auto-show on `/projects` by tag:

```ts
const allPosts = await getCollection("blog");
const projectPosts = getPostsByTag(allPosts, "project");
```

Editor preview screenshot (click to expand):

<a href="/uploads/neweditor.png" target="_blank" rel="noopener noreferrer">
  <img src="/uploads/neweditor.png" alt="Integrated content editor page with themed Decap CMS panel" loading="lazy" />
</a>

This gives me a clean workflow: edit locally with CMS, build static, push to GitHub Pages.
