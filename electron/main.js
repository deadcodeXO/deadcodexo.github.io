import { app, BrowserWindow, dialog, ipcMain, Menu, shell, Notification } from "electron";
import { spawn } from "node:child_process";
import { createWriteStream, existsSync, watch } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const bundledProjectRoot = path.resolve(__dirname, "..");

// ======= Electron + CMS Server Constants =======
const DEV_SERVER_HOST = "127.0.0.1";        // Astro dev server host
const DEV_SERVER_PORT = 4321;               // Astro dev server port
const DEV_SERVER_URL = `http://${DEV_SERVER_HOST}:${DEV_SERVER_PORT}`; // Astro URL

const DEFAULT_DECAP_PORT = 8081;            // Default Decap CMS proxy port
const MAX_DECAP_PORT = 8199;                // Optional upper bound if auto-incrementing ports

let mainWindow = null;
let splashWindow = null;
let cmsServerProcesses = [];
let startupLogPath = "";
let startupLogStream = null;
let workspaceRoot = bundledProjectRoot;
let decapServerPort = DEFAULT_DECAP_PORT;
const startupLogTail = [];

let readyProdRunning = false;
let readyProdLastStatus = "idle";
let readyProdWatchTimer = null;


function stripAnsi(value) {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

function appendStartupLog(line) {
  const ts = new Date().toISOString();
  const formatted = `[${ts}] ${line}`;
  startupLogTail.push(formatted);
  if (startupLogTail.length > 80) startupLogTail.shift();

  if (startupLogStream) {
    startupLogStream.write(`${formatted}\n`);
  }
}

function initStartupLog() {
  startupLogPath = path.join(app.getPath("userData"), "cms-startup.log");
  startupLogStream = createWriteStream(startupLogPath, { flags: "a" });
  appendStartupLog("----- CMS app launch -----");
}

function sendReadyProdEvent(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("readyprod-event", payload);
  }
}

function setSplashProgress(percent) {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  splashWindow.webContents
    .executeJavaScript(`setProgress(${String(percent)})`)
    .catch(error => appendStartupLog(`Splash progress ${String(percent)} error: ${error.message}`));
}

function runReadyProdProcess() {
  if (readyProdRunning) {
    sendReadyProdEvent({ type: "busy", message: "readyprod is already running" });
    return Promise.resolve({ status: "busy" });
  }

  readyProdRunning = true;
  readyProdLastStatus = "running";
  sendReadyProdEvent({ type: "start", message: "readyprod started" });
  appendStartupLog("Starting npm run readyprod...");

  return new Promise((resolve) => {
    const isWin = process.platform === "win32";
    const proc = spawn(isWin ? "npm" : "npm", ["run", "readyprod"], {
      cwd: workspaceRoot,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      shell: isWin,
      env: {
        ...process.env,
      },
    });

    proc.stdout?.on("data", chunk => {
      const text = stripAnsi(String(chunk)).trim();
      if (text) {
        appendStartupLog(`[readyprod] ${text}`);
        sendReadyProdEvent({ type: "log", message: text });
      }
    });

    proc.stderr?.on("data", chunk => {
      const text = stripAnsi(String(chunk)).trim();
      if (text) {
        appendStartupLog(`[readyprod:error] ${text}`);
        sendReadyProdEvent({ type: "log", message: text });
      }
    });

    proc.on("error", (error) => {
      appendStartupLog(`[readyprod:error] ${error.message}`);
      sendReadyProdEvent({ type: "error", message: error.message });
    });

    proc.on("close", (code) => {
      readyProdRunning = false;
      readyProdLastStatus = code === 0 ? "success" : "failed";
      if (code === 0) {
        appendStartupLog("readyprod completed successfully.");
        sendReadyProdEvent({ type: "success", message: "readyprod finished successfully" });
        resolve({ status: "success" });
      } else {
        appendStartupLog(`readyprod failed with code ${code}.`);
        sendReadyProdEvent({ type: "failure", message: `readyprod failed (code ${code})` });
        resolve({ status: "failed", code });
      }
    });
  });
}

function setupReadyProdWatcher() {
  const watchPaths = [
    path.join(workspaceRoot, "src", "data", "blog"),
    path.join(workspaceRoot, "src", "data", "galleries"),
    path.join(workspaceRoot, "src", "data", "pages"),
  ];

  for (const watchPath of watchPaths) {
    if (!existsSync(watchPath)) continue;

    try {
      watch(watchPath, { recursive: true }, (_, filename) => {
        if (!filename) return;

        if (readyProdWatchTimer) clearTimeout(readyProdWatchTimer);

        readyProdWatchTimer = setTimeout(() => {
          sendReadyProdEvent({ type: "trigger", message: "Content changed, running readyprod" });
          runReadyProdProcess().catch(() => {});
        }, 2200);
      });
    } catch (error) {
      appendStartupLog(`readyprod watcher error for ${watchPath}: ${error.message}`);
    }
  }
}

ipcMain.handle("run-readyprod", async () => runReadyProdProcess());

ipcMain.handle("get-readyprod-status", () => ({
  running: readyProdRunning,
  status: readyProdLastStatus,
}));

ipcMain.handle("minimize-window", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.minimize();
  }
});

ipcMain.handle("maximize-window", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    // Prevent rapid toggling
    if (mainWindow.__maximizing) return;
    mainWindow.__maximizing = true;
    setTimeout(() => { mainWindow.__maximizing = false; }, 200);

    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle("close-window", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }
});

ipcMain.handle("open-external", async (_, url) => {
  await shell.openExternal(url);
});

ipcMain.handle("show-notification", async (_, title, body) => {
  try {
    const notification = new Notification({
      title,
      body,
      silent: false,
    });
    notification.show();
    // Keep reference to prevent garbage collection
    if (!global.notifications) global.notifications = [];
    global.notifications.push(notification);
    // Clean up old notifications
    if (global.notifications.length > 10) {
      global.notifications.shift();
    }
  } catch (error) {
    console.error("Notification error:", error);
  }
});

ipcMain.handle("show-context-menu", () => {
  const template = [
    {
      label: "Refresh CMS",
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("refresh-cms");
        }
      },
    },
    { type: "separator" },
    {
      label: "Dev Tools",
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.openDevTools();
        }
      },
    },
  ];
  const menu = Menu.buildFromTemplate(template);
  menu.popup({ window: mainWindow });
});

function isWorkspaceRoot(candidatePath) {
  return (
    existsSync(path.join(candidatePath, "package.json")) &&
    existsSync(path.join(candidatePath, "src")) &&
    existsSync(path.join(candidatePath, "public"))
  );
}

function resolveWorkspaceRoot() {
  if (!app.isPackaged) {
    return bundledProjectRoot;
  }

  const candidatePaths = [];
  const pushCandidate = value => {
    if (!value) return;
    if (candidatePaths.includes(value)) return;
    candidatePaths.push(value);
  };

  const portableExecutableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  const exeDir = path.dirname(process.execPath);
  const cwd = process.cwd();

  pushCandidate(portableExecutableDir);
  if (portableExecutableDir) pushCandidate(path.resolve(portableExecutableDir, ".."));
  pushCandidate(cwd);
  pushCandidate(path.resolve(cwd, ".."));
  pushCandidate(exeDir);
  pushCandidate(path.resolve(exeDir, ".."));

  for (const candidate of candidatePaths) {
    if (isWorkspaceRoot(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Could not locate repo workspace root. Launch the portable EXE from your repo's release folder. Checked: ${candidatePaths.join(
      " | "
    )}`
  );
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 430,
    height: 320,
    frame: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    center: true,
    backgroundColor: "#0f1218",
  });

  splashWindow.loadFile(path.join(__dirname, "splash.html"));
  setSplashProgress(10);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    minWidth: 1024,
    minHeight: 700,
    frame: false,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#10131a",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      worldSafeExecuteJavaScript: true,
    },
  });

  const editorUrl = new URL("/editor", DEV_SERVER_URL);
  editorUrl.searchParams.set("cms_proxy_port", String(decapServerPort));
  const shellPath = path.join(__dirname, "shell.html");
  appendStartupLog(`Preload path: ${path.join(__dirname, "preload.cjs")}`);
  appendStartupLog(`Loading main window shell: ${shellPath}`);
  appendStartupLog(`Editor target URL: ${editorUrl.toString()}`);
  mainWindow.loadFile(shellPath, {
    query: {
      editorUrl: editorUrl.toString(),
      siteUrl: DEV_SERVER_URL,
    },
  });

  let revealed = false;
  const revealWindow = () => {
    if (revealed || !mainWindow || mainWindow.isDestroyed()) return;
    revealed = true;
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
    }
    mainWindow?.show();
  };

  // ready-to-show is ideal, but can be unreliable with heavy iframe/content boot.
  mainWindow.once("ready-to-show", revealWindow);
  mainWindow.webContents.once("did-finish-load", revealWindow);
  mainWindow.webContents.once(
    "did-fail-load",
    (_event, code, description, validatedURL) => {
      appendStartupLog(
        `window-error did-fail-load code=${String(code)} url=${validatedURL} description=${description}`
      );
      revealWindow();
    }
  );
  setTimeout(() => {
    if (!revealed) {
      appendStartupLog("window reveal fallback after 8s");
      revealWindow();
    }
  }, 8000);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createAppMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        {
          label: "Run readyprod",
          accelerator: "CmdOrCtrl+R",
          click: () => {
            runReadyProdProcess().catch(() => {});
          },
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "View",
      submenu: [{ role: "reload" }, { role: "toggledevtools" }, { role: "togglefullscreen" }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function spawnNodeProcess(label, scriptPath, args = [], extraEnv = {}) {
  const nodeCommand = process.platform === "win32" ? "node.exe" : "node";
  const proc = spawn(nodeCommand, [scriptPath, ...args], {
    cwd: workspaceRoot,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      ...extraEnv,
    },
  });

  proc.stdout?.on("data", chunk => {
    const text = stripAnsi(String(chunk)).trim();
    if (text) appendStartupLog(`[${label}] ${text}`);
  });
  proc.stderr?.on("data", chunk => {
    const text = stripAnsi(String(chunk)).trim();
    if (text) appendStartupLog(`[${label}:err] ${text}`);
  });
  proc.on("error", error => {
    appendStartupLog(`[${label}:error] ${error.message}`);
  });

  return proc;
}

function isPortAvailable(host, port) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.unref();

    server.once("error", () => resolve(false));
    server.listen(port, host, () => {
      server.close(() => resolve(true));
    });
  });
}

async function findAvailablePort(host, start, end) {
  for (let port = start; port <= end; port += 1) {
    // Sequential check keeps logs understandable and avoids racing listeners.
    if (await isPortAvailable(host, port)) return port;
  }

  throw new Error(`No available port found for Decap proxy in range ${start}-${end}.`);
}

function watchForEarlyExit() {
  return new Promise((_, reject) => {
    cmsServerProcesses.forEach(({ label, proc }) => {
      proc.once("exit", (code, signal) => {
        if (mainWindow) return;
        if (code === 0) return;
        reject(
          new Error(
            `${label} exited before startup completed (code: ${String(code)}, signal: ${String(signal)}).`
          )
        );
      });
    });
  });
}

async function startCmsServer() {
  const astroCliPath = path.join(
    workspaceRoot,
    "node_modules",
    "astro",
    "bin",
    "astro.mjs"
  );
  const decapServerPath = path.join(
    workspaceRoot,
    "node_modules",
    "decap-server",
    "dist",
    "index.js"
  );

  if (!existsSync(astroCliPath)) {
    throw new Error(
      `Astro CLI not found at "${astroCliPath}". Install dependencies and rebuild the app.`
    );
  }
  if (!existsSync(decapServerPath)) {
    throw new Error(
      `Decap server entry not found at "${decapServerPath}". Install dependencies and rebuild the app.`
    );
  }

  appendStartupLog(`Starting Astro from ${astroCliPath}`);
  appendStartupLog(`Starting Decap server from ${decapServerPath}`);
  decapServerPort = await findAvailablePort(
    DEV_SERVER_HOST,
    DEFAULT_DECAP_PORT,
    MAX_DECAP_PORT
  );
  appendStartupLog(`Using Decap proxy port ${decapServerPort}`);

  const astroProcess = spawnNodeProcess("astro", astroCliPath, [
    "dev",
    "--host",
    DEV_SERVER_HOST,
    "--port",
    String(DEV_SERVER_PORT),
    "--strictPort",
  ]);
  const decapProcess = spawnNodeProcess("decap", decapServerPath, [], {
    PORT: String(decapServerPort),
    BIND_HOST: DEV_SERVER_HOST,
    GIT_REPO_DIRECTORY: workspaceRoot,
  });

  cmsServerProcesses = [
    { label: "astro", proc: astroProcess },
    { label: "decap", proc: decapProcess },
  ];

  return watchForEarlyExit();
}

async function waitForCmsServer(earlyExitPromise) {
  const serverReadyPromise = (async () => {
    const timeoutMs = 120000;
    const deadline = Date.now() + timeoutMs;
    let ready = false;

    while (Date.now() < deadline) {
      try {
        const response = await fetch(`${DEV_SERVER_URL}/editor`, { method: "GET", cache: "no-store" });
        appendStartupLog(`[decap] probe response: ${response.status}`);
        if (response.ok) {
          appendStartupLog(`[decap] CMS ready (${response.status})`);
          setSplashProgress(100);
          ready = true;
          break;
        }
      } catch (error) {
        appendStartupLog(`[decap] probe error: ${error.message}`);
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    if (ready) return;
    throw new Error(`Timed out waiting for ${DEV_SERVER_URL} to be reachable.`);
  })();

  await Promise.race([serverReadyPromise, earlyExitPromise]);
}

function stopCmsServer() {
  if (!cmsServerProcesses.length) return;

  cmsServerProcesses.forEach(({ proc }) => {
    if (!proc || proc.killed) return;
    const pid = proc.pid;
    if (!pid) return;

    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(pid), "/t", "/f"], {
        windowsHide: true,
        stdio: "ignore",
      });
    } else {
      proc.kill("SIGTERM");
    }
  });

  cmsServerProcesses = [];
}

app.whenReady().then(async () => {
  try {
    initStartupLog();
    workspaceRoot = resolveWorkspaceRoot();
    appendStartupLog(`Workspace root: ${workspaceRoot}`);
    appendStartupLog(`Bundled root: ${bundledProjectRoot}`);
    appendStartupLog(
      `PORTABLE_EXECUTABLE_DIR: ${process.env.PORTABLE_EXECUTABLE_DIR ?? "(not set)"}`
    );
    createSplashWindow();
    setSplashProgress(20);

    const earlyExitPromise = startCmsServer();
    setSplashProgress(50);
    await waitForCmsServer(earlyExitPromise);
    createMainWindow();
    createAppMenu();
    setupReadyProdWatcher();
  } catch (error) {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
    }

    const recentLogs = startupLogTail.slice(-20).join("\n");
    dialog.showErrorBox(
      "CMS Startup Failed",
      `Could not start Astro CMS server at ${DEV_SERVER_URL}.\n\n${error}\n\nStartup log:\n${startupLogPath}\n\nRecent output:\n${recentLogs}`
    );
    app.quit();
  }
});

app.on("window-all-closed", () => {
  stopCmsServer();
  app.quit();
});

app.on("before-quit", () => {
  stopCmsServer();
  if (startupLogStream) {
    startupLogStream.end();
    startupLogStream = null;
  }
});
