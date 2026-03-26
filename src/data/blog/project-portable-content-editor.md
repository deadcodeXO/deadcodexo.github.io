---
title: "Project: Portable Content Editor"
description: Portable content editor created with electron.
pubDatetime: 2026-03-24T01:37:00.000-03:00
author: DEADCODEXO
featured: true
draft: false
tags:
  - project
  - content
  - tech
  - code
hideEditPost: false
---
So yeah, I made this little **Electron app** to crank out content for the site without all the usual setup nonsense. Basically, I click it, see a splash screen, and boom - editor's ready. No waiting around, no server configs, no typing commands, just type content and push it.\
\
UPDATE: now on v0.2 of this, I'll post a screenshot in the morning.

Workflow is dead simple:

1. Open app → splash shows.
2. Backend spins up in a few secs.
3. Editor window pops.
4. Write, preview, commit - done.

## Splash screen in action

```javascript
import { BrowserWindow } from "electron";
import path from "node:path";

function createSplashWindow() {
  const splash = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
  });

  splash.loadFile(path.join(__dirname, "splash.html"));
  return splash;
}
```

This is literally just a tiny window to let me know the app is starting.

## Starting the CMS backend

```javascript
import { spawn } from "node:child_process";

function startCmsServer() {
  const cmsProcess = spawn("node", ["./server.js"], {
    cwd: __dirname,
    stdio: "inherit",
  });

  cmsProcess.on("exit", (code) => {
    console.log(`CMS server exited with code ${code}`);
  });

  return cmsProcess;
}
```

Spins up the server that actually runs the editor. Electron handles the window, Node handles the server.

## Why I like it

* Fast: open → splash → editor in seconds.
* Portable: single exe, no install.
* Integrated: commit & push without leaving the app.
