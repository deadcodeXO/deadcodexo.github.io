import { app, BrowserWindow, dialog, ipcMain, Menu, shell, Notification } from "electron";
import { spawn } from "node:child_process";
import http from "node:http";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { provisionWorkspaceFromPayload } from "./provision.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const bundledProjectRoot = path.resolve(__dirname, "..");

// ======= Electron + CMS Server Constants =======
const DEV_SERVER_HOST = "127.0.0.1";        // Astro dev server host
const DEV_SERVER_PORT = 4321;               // Astro dev server port
const DEV_SERVER_URL = `http://${DEV_SERVER_HOST}:${DEV_SERVER_PORT}`; // Astro URL
const MONACO_ASSET_HOST = DEV_SERVER_HOST;
const MONACO_ASSET_PORT_START = 4382;
const MONACO_ASSET_PORT_END = 4499;
const DEFAULT_LMSTUDIO_BASE_URL = "http://127.0.0.1:1234/v1";

const DEFAULT_DECAP_PORT = 8081;            // Default Decap CMS proxy port
const MAX_DECAP_PORT = 8199;                // Optional upper bound if auto-incrementing ports
const MAX_WORKSPACE_FILES = 5000;
const MAX_WORKSPACE_FILE_SIZE_BYTES = 2 * 1024 * 1024;
const MONACO_VERSION = "0.53.0";
const MONACO_CDN_AMD_BASE_URL = `https://cdn.jsdelivr.net/npm/monaco-editor@${MONACO_VERSION}/min/vs`;
const MONACO_CDN_ESM_BASE_URL = `https://cdn.jsdelivr.net/npm/monaco-editor@${MONACO_VERSION}/esm/vs`;
const WORKSPACE_IGNORED_DIRS = new Set([
  ".git",
  ".astro",
  ".dcx",
  "node_modules",
  "dist",
  "release",
  "release-fresh",
]);
const WORKSPACE_IGNORED_FILES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
]);
const WORKSPACE_KNOWN_TEXT_EXTENSIONS = new Set([
  ".astro",
  ".md",
  ".md2",
  ".mdx",
  ".markdown",
  ".mdown",
  ".mkd",
  ".txt",
  ".json",
  ".jsonc",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".html",
  ".yml",
  ".yaml",
  ".toml",
  ".xml",
  ".svg",
  ".sh",
  ".ps1",
  ".bat",
  ".cmd",
  ".env",
  ".ini",
  ".conf",
  ".gitignore",
  ".prettierignore",
  ".dockerignore",
  ".eslintignore",
  ".editorconfig",
]);
const WORKSPACE_BLOCKED_BINARY_EXTENSIONS = new Set([
  ".a",
  ".7z",
  ".avi",
  ".bin",
  ".bmp",
  ".class",
  ".db",
  ".db3",
  ".dll",
  ".dmg",
  ".doc",
  ".docx",
  ".eot",
  ".exe",
  ".flac",
  ".gif",
  ".gz",
  ".ico",
  ".iso",
  ".jar",
  ".jpeg",
  ".jpg",
  ".lib",
  ".lockb",
  ".m4a",
  ".mov",
  ".mp3",
  ".mp4",
  ".o",
  ".obj",
  ".otf",
  ".pdf",
  ".png",
  ".ppt",
  ".pptx",
  ".pyc",
  ".rar",
  ".so",
  ".sqlite",
  ".sqlite3",
  ".tar",
  ".tif",
  ".tiff",
  ".ttf",
  ".wasm",
  ".wav",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
  ".xls",
  ".xlsx",
  ".xz",
  ".zip",
]);

let mainWindow = null;
let splashWindow = null;
let splashWindowReady = false;
let splashFlushScheduled = false;
let pendingSplashProgress = 0;
let pendingSplashTitle = "Starting content editor...";
let pendingSplashDetail = "Bootstrapping Monaco + Astro + Decap";
let cmsServerProcesses = [];
let startupLogPath = "";
let startupLogStream = null;
let workspaceRoot = bundledProjectRoot;
let decapServerPort = DEFAULT_DECAP_PORT;
const startupLogTail = [];
let monacoAssetServer = null;
let monacoAssetBaseUrl = "";
let monacoEsmBaseUrl = "";
let monacoShellUrl = "";
let monacoPilotScriptUrl = "";
let monacoAssetSourceDir = "";

let readyProdRunning = false;
let readyProdLastStatus = "idle";

function toPosixPath(value) {
  return value.replaceAll("\\", "/");
}

function normalizeLmStudioBaseUrl(rawValue) {
  const fallback = DEFAULT_LMSTUDIO_BASE_URL;
  const raw = String(rawValue || fallback).trim();
  const withProtocol = /^[a-z]+:\/\//i.test(raw) ? raw : `http://${raw}`;
  try {
    const url = new URL(withProtocol);
    return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
  } catch {
    return fallback.replace(/\/+$/, "");
  }
}

function getLmStudioApiBaseCandidates(rawBaseUrl) {
  const normalized = normalizeLmStudioBaseUrl(rawBaseUrl);
  const candidates = [];
  const pushUnique = value => {
    if (!value) return;
    const cleaned = String(value).replace(/\/+$/, "");
    if (!cleaned || candidates.includes(cleaned)) return;
    candidates.push(cleaned);
  };

  if (normalized.endsWith("/v1")) {
    pushUnique(normalized);
    pushUnique(normalized.slice(0, -3));
  } else {
    pushUnique(`${normalized}/v1`);
    pushUnique(normalized);
  }

  return candidates;
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

function buildLmStudioPrompt(completionMetadata) {
  const stack = [completionMetadata?.language, ...(completionMetadata?.technologies || [])]
    .filter(Boolean)
    .join(", ");
  const relatedFiles = Array.isArray(completionMetadata?.relatedFiles)
    ? completionMetadata.relatedFiles
    : [];
  const relatedContext = relatedFiles
    .slice(0, 4)
    .map(file => `### ${file.path}\n${file.content || ""}`)
    .join("\n\n");

  return [
    stack ? `Tech stack: ${stack}` : "",
    completionMetadata?.filename ? `File: ${completionMetadata.filename}` : "",
    relatedContext ? `Related files:\n${relatedContext}` : "",
    "Current code:",
    "```",
    `${completionMetadata?.textBeforeCursor || ""}<|cursor|>${completionMetadata?.textAfterCursor || ""}`,
    "```",
    "",
    "Return only the completion text to insert at the cursor.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function resolveLmStudioModelFromApiBases({
  apiBases,
  apiKey,
  explicitModel,
}) {
  if (explicitModel) return explicitModel;
  const headers = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  for (const apiBase of apiBases) {
    const modelsUrl = `${apiBase}/models`;
    try {
      const response = await fetchJsonWithTimeout(
        modelsUrl,
        { method: "GET", headers },
        6000
      );
      if (!response.ok) continue;
      const payload = await response.json();
      const modelId = Array.isArray(payload?.data) ? payload.data[0]?.id : "";
      if (typeof modelId === "string" && modelId.trim()) {
        return modelId.trim();
      }
    } catch {
      // Try next candidate.
    }
  }

  return "local-model";
}

async function requestLmStudioCompletionFromMain(payload) {
  const body = payload?.body;
  const metadata = body?.completionMetadata;
  if (!metadata || typeof metadata !== "object") {
    return { completion: null, error: "Missing completion metadata." };
  }

  const lmstudio = payload?.lmstudio || {};
  const configuredBase =
    lmstudio.baseUrl || process.env.DCX_LMSTUDIO_BASE_URL || DEFAULT_LMSTUDIO_BASE_URL;
  const apiBases = getLmStudioApiBaseCandidates(configuredBase);
  const apiKey = String(lmstudio.apiKey || process.env.DCX_LMSTUDIO_API_KEY || "lm-studio");
  const model = await resolveLmStudioModelFromApiBases({
    apiBases,
    apiKey,
    explicitModel: String(lmstudio.model || process.env.DCX_LMSTUDIO_MODEL || "").trim(),
  });
  const prompt = buildLmStudioPrompt(metadata);
  const temperature = Number.isFinite(Number(lmstudio.temperature))
    ? Number(lmstudio.temperature)
    : 0.2;
  const maxTokens = Number.isFinite(Number(lmstudio.maxTokens))
    ? Number(lmstudio.maxTokens)
    : 192;

  const headers = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const errors = [];
  for (const apiBase of apiBases) {
    const endpoint = `${apiBase}/chat/completions`;
    try {
      const response = await fetchJsonWithTimeout(
        endpoint,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            model,
            temperature,
            max_tokens: maxTokens,
            stream: false,
            messages: [
              {
                role: "system",
                content:
                  "You are a code completion engine. Return only code to insert at the cursor. No markdown.",
              },
              {
                role: "user",
                content: prompt,
              },
            ],
          }),
        },
        20000
      );

      if (!response.ok) {
        const text = await response.text();
        errors.push(`${endpoint} -> ${response.status} ${text}`);
        continue;
      }

      const completionPayload = await response.json();
      const completion =
        completionPayload?.choices?.[0]?.message?.content ??
        completionPayload?.choices?.[0]?.text ??
        null;
      return {
        completion: typeof completion === "string" ? completion : null,
      };
    } catch (error) {
      errors.push(
        `${endpoint} -> ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  const detail = errors.length ? errors.join(" | ") : "unknown error";
  return {
    completion: null,
    error: `LM Studio request failed (${configuredBase}): ${detail}`,
  };
}

function isPathInsideRoot(rootPath, targetPath) {
  const normalizeForCompare = value =>
    process.platform === "win32" ? value.toLowerCase() : value;
  const root = normalizeForCompare(path.resolve(rootPath));
  const resolved = normalizeForCompare(path.resolve(targetPath));
  if (resolved === root) return true;
  return resolved.startsWith(`${root}${path.sep}`);
}

function isPathInsideWorkspace(targetPath) {
  return isPathInsideRoot(workspaceRoot, targetPath);
}

function resolveWorkspacePath(relativePath) {
  if (typeof relativePath !== "string" || !relativePath.trim()) {
    throw new Error("Expected a non-empty workspace path.");
  }

  const normalizedInput = relativePath.replaceAll("/", path.sep).replaceAll("\\", path.sep);
  const resolved = path.resolve(workspaceRoot, normalizedInput);
  if (!isPathInsideWorkspace(resolved)) {
    throw new Error(`Workspace path is outside the repo root: ${relativePath}`);
  }

  return resolved;
}

function getWorkspaceFileExtension(fileName) {
  return path.extname(fileName.toLowerCase());
}

function isBlockedWorkspaceBinaryFile(fileName) {
  const base = fileName.toLowerCase();
  const extension = getWorkspaceFileExtension(base);
  return Boolean(extension && WORKSPACE_BLOCKED_BINARY_EXTENSIONS.has(extension));
}

function isWorkspaceEditorFile(fileName) {
  const base = fileName.toLowerCase();
  if (WORKSPACE_IGNORED_FILES.has(base)) return false;
  return !isBlockedWorkspaceBinaryFile(base);
}

function isKnownTextWorkspaceFile(fileName) {
  const base = fileName.toLowerCase();
  const extension = getWorkspaceFileExtension(base);
  if (!extension) return true;
  return WORKSPACE_KNOWN_TEXT_EXTENSIONS.has(extension);
}

function listWorkspaceFiles() {
  const files = [];

  const walk = relativeDir => {
    const absoluteDir = relativeDir
      ? path.join(workspaceRoot, relativeDir)
      : workspaceRoot;

    const entries = readdirSync(absoluteDir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (entry.name === "." || entry.name === "..") continue;
      const relativePath = relativeDir
        ? path.join(relativeDir, entry.name)
        : entry.name;

      if (entry.isDirectory()) {
        if (WORKSPACE_IGNORED_DIRS.has(entry.name)) continue;
        walk(relativePath);
        if (files.length >= MAX_WORKSPACE_FILES) return;
        continue;
      }

      if (!entry.isFile()) continue;
      if (!isWorkspaceEditorFile(entry.name)) continue;

      files.push(toPosixPath(relativePath));
      if (files.length >= MAX_WORKSPACE_FILES) return;
    }
  };

  walk("");
  return files;
}

function isValidMonacoPackageDir(monacoPackageDir) {
  if (!monacoPackageDir) return false;
  const amdLoaderPath = path.join(monacoPackageDir, "min", "vs", "loader.js");
  const esmEditorApiPath = path.join(
    monacoPackageDir,
    "esm",
    "vs",
    "editor",
    "editor.api.js"
  );
  return existsSync(amdLoaderPath) && existsSync(esmEditorApiPath);
}

function getWorkspaceMonacoPackageDir() {
  return path.join(workspaceRoot, "node_modules", "monaco-editor");
}

function getBundledMonacoPackageDirs() {
  const dirs = [];
  const pushUnique = value => {
    if (!value) return;
    if (dirs.includes(value)) return;
    dirs.push(value);
  };

  pushUnique(path.join(bundledProjectRoot, "node_modules", "monaco-editor"));
  pushUnique(
    path.join(
      process.resourcesPath,
      "app.asar.unpacked",
      "node_modules",
      "monaco-editor"
    )
  );
  pushUnique(path.join(process.resourcesPath, "node_modules", "monaco-editor"));

  return dirs;
}

function getMonacoCacheRootDir() {
  return path.join(app.getPath("userData"), "monaco-cache", `v${MONACO_VERSION}`);
}

function isValidMonacoCacheRoot(cacheRootDir) {
  if (!cacheRootDir) return false;
  const amdLoaderPath = path.join(cacheRootDir, "min", "vs", "loader.js");
  const esmEditorApiPath = path.join(
    cacheRootDir,
    "esm",
    "vs",
    "editor",
    "editor.api.js"
  );
  return existsSync(amdLoaderPath) && existsSync(esmEditorApiPath);
}

function ensureMonacoCache() {
  const cacheRootDir = getMonacoCacheRootDir();
  if (isValidMonacoCacheRoot(cacheRootDir)) return cacheRootDir;
  return null;
}

function getMonacoPackageSourceDir() {
  const localPackage = getWorkspaceMonacoPackageDir();
  if (isValidMonacoPackageDir(localPackage)) return localPackage;

  for (const bundledPackageDir of getBundledMonacoPackageDirs()) {
    if (isValidMonacoPackageDir(bundledPackageDir)) {
      return bundledPackageDir;
    }
  }

  const cachedRoot = ensureMonacoCache();
  if (cachedRoot && isValidMonacoCacheRoot(cachedRoot)) {
    return cachedRoot;
  }

  return "";
}

function getWorkspaceMonacoPilotScriptPath() {
  return path.join(
    workspaceRoot,
    "node_modules",
    "monacopilot",
    "dist",
    "index.global.js"
  );
}

function getBundledMonacoPilotScriptPaths() {
  const paths = [];
  const pushUnique = value => {
    if (!value) return;
    if (paths.includes(value)) return;
    paths.push(value);
  };

  pushUnique(
    path.join(
      bundledProjectRoot,
      "node_modules",
      "monacopilot",
      "dist",
      "index.global.js"
    )
  );
  pushUnique(
    path.join(
      process.resourcesPath,
      "app.asar.unpacked",
      "node_modules",
      "monacopilot",
      "dist",
      "index.global.js"
    )
  );
  pushUnique(
    path.join(
      process.resourcesPath,
      "node_modules",
      "monacopilot",
      "dist",
      "index.global.js"
    )
  );

  return paths;
}

function getMonacoPilotScriptPath() {
  const workspaceScript = getWorkspaceMonacoPilotScriptPath();
  if (existsSync(workspaceScript)) return workspaceScript;

  for (const bundledScript of getBundledMonacoPilotScriptPaths()) {
    if (existsSync(bundledScript)) return bundledScript;
  }

  return "";
}

function getMonacoEsmBaseUrls() {
  const urls = [];
  const pushUnique = value => {
    if (!value) return;
    if (urls.includes(value)) return;
    urls.push(value);
  };

  if (monacoEsmBaseUrl) {
    pushUnique(monacoEsmBaseUrl);
  }
  pushUnique(MONACO_CDN_ESM_BASE_URL);
  return urls;
}

function getMonacoAmdBaseUrls() {
  const urls = [];
  const pushUnique = value => {
    if (!value) return;
    if (urls.includes(value)) return;
    urls.push(value);
  };

  if (monacoAssetBaseUrl) {
    pushUnique(monacoAssetBaseUrl);
  }
  if (!urls.length) {
    pushUnique(MONACO_CDN_AMD_BASE_URL);
  }
  return urls;
}

function getMonacoBaseUrls() {
  return getMonacoAmdBaseUrls();
}

function getMonacoMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".ttf":
      return "font/ttf";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    case ".map":
      return "application/json; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function stopMonacoAssetServer() {
  if (!monacoAssetServer) return;
  try {
    monacoAssetServer.close();
  } catch {
    // Ignore close errors during shutdown.
  }
  monacoAssetServer = null;
  monacoAssetBaseUrl = "";
  monacoEsmBaseUrl = "";
  monacoShellUrl = "";
  monacoPilotScriptUrl = "";
  monacoAssetSourceDir = "";
}

async function startMonacoAssetServer() {
  if (monacoAssetServer && monacoAssetBaseUrl) {
    return monacoAssetBaseUrl;
  }

  const sourceDir = getMonacoPackageSourceDir();

  if (!sourceDir) {
    appendStartupLog("Monaco asset server skipped: no valid local Monaco source.");
    return "";
  }

  const port = await findAvailablePort(
    MONACO_ASSET_HOST,
    MONACO_ASSET_PORT_START,
    MONACO_ASSET_PORT_END
  );

  const server = http.createServer((request, response) => {
    try {
      const requestUrl = new URL(
        request.url || "/",
        `http://${MONACO_ASSET_HOST}:${String(port)}`
      );
      const pathname = decodeURIComponent(requestUrl.pathname || "/");
      if (pathname === "/" || pathname === "/index.html") {
        response.writeHead(302, { Location: "/shell.html" });
        response.end();
        return;
      }

      if (pathname === "/shell.html" || pathname === "/shell.js") {
        const shellFileName = pathname === "/shell.html" ? "shell.html" : "shell.js";
        const shellFilePath = path.join(__dirname, shellFileName);
        if (!existsSync(shellFilePath)) {
          response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          response.end("Not found");
          return;
        }

        const shellBody = readFileSync(shellFilePath);
        response.writeHead(200, {
          "Content-Type":
            shellFileName === "shell.html"
              ? "text/html; charset=utf-8"
              : "application/javascript; charset=utf-8",
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "Access-Control-Allow-Origin": "*",
        });
        response.end(shellBody);
        return;
      }

      if (pathname === "/vendor/monacopilot.js") {
        const monacoPilotScriptPath = getMonacoPilotScriptPath();
        if (!monacoPilotScriptPath || !existsSync(monacoPilotScriptPath)) {
          response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          response.end("Not found");
          return;
        }

        const monacoPilotBody = readFileSync(monacoPilotScriptPath);
        response.writeHead(200, {
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "Access-Control-Allow-Origin": "*",
        });
        response.end(monacoPilotBody);
        return;
      }

      const assetPrefix =
        pathname.startsWith("/monaco/esm/vs/")
          ? "/monaco/esm/vs/"
          : pathname.startsWith("/monaco/min/vs/")
            ? "/monaco/min/vs/"
            : "";
      if (!assetPrefix) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
      }

      const relativePath = pathname.slice(assetPrefix.length);
      if (!relativePath || relativePath.endsWith("/")) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
      }

      const normalizedRelative = path.normalize(relativePath);
      const monacoSubRoot = assetPrefix === "/monaco/esm/vs/" ? "esm" : "min";
      const monacoVsRoot = path.join(sourceDir, monacoSubRoot, "vs");
      const absolutePath = path.resolve(monacoVsRoot, normalizedRelative);
      if (!isPathInsideRoot(monacoVsRoot, absolutePath)) {
        response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Forbidden");
        return;
      }

      let fileStat = null;
      try {
        fileStat = statSync(absolutePath);
      } catch {
        fileStat = null;
      }
      if (!fileStat || !fileStat.isFile()) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
      }

      const contents = readFileSync(absolutePath);
      response.writeHead(200, {
        "Content-Type": getMonacoMimeType(absolutePath),
        "Cache-Control": "public, max-age=31536000, immutable",
        "Access-Control-Allow-Origin": "*",
      });
      response.end(contents);
    } catch (error) {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(`Monaco asset error: ${error.message}`);
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, MONACO_ASSET_HOST, () => resolve(undefined));
  });

  monacoAssetServer = server;
  monacoShellUrl = `http://${MONACO_ASSET_HOST}:${String(port)}/shell.html`;
  monacoAssetBaseUrl = `http://${MONACO_ASSET_HOST}:${String(port)}/monaco/min/vs`;
  monacoEsmBaseUrl = `http://${MONACO_ASSET_HOST}:${String(port)}/monaco/esm/vs`;
  monacoPilotScriptUrl = `http://${MONACO_ASSET_HOST}:${String(port)}/vendor/monacopilot.js`;
  monacoAssetSourceDir = sourceDir;
  appendStartupLog(
    `Companion asset server ready at ${monacoShellUrl} (source: ${monacoAssetSourceDir})`
  );
  const monacoPilotScriptPath = getMonacoPilotScriptPath();
  if (monacoPilotScriptPath) {
    appendStartupLog(`MonacoPilot script ready: ${monacoPilotScriptPath}`);
  } else {
    appendStartupLog("MonacoPilot script not found in local dependencies.");
  }
  return monacoAssetBaseUrl;
}


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

function flushSplashState() {
  if (!splashWindow || splashWindow.isDestroyed() || !splashWindowReady) return;

  const progress = Number.isFinite(pendingSplashProgress)
    ? String(Math.max(0, Math.min(100, pendingSplashProgress)))
    : "0";
  const safeTitle = JSON.stringify(pendingSplashTitle ?? "");
  const safeDetail = JSON.stringify(pendingSplashDetail ?? "");

  splashWindow.webContents
    .executeJavaScript(
      `window.setProgress?.(${progress}); window.setSplashStatus?.(${safeTitle}, ${safeDetail});`
    )
    .catch(error => appendStartupLog(`Splash state update error: ${error.message}`));
}

function queueSplashFlush() {
  if (!splashWindow || splashWindow.isDestroyed() || !splashWindowReady) return;
  if (splashFlushScheduled) return;

  splashFlushScheduled = true;
  queueMicrotask(() => {
    splashFlushScheduled = false;
    flushSplashState();
  });
}

function setSplashProgress(percent) {
  pendingSplashProgress = Number.isFinite(percent)
    ? Math.max(0, Math.min(100, Math.round(percent)))
    : pendingSplashProgress;
  queueSplashFlush();
}

function setSplashStatus(title, detail = "") {
  pendingSplashTitle = typeof title === "string" && title.length
    ? title
    : pendingSplashTitle;
  pendingSplashDetail = typeof detail === "string" && detail.length
    ? detail
    : pendingSplashDetail;
  queueSplashFlush();
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

ipcMain.handle("workspace-info", () => ({
  rootName: path.basename(workspaceRoot),
  rootPath: workspaceRoot,
}));

ipcMain.handle("workspace-list-files", () => {
  const files = listWorkspaceFiles();
  return {
    files,
    truncated: files.length >= MAX_WORKSPACE_FILES,
  };
});

ipcMain.handle("workspace-read-file", (_event, relativePath) => {
  const absolutePath = resolveWorkspacePath(relativePath);
  let fileStat = null;
  try {
    fileStat = statSync(absolutePath);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
      return {
        path: toPosixPath(relativePath),
        missing: true,
      };
    }
    throw error;
  }
  if (!fileStat.isFile()) {
    throw new Error(`Not a file: ${relativePath}`);
  }

  if (fileStat.size > MAX_WORKSPACE_FILE_SIZE_BYTES) {
    throw new Error(
      `File too large for in-app editor (${String(fileStat.size)} bytes): ${relativePath}`
    );
  }

  const contents = readFileSync(absolutePath, "utf8");
  return {
    path: toPosixPath(relativePath),
    contents,
    size: fileStat.size,
    mtimeMs: fileStat.mtimeMs,
    missing: false,
  };
});

ipcMain.handle("workspace-write-file", (_event, relativePath, contents) => {
  if (typeof contents !== "string") {
    throw new Error("Expected file contents as a string.");
  }

  const absolutePath = resolveWorkspacePath(relativePath);
  const baseName = path.basename(absolutePath);
  if (isBlockedWorkspaceBinaryFile(baseName)) {
    throw new Error(
      `Blocked potentially binary file type in the in-app editor: ${relativePath}`
    );
  }

  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, contents, "utf8");
  const updatedStat = statSync(absolutePath);

  return {
    path: toPosixPath(relativePath),
    size: updatedStat.size,
    mtimeMs: updatedStat.mtimeMs,
    knownTextType: isKnownTextWorkspaceFile(baseName),
  };
});

ipcMain.handle("workspace-delete-file", (_event, relativePath) => {
  const absolutePath = resolveWorkspacePath(relativePath);
  let fileStat = null;
  try {
    fileStat = statSync(absolutePath);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
      return {
        path: toPosixPath(relativePath),
        missing: true,
      };
    }
    throw error;
  }
  if (!fileStat.isFile()) {
    throw new Error(`Not a file: ${relativePath}`);
  }

  unlinkSync(absolutePath);
  return {
    path: toPosixPath(relativePath),
    missing: false,
  };
});

ipcMain.handle("workspace-monaco-base-url", () => {
  const baseUrls = getMonacoBaseUrls();
  const esmBaseUrls = getMonacoEsmBaseUrls();
  return {
    baseUrl: baseUrls[0] || MONACO_CDN_AMD_BASE_URL,
    baseUrls,
    esmBaseUrl: esmBaseUrls[0] || MONACO_CDN_ESM_BASE_URL,
    esmBaseUrls,
  };
});

ipcMain.handle("workspace-monacopilot-config", () => {
  const baseUrlRaw = process.env.DCX_LMSTUDIO_BASE_URL || DEFAULT_LMSTUDIO_BASE_URL;
  const baseUrl = String(baseUrlRaw).replace(/\/+$/, "");
  const enabled = process.env.DCX_MONACOPILOT !== "0";
  return {
    enabled,
    scriptUrl: monacoPilotScriptUrl || "",
    lmstudio: {
      baseUrl,
      model: process.env.DCX_LMSTUDIO_MODEL || "",
      apiKey: process.env.DCX_LMSTUDIO_API_KEY || "lm-studio",
      maxTokens: Number.parseInt(process.env.DCX_LMSTUDIO_MAX_TOKENS || "192", 10) || 192,
      temperature: Number.parseFloat(process.env.DCX_LMSTUDIO_TEMPERATURE || "0.2") || 0.2,
    },
  };
});

ipcMain.handle("workspace-monacopilot-complete", async (_event, payload) => {
  try {
    return await requestLmStudioCompletionFromMain(payload);
  } catch (error) {
    return {
      completion: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
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
  splashWindowReady = false;
  splashFlushScheduled = false;
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
  splashWindow.webContents.once("did-finish-load", () => {
    splashWindowReady = true;
    flushSplashState();
  });
  splashWindow.on("closed", () => {
    splashWindowReady = false;
  });
  setSplashProgress(10);
  setSplashStatus("Starting content editor...", "Preparing launcher");
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
  appendStartupLog(`Shell file path: ${shellPath}`);
  appendStartupLog(`Editor target URL: ${editorUrl.toString()}`);
  if (monacoShellUrl) {
    const shellUrl = new URL(monacoShellUrl);
    shellUrl.searchParams.set("editorUrl", editorUrl.toString());
    shellUrl.searchParams.set("siteUrl", DEV_SERVER_URL);
    appendStartupLog(`Loading main window shell URL: ${shellUrl.toString()}`);
    mainWindow.loadURL(shellUrl.toString());
  } else {
    appendStartupLog("Companion shell URL unavailable; falling back to file:// shell.");
    mainWindow.loadFile(shellPath, {
      query: {
        editorUrl: editorUrl.toString(),
        siteUrl: DEV_SERVER_URL,
      },
    });
  }

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
      submenu: [{ role: "quit" }],
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

function getCmsServerPaths() {
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
  const monacoLoaderPath = path.join(
    workspaceRoot,
    "node_modules",
    "monaco-editor",
    "min",
    "vs",
    "loader.js"
  );
  const monacoPilotScriptPath = path.join(
    workspaceRoot,
    "node_modules",
    "monacopilot",
    "dist",
    "index.global.js"
  );

  return { astroCliPath, decapServerPath, monacoLoaderPath, monacoPilotScriptPath };
}

function runSetupCommand(label, command, args = []) {
  return new Promise((resolve, reject) => {
    const isWin = process.platform === "win32";
    const proc = spawn(command, args, {
      cwd: workspaceRoot,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      shell: isWin,
      env: {
        ...process.env,
        FORCE_COLOR: "0",
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
      reject(new Error(`${label} failed to start: ${error.message}`));
    });

    proc.on("close", code => {
      if (code === 0) {
        resolve(undefined);
        return;
      }

      reject(new Error(`${label} failed with exit code ${String(code)}.`));
    });
  });
}

async function ensureWorkspaceDependencies() {
  const { astroCliPath, decapServerPath, monacoLoaderPath, monacoPilotScriptPath } =
    getCmsServerPaths();
  const astroExists = existsSync(astroCliPath);
  const decapExists = existsSync(decapServerPath);
  const monacoExists = existsSync(monacoLoaderPath);
  const monacoPilotExists = existsSync(monacoPilotScriptPath);

  if (astroExists && decapExists && monacoExists && monacoPilotExists) {
    appendStartupLog("Workspace dependencies already present.");
    setSplashStatus("Checking dependencies...", "Dependencies already installed");
    return;
  }

  appendStartupLog(
    "Workspace dependencies missing. Running npm install (first launch on fresh clone)."
  );
  setSplashStatus("Installing dependencies...", "Running npm install for this workspace");
  await runSetupCommand("deps", "npm", ["install", "--no-audit", "--no-fund"]);

  const astroInstalled = existsSync(astroCliPath);
  const decapInstalled = existsSync(decapServerPath);
  const monacoInstalled = existsSync(monacoLoaderPath);
  const monacoPilotInstalled = existsSync(monacoPilotScriptPath);

  if (!astroInstalled || !decapInstalled || !monacoInstalled || !monacoPilotInstalled) {
    throw new Error(
      `Dependency install completed, but required binaries were not found. Missing: ${
        !astroInstalled ? "astro " : ""
      }${!decapInstalled ? "decap-server " : ""}${!monacoInstalled ? "monaco-editor " : ""}${
        !monacoPilotInstalled ? "monacopilot" : ""
      }`.trim()
    );
  }

  appendStartupLog("Workspace dependencies installed successfully.");
  setSplashStatus("Dependencies ready.", "Starting local services");
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
  const { astroCliPath, decapServerPath } = getCmsServerPaths();

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
  setSplashStatus("Starting local services...", "Booting Astro and Decap");
  decapServerPort = await findAvailablePort(
    DEV_SERVER_HOST,
    DEFAULT_DECAP_PORT,
    MAX_DECAP_PORT
  );
  appendStartupLog(`Using Decap proxy port ${decapServerPort}`);
  setSplashStatus(
    "Starting local services...",
    `Astro on ${DEV_SERVER_PORT}, Decap on ${decapServerPort}`
  );

  const astroProcess = spawnNodeProcess("astro", astroCliPath, [
    "dev",
    "--host",
    DEV_SERVER_HOST,
    "--port",
    String(DEV_SERVER_PORT),
    "--strictPort",
  ], {
    DCX_COMPANION: "1",
  });
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
    const startedAt = Date.now();
    let probeAttempts = 0;
    let ready = false;

    while (Date.now() < deadline) {
      probeAttempts += 1;
      if (probeAttempts === 1 || probeAttempts % 10 === 0) {
        const elapsedSeconds = Math.max(
          1,
          Math.round((Date.now() - startedAt) / 1000)
        );
        setSplashStatus(
          "Waiting for local server...",
          `Checking /editor (${elapsedSeconds}s elapsed)`
        );
      }

      try {
        const response = await fetch(`${DEV_SERVER_URL}/editor`, { method: "GET", cache: "no-store" });
        appendStartupLog(`[decap] probe response: ${response.status}`);
        if (response.ok) {
          appendStartupLog(`[decap] CMS ready (${response.status})`);
          setSplashStatus("Launching editor...", "Finalizing app window");
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
    createSplashWindow();
    setSplashProgress(12);
    setSplashStatus("Detecting workspace...", "Looking for Astro project root");
    workspaceRoot = resolveWorkspaceRoot();
    appendStartupLog(`Workspace root: ${workspaceRoot}`);
    appendStartupLog(`Bundled root: ${bundledProjectRoot}`);
    appendStartupLog(
      `PORTABLE_EXECUTABLE_DIR: ${process.env.PORTABLE_EXECUTABLE_DIR ?? "(not set)"}`
    );
    setSplashStatus("Workspace found.", path.basename(workspaceRoot));
    setSplashProgress(20);
    appendStartupLog("Checking workspace companion payload...");
    setSplashStatus("Checking companion files...", "Verifying /editor and /admin setup");
    const provisionSummary = provisionWorkspaceFromPayload({
      workspaceRoot,
      log: appendStartupLog,
    });
    if (provisionSummary.created > 0) {
      appendStartupLog(
        `Provisioned ${String(provisionSummary.created)} missing companion file(s).`
      );
    }
    setSplashProgress(30);
    setSplashStatus("Preparing dependencies...", "Validating Astro and Decap packages");
    await ensureWorkspaceDependencies();
    setSplashProgress(42);
    setSplashStatus("Preparing editor engine...", "Resolving Monaco source");
    const resolvedMonacoSource = getMonacoPackageSourceDir();
    if (resolvedMonacoSource) {
      appendStartupLog(`Monaco source selected: ${resolvedMonacoSource}`);
    } else {
      appendStartupLog("Monaco source unavailable before server start.");
    }
    setSplashProgress(48);
    setSplashStatus("Preparing editor assets...", "Starting local Monaco asset server");
    try {
      await startMonacoAssetServer();
    } catch (error) {
      appendStartupLog(`Monaco asset server startup failed: ${error.message}`);
    }
    setSplashProgress(52);

    setSplashStatus("Starting services...", "Launching Astro + Decap CMS");
    const earlyExitPromise = startCmsServer();
    setSplashProgress(60);
    await waitForCmsServer(earlyExitPromise);
    setSplashStatus("Opening editor window...", "Almost ready");
    createMainWindow();
    createAppMenu();
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
  stopMonacoAssetServer();
  app.quit();
});

app.on("before-quit", () => {
  stopCmsServer();
  stopMonacoAssetServer();
  if (startupLogStream) {
    startupLogStream.end();
    startupLogStream = null;
  }
});
