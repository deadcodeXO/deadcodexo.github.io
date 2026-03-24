# DeadCodeXO CMS Desktop App (Electron) --- Implementation Context

## Goal

Wrap the existing Astro + Decap CMS development environment into a
desktop application using Electron.

The app should: - Launch the Astro CMS dev server - Show a splash screen
while loading - Open the CMS UI at /admin - Provide a smooth, app-like
experience

## Architecture

-   Astro → runs dev server (npm run dev:cms)
-   Decap CMS → UI at /admin
-   Electron → desktop wrapper
-   GitHub Desktop → handles commits manually (NO Git integration in
    app)

## Core Behavior

On app launch:

1.  Show splash screen (logo + loading text)
2.  Start Astro CMS dev server (npm run dev:cms)
3.  Wait for server (http://localhost:4321)
4.  Open main window → /admin
5.  Close splash screen

## File Structure

/electron main.js splash.html logo.png

## Dependencies

npm install electron wait-on --save-dev

## Electron Main Process

/electron/main.js

const { app, BrowserWindow } = require("electron"); const { spawn } =
require("child_process"); const path = require("path"); const waitOn =
require("wait-on");

let mainWindow; let splash; let server;

function createSplash() { splash = new BrowserWindow({ width: 400,
height: 300, frame: false, alwaysOnTop: true, });

splash.loadFile(path.join(\_\_dirname, "splash.html")); }

function createMainWindow() { mainWindow = new BrowserWindow({ width:
1200, height: 800, show: false, autoHideMenuBar: true, });

mainWindow.loadURL("http://localhost:4321/admin");

mainWindow.once("ready-to-show", () =\> { splash.close();
mainWindow.show(); }); }

app.whenReady().then(async () =\> { createSplash();

server = spawn("npm", \["run", "dev:cms"\], { shell: true, stdio:
"ignore", });

await waitOn({ resources: \["http://localhost:4321"\] });

createMainWindow(); });

app.on("window-all-closed", () =\> { if (server) server.kill();
app.quit(); });

## Splash Screen

/electron/splash.html

\<!DOCTYPE html\>
```{=html}
<html>
```
```{=html}
<head>
```
```{=html}
<style>
    body {
      margin: 0;
      background: #0f0f0f;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      flex-direction: column;
      color: #aaa;
      font-family: sans-serif;
    }

    img {
      width: 120px;
      margin-bottom: 20px;
      animation: pulse 1.5s infinite ease-in-out;
    }

    @keyframes pulse {
      0% { opacity: 0.6; transform: scale(0.98); }
      50% { opacity: 1; transform: scale(1.02); }
      100% { opacity: 0.6; transform: scale(0.98); }
    }
  </style>
```
```{=html}
</head>
```
```{=html}
<body>
```
`<img src="./logo.png" />`{=html}

<div>

Starting CMS...

</div>

```{=html}
</body>
```
```{=html}
</html>
```
## Package.json

{ "main": "electron/main.js", "scripts": { "cms:app": "electron ." } }

## Run

npm run cms:app

## Workflow

1.  Launch app
2.  Edit content
3.  Open GitHub Desktop
4.  Commit + push

## Notes

-   Live reload enabled
-   No rebuild needed
-   Fully offline capable
