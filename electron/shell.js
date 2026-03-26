(() => {
  const params = new URLSearchParams(window.location.search);
  const editorUrl = params.get("editorUrl") || "http://127.0.0.1:4321/editor";
  const siteUrl = params.get("siteUrl") || "http://127.0.0.1:4321";

  const api = window.electronAPI;
  const frame = document.getElementById("editor-frame");
  const buildBtn = document.getElementById("build-btn");
  const toggleEditorBtn = document.getElementById("toggle-editor-btn");
  const toggleConsoleBtn = document.getElementById("toggle-console-btn");
  const buildStatus = document.getElementById("build-status");
  const consoleBody = document.getElementById("console-body");
  const consoleEl = document.getElementById("console");
  const statusDot = document.getElementById("status-dot");
  const repoLabel = document.getElementById("repo-label");
  const editorStatus = document.getElementById("editor-status");
  const currentFileLabel = document.getElementById("current-file-label");
  const saveFileBtn = document.getElementById("save-file-btn");
  const saveAsFileBtn = document.getElementById("save-as-file-btn");
  const undoFileBtn = document.getElementById("undo-file-btn");
  const redoFileBtn = document.getElementById("redo-file-btn");
  const deleteFileBtn = document.getElementById("delete-file-btn");
  const newFileBtn = document.getElementById("new-file-btn");
  const refreshFilesBtn = document.getElementById("refresh-files-btn");
  const fileFilterInput = document.getElementById("file-filter-input");
  const fileListEl = document.getElementById("file-list");
  const editorEmpty = document.getElementById("editor-empty");
  const plainEditor = document.getElementById("plain-editor");
  const monacoHost = document.getElementById("monaco-host");
  const workspaceMain = document.getElementById("workspace-main");
  const workspaceResizer = document.getElementById("workspace-resizer");
  const confirmOverlay = document.getElementById("confirm-overlay");
  const confirmTitle = document.getElementById("confirm-title");
  const confirmBody = document.getElementById("confirm-body");
  const confirmOkBtn = document.getElementById("confirm-ok-btn");
  const confirmCancelBtn = document.getElementById("confirm-cancel-btn");
  const pathModalOverlay = document.getElementById("path-modal-overlay");
  const pathModalTitle = document.getElementById("path-modal-title");
  const pathModalBody = document.getElementById("path-modal-body");
  const pathModalInput = document.getElementById("path-modal-input");
  const pathModalOkBtn = document.getElementById("path-modal-ok-btn");
  const pathModalCancelBtn = document.getElementById("path-modal-cancel-btn");

  const editorOrigin = (() => {
    try {
      return new URL(editorUrl).origin;
    } catch {
      return null;
    }
  })();

  const siteOrigin = (() => {
    try {
      return new URL(siteUrl).origin;
    } catch {
      return null;
    }
  })();

  const messageOrigin = editorOrigin ?? siteOrigin ?? "*";
  const CODE_PANE_WIDTH_KEY = "dcx-code-pane-width";
  const LAST_OPEN_FILE_KEY = "dcx-last-open-file";
  const EDITOR_VISIBLE_KEY = "dcx-editor-visible";
  const CONSOLE_VISIBLE_KEY = "dcx-console-visible";
  const FRAME_HIDE_STYLE_ID = "dcx-hide-astro-dev-toolbar";
  const FRAME_HIDE_CSS = `
    astro-dev-toolbar,
    astro-dev-toolbar-window,
    astro-dev-toolbar-app,
    [data-astro-dev-toolbar],
    [id*="astro-dev-toolbar"] {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }
  `;

  let frameThemeObserver = null;
  let observedThemeDocument = null;
  let frameUiObserver = null;
  let observedUiDocument = null;
  let workspaceFiles = [];
  let filesTruncated = false;
  let activeFilePath = "";
  let lastSavedContents = "";
  let isDirty = false;
  let saveInProgress = false;
  let monacoReadyPromise = null;
  let monacoInstance = null;
  let monacoEditor = null;
  let activeEditorMode = "none";
  let monacoFailureLogged = false;
  let editorVisible = true;
  let consoleVisible = true;
  let pendingConfirmResolve = null;
  let pendingPathModalResolve = null;
  let saveAsInProgress = false;
  let currentTheme = "dark";
  const expandedDirs = new Set([""]);
  const loadedScriptUrls = new Set();
  const plainUndoStack = [];
  const plainRedoStack = [];
  const unknownWriteApprovalPaths = new Set();
  let applyingPlainHistory = false;
  let applyingMonacoProgrammaticChange = false;
  const KNOWN_TEXT_EXTENSIONS = new Set([
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
  ]);
  const BLOCKED_BINARY_EXTENSIONS = new Set([
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

  if (frame) frame.src = editorUrl;

  const log = message => {
    if (!consoleBody) return;
    const stamp = new Date().toLocaleTimeString();
    consoleBody.textContent += `[${stamp}] ${message}\n`;
    consoleBody.scrollTop = consoleBody.scrollHeight;
  };

  const setBusy = busy => {
    if (buildBtn) buildBtn.classList.toggle("busy", busy);
    if (statusDot) {
      statusDot.style.background = busy ? "#66a2ff" : "#4bc37a";
      statusDot.style.boxShadow = busy
        ? "0 0 0 3px rgba(102, 162, 255, 0.2)"
        : "0 0 0 3px rgba(75, 195, 122, 0.2)";
    }
  };

  const setStatus = text => {
    if (buildStatus) buildStatus.textContent = text;
  };

  const setEditorStatus = text => {
    if (editorStatus) editorStatus.textContent = text;
  };

  const setEditorPaneVisible = visible => {
    editorVisible = Boolean(visible);
    workspaceMain?.classList.toggle("editor-hidden", !editorVisible);
    if (toggleEditorBtn) {
      toggleEditorBtn.classList.toggle("active", editorVisible);
      toggleEditorBtn.title = editorVisible ? "Hide editor" : "Show editor";
      toggleEditorBtn.setAttribute(
        "aria-label",
        editorVisible ? "Hide code editor pane" : "Show code editor pane"
      );
    }
    window.localStorage.setItem(EDITOR_VISIBLE_KEY, editorVisible ? "1" : "0");
    if (monacoEditor) {
      window.requestAnimationFrame(() => monacoEditor.layout());
    }
  };

  const setConsolePaneVisible = visible => {
    consoleVisible = Boolean(visible);
    consoleEl?.classList.toggle("minimized", !consoleVisible);
    if (toggleConsoleBtn) {
      toggleConsoleBtn.classList.toggle("active", consoleVisible);
      toggleConsoleBtn.title = consoleVisible ? "Hide console" : "Show console";
      toggleConsoleBtn.setAttribute(
        "aria-label",
        consoleVisible ? "Hide console panel" : "Show console panel"
      );
    }
    window.localStorage.setItem(CONSOLE_VISIBLE_KEY, consoleVisible ? "1" : "0");
  };

  const updateCurrentFileLabel = () => {
    if (!currentFileLabel) return;
    if (!activeFilePath) {
      currentFileLabel.textContent = "No file selected";
      return;
    }
    currentFileLabel.textContent = isDirty ? `${activeFilePath} *` : activeFilePath;
  };

  const updateSaveButtonState = () => {
    if (!saveFileBtn) return;
    const canEdit = Boolean(activeFilePath) && activeEditorMode !== "none";
    const isBusy = saveInProgress || saveAsInProgress;
    const canUndoPlain = activeEditorMode === "plain" && plainUndoStack.length > 1;
    const canRedoPlain = activeEditorMode === "plain" && plainRedoStack.length > 0;
    const canUndo = activeEditorMode === "plain" ? canUndoPlain : canEdit;
    const canRedo = activeEditorMode === "plain" ? canRedoPlain : canEdit;
    saveFileBtn.disabled = !canEdit || isBusy;
    saveFileBtn.style.opacity = saveFileBtn.disabled ? "0.5" : "1";
    saveFileBtn.style.cursor = saveFileBtn.disabled ? "default" : "pointer";

    if (saveAsFileBtn) {
      saveAsFileBtn.disabled = activeEditorMode === "none" || isBusy;
      saveAsFileBtn.style.opacity = saveAsFileBtn.disabled ? "0.5" : "1";
      saveAsFileBtn.style.cursor = saveAsFileBtn.disabled ? "default" : "pointer";
    }

    if (undoFileBtn) {
      undoFileBtn.disabled = !canUndo || isBusy;
      undoFileBtn.style.opacity = undoFileBtn.disabled ? "0.5" : "1";
      undoFileBtn.style.cursor = undoFileBtn.disabled ? "default" : "pointer";
    }

    if (redoFileBtn) {
      redoFileBtn.disabled = !canRedo || isBusy;
      redoFileBtn.style.opacity = redoFileBtn.disabled ? "0.5" : "1";
      redoFileBtn.style.cursor = redoFileBtn.disabled ? "default" : "pointer";
    }

    if (deleteFileBtn) {
      deleteFileBtn.disabled = !activeFilePath || isBusy;
      deleteFileBtn.style.opacity = deleteFileBtn.disabled ? "0.5" : "1";
      deleteFileBtn.style.cursor = deleteFileBtn.disabled ? "default" : "pointer";
    }

    if (newFileBtn) {
      newFileBtn.disabled = isBusy;
      newFileBtn.style.opacity = newFileBtn.disabled ? "0.5" : "1";
      newFileBtn.style.cursor = newFileBtn.disabled ? "default" : "pointer";
    }
  };

  const reloadFrame = () => {
    if (!frame) return;
    frame.src = editorUrl;
    log("Editor refreshed.");
  };

  const applyMonacoTheme = theme => {
    if (!monacoInstance?.editor) return;
    monacoInstance.editor.setTheme(theme === "light" ? "vs" : "vs-dark");
  };

  const applyShellTheme = theme => {
    const normalizedTheme = theme === "light" ? "light" : "dark";
    currentTheme = normalizedTheme;
    document.body.setAttribute("data-theme", normalizedTheme);
    applyMonacoTheme(normalizedTheme);
  };

  const requestThemeFromEditor = () => {
    if (!frame || !frame.contentWindow) return;
    frame.contentWindow.postMessage({ type: "companion-request-theme" }, messageOrigin);
  };

  const readThemeFromFrame = () => {
    if (!frame) return null;
    try {
      const doc = frame.contentDocument;
      const themeAttr = doc?.documentElement?.getAttribute("data-theme");
      if (themeAttr === "light" || themeAttr === "dark") return themeAttr;
      const stored = frame.contentWindow?.localStorage?.getItem("theme");
      if (stored === "light" || stored === "dark") return stored;
    } catch {
      return null;
    }
    return null;
  };

  const syncThemeFromFrame = () => {
    const frameTheme = readThemeFromFrame();
    if (!frameTheme) return;
    applyShellTheme(frameTheme);
  };

  const bindFrameThemeObserver = () => {
    if (!frame) return;
    let frameDoc = null;
    try {
      frameDoc = frame.contentDocument;
    } catch {
      return;
    }
    if (!frameDoc || frameDoc === observedThemeDocument) return;
    observedThemeDocument = frameDoc;

    if (frameThemeObserver) {
      frameThemeObserver.disconnect();
      frameThemeObserver = null;
    }

    const root = frameDoc.documentElement;
    if (!root) return;

    frameThemeObserver = new MutationObserver(() => {
      syncThemeFromFrame();
    });

    frameThemeObserver.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    syncThemeFromFrame();
  };

  const hideAstroDevToolbarInDocument = doc => {
    if (!doc) return;
    const root = doc.documentElement;
    if (!root) return;

    let styleEl = doc.getElementById(FRAME_HIDE_STYLE_ID);
    if (!styleEl) {
      styleEl = doc.createElement("style");
      styleEl.id = FRAME_HIDE_STYLE_ID;
      styleEl.textContent = FRAME_HIDE_CSS;
      (doc.head || root).appendChild(styleEl);
    }

    doc
      .querySelectorAll(
        "astro-dev-toolbar, astro-dev-toolbar-window, astro-dev-toolbar-app, [data-astro-dev-toolbar], [id*='astro-dev-toolbar']"
      )
      .forEach(node => {
        node.style.display = "none";
      });
  };

  const hideAstroDevToolbarInFrameTree = () => {
    if (!frame) return;
    try {
      const topDoc = frame.contentDocument;
      if (!topDoc) return;
      hideAstroDevToolbarInDocument(topDoc);
      topDoc.querySelectorAll("iframe").forEach(innerFrame => {
        try {
          hideAstroDevToolbarInDocument(innerFrame.contentDocument);
        } catch {
          // Ignore cross-origin iframes.
        }
      });
    } catch {
      // Ignore frame access errors during navigation.
    }
  };

  const bindFrameUiObserver = () => {
    if (!frame) return;
    let frameDoc = null;
    try {
      frameDoc = frame.contentDocument;
    } catch {
      return;
    }
    if (!frameDoc || frameDoc === observedUiDocument) return;
    observedUiDocument = frameDoc;

    if (frameUiObserver) {
      frameUiObserver.disconnect();
      frameUiObserver = null;
    }

    const root = frameDoc.documentElement;
    if (!root) return;

    frameUiObserver = new MutationObserver(() => {
      hideAstroDevToolbarInFrameTree();
    });

    frameUiObserver.observe(root, {
      childList: true,
      subtree: true,
    });

    hideAstroDevToolbarInFrameTree();
  };

  const callWindowControl = fnName => {
    const fn = api && api[fnName];
    if (typeof fn !== "function") {
      log(`Window control unavailable: ${fnName}`);
      return;
    }
    fn().catch(() => {
      log(`Window control failed: ${fnName}`);
    });
  };

  const clampCodePaneWidth = width => {
    if (!workspaceMain) return 470;
    const total = workspaceMain.clientWidth || 1200;
    const minWidth = 320;
    const maxWidth = Math.max(minWidth + 60, total - 420);
    return Math.max(minWidth, Math.min(maxWidth, Math.round(width)));
  };

  const applyCodePaneWidth = width => {
    const nextWidth = clampCodePaneWidth(width);
    workspaceMain?.style.setProperty("--code-pane-width", `${nextWidth}px`);
    return nextWidth;
  };

  const initSplitter = () => {
    if (!workspaceResizer || !workspaceMain) return;

    const savedWidth = Number.parseInt(window.localStorage.getItem(CODE_PANE_WIDTH_KEY) || "", 10);
    const initialWidth = Number.isFinite(savedWidth) ? savedWidth : 470;
    applyCodePaneWidth(initialWidth);

    let dragging = false;
    let startX = 0;
    let startWidth = initialWidth;

    const onPointerMove = event => {
      if (!dragging) return;
      const delta = event.clientX - startX;
      const nextWidth = applyCodePaneWidth(startWidth + delta);
      if (monacoEditor) monacoEditor.layout();
      window.localStorage.setItem(CODE_PANE_WIDTH_KEY, String(nextWidth));
    };

    const onPointerUp = () => {
      if (!dragging) return;
      dragging = false;
      workspaceResizer.classList.remove("dragging");
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    workspaceResizer.addEventListener("pointerdown", event => {
      dragging = true;
      startX = event.clientX;
      const styleValue = getComputedStyle(workspaceMain).getPropertyValue("--code-pane-width");
      startWidth = Number.parseInt(styleValue, 10) || initialWidth;
      workspaceResizer.classList.add("dragging");
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    });
  };

  const setEditorEmptyState = isEmpty => {
    if (!editorEmpty) return;
    editorEmpty.classList.toggle("hidden", !isEmpty);
  };

  const setMonacoVisibility = visible => {
    const domNode = monacoEditor?.getDomNode?.();
    if (!domNode) return;
    domNode.style.display = visible ? "block" : "none";
  };

  const setEditorMode = mode => {
    activeEditorMode = mode;
    if (plainEditor) {
      plainEditor.classList.toggle("hidden", mode !== "plain");
    }
    setMonacoVisibility(mode === "monaco");
    setEditorEmptyState(mode === "none");
    updateSaveButtonState();
  };

  const normalizeEditorText = value =>
    typeof value === "string" ? value.replace(/\r\n/g, "\n") : "";

  const isValueDirty = (currentValue, savedValue) =>
    normalizeEditorText(currentValue) !== normalizeEditorText(savedValue);

  const getCurrentEditorValue = () => {
    if (activeEditorMode === "monaco" && monacoEditor) {
      return monacoEditor.getValue();
    }
    if (activeEditorMode === "plain" && plainEditor) {
      return plainEditor.value;
    }
    return "";
  };

  const showConfirmModal = ({
    title,
    body,
    okLabel = "Confirm",
    danger = false,
  }) => {
    if (!confirmOverlay || !confirmTitle || !confirmBody || !confirmOkBtn || !confirmCancelBtn) {
      return Promise.resolve(window.confirm(body || "Are you sure?"));
    }

    if (pendingConfirmResolve) {
      pendingConfirmResolve(false);
      pendingConfirmResolve = null;
    }

    confirmTitle.textContent = title || "Confirm";
    confirmBody.textContent = body || "";
    confirmOkBtn.textContent = okLabel;
    confirmOkBtn.classList.toggle("danger", Boolean(danger));
    confirmOverlay.classList.remove("hidden");
    confirmOkBtn.focus();

    return new Promise(resolve => {
      pendingConfirmResolve = resolve;
    });
  };

  const resolveConfirmModal = accepted => {
    if (confirmOverlay) {
      confirmOverlay.classList.add("hidden");
    }

    const resolver = pendingConfirmResolve;
    pendingConfirmResolve = null;
    if (resolver) resolver(Boolean(accepted));
  };

  const normalizeRelativePathInput = value => {
    if (typeof value !== "string") return "";
    return value
      .trim()
      .replaceAll("\\", "/")
      .replace(/^\.\//, "")
      .replace(/^\/+/, "")
      .replace(/\/{2,}/g, "/");
  };

  const isUnsafeRelativePath = relativePath =>
    !relativePath ||
    relativePath.startsWith("..") ||
    relativePath.includes("/../") ||
    relativePath.endsWith("/..");

  const suggestCopyPath = originalPath => {
    if (!originalPath) return "";
    const slashIndex = originalPath.lastIndexOf("/");
    const dir = slashIndex >= 0 ? originalPath.slice(0, slashIndex + 1) : "";
    const fileName = slashIndex >= 0 ? originalPath.slice(slashIndex + 1) : originalPath;
    const dotIndex = fileName.lastIndexOf(".");
    if (dotIndex > 0) {
      return `${dir}${fileName.slice(0, dotIndex)}-copy${fileName.slice(dotIndex)}`;
    }
    return `${dir}${fileName}-copy`;
  };

  const getPathExtension = relativePath => {
    if (typeof relativePath !== "string") return "";
    const normalized = relativePath.replaceAll("\\", "/");
    const fileName = normalized.split("/").pop() || normalized;
    const dotIndex = fileName.lastIndexOf(".");
    if (dotIndex <= 0) return "";
    return fileName.slice(dotIndex).toLowerCase();
  };

  const getWriteTypeClassification = relativePath => {
    const extension = getPathExtension(relativePath);
    if (extension && BLOCKED_BINARY_EXTENSIONS.has(extension)) {
      return { type: "blocked", extension };
    }
    if (!extension || KNOWN_TEXT_EXTENSIONS.has(extension)) {
      return { type: "known", extension };
    }
    return { type: "unknown", extension };
  };

  const ensureWritableTypeWithWarning = async (relativePath, actionLabel) => {
    const normalizedPath = normalizeRelativePathInput(relativePath);
    const classification = getWriteTypeClassification(normalizedPath);

    if (classification.type === "blocked") {
      setEditorStatus(
        `Blocked binary type (${classification.extension}) for ${actionLabel.toLowerCase()}`
      );
      log(
        `Write blocked: ${normalizedPath} uses binary extension ${classification.extension}`
      );
      return false;
    }

    if (
      classification.type === "unknown" &&
      normalizedPath &&
      !unknownWriteApprovalPaths.has(normalizedPath)
    ) {
      const accepted = await showConfirmModal({
        title: "Unknown File Type",
        body: `.${classification.extension.slice(1)} isn't a known text extension. ${actionLabel} this file anyway?`,
        okLabel: actionLabel,
      });
      if (!accepted) return false;
      unknownWriteApprovalPaths.add(normalizedPath);
    }

    return true;
  };

  const showPathModal = ({
    title,
    body,
    okLabel = "OK",
    suggestedPath = "",
  }) => {
    if (
      !pathModalOverlay ||
      !pathModalTitle ||
      !pathModalBody ||
      !pathModalInput ||
      !pathModalOkBtn ||
      !pathModalCancelBtn
    ) {
      const raw = window.prompt(title || "Enter file path", suggestedPath);
      if (raw === null) return Promise.resolve({ accepted: false, value: "" });
      return Promise.resolve({ accepted: true, value: normalizeRelativePathInput(raw) });
    }

    if (pendingPathModalResolve) {
      pendingPathModalResolve({ accepted: false, value: "" });
      pendingPathModalResolve = null;
    }

    pathModalTitle.textContent = title || "Enter File Path";
    pathModalBody.textContent = body || "Use a path relative to repo root.";
    pathModalOkBtn.textContent = okLabel;
    pathModalInput.value = suggestedPath || "";
    pathModalInput.classList.remove("invalid");
    pathModalOverlay.classList.remove("hidden");
    window.setTimeout(() => {
      pathModalInput.focus();
      pathModalInput.select();
    }, 0);

    return new Promise(resolve => {
      pendingPathModalResolve = resolve;
    });
  };

  const resolvePathModal = accepted => {
    if (!pathModalOverlay || !pathModalInput) {
      const resolver = pendingPathModalResolve;
      pendingPathModalResolve = null;
      if (resolver) resolver({ accepted: Boolean(accepted), value: "" });
      return;
    }

    if (!accepted) {
      pathModalOverlay.classList.add("hidden");
      const resolver = pendingPathModalResolve;
      pendingPathModalResolve = null;
      if (resolver) resolver({ accepted: false, value: "" });
      return;
    }

    const normalized = normalizeRelativePathInput(pathModalInput.value);
    if (isUnsafeRelativePath(normalized)) {
      pathModalInput.classList.add("invalid");
      setEditorStatus("Invalid path. Use a repo-relative file path.");
      pathModalInput.focus();
      return;
    }

    pathModalInput.classList.remove("invalid");
    pathModalOverlay.classList.add("hidden");
    const resolver = pendingPathModalResolve;
    pendingPathModalResolve = null;
    if (resolver) resolver({ accepted: true, value: normalized });
  };

  const pushPlainUndoState = () => {
    if (!plainEditor || applyingPlainHistory) return;
    const value = plainEditor.value;
    if (plainUndoStack.length && plainUndoStack[plainUndoStack.length - 1] === value) return;
    plainUndoStack.push(value);
    if (plainUndoStack.length > 300) plainUndoStack.shift();
  };

  const resetPlainHistory = () => {
    plainUndoStack.length = 0;
    plainRedoStack.length = 0;
    if (plainEditor) {
      plainUndoStack.push(plainEditor.value);
    }
    updateSaveButtonState();
  };

  const applyPlainHistoryValue = value => {
    if (!plainEditor) return;
    applyingPlainHistory = true;
    plainEditor.value = value;
    applyingPlainHistory = false;
    const nextDirty = isValueDirty(plainEditor.value, lastSavedContents);
    if (nextDirty !== isDirty) {
      isDirty = nextDirty;
      updateCurrentFileLabel();
      renderWorkspaceFiles();
    }
    updateSaveButtonState();
    plainEditor.focus();
  };

  plainEditor?.addEventListener("input", () => {
    if (activeEditorMode === "plain" && !applyingPlainHistory) {
      pushPlainUndoState();
      plainRedoStack.length = 0;
    }
    if (activeEditorMode !== "plain" || !activeFilePath) return;
    const nextDirty = isValueDirty(plainEditor.value, lastSavedContents);
    if (nextDirty !== isDirty) {
      isDirty = nextDirty;
      updateCurrentFileLabel();
      renderWorkspaceFiles();
    }
    updateSaveButtonState();
  });

  const loadExternalScript = src => {
    if (loadedScriptUrls.has(src)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const timeout = window.setTimeout(() => {
        reject(new Error(`Timed out loading script: ${src}`));
      }, 30000);
      script.src = src;
      script.async = true;
      script.onload = () => {
        window.clearTimeout(timeout);
        loadedScriptUrls.add(src);
        resolve();
      };
      script.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error(`Failed to load script: ${src}`));
      };
      document.head.appendChild(script);
    });
  };

  const loadMonacoFromBaseUrl = async baseUrl => {
    await loadExternalScript(`${baseUrl}/loader.js`);
    if (!window.require || typeof window.require.config !== "function") {
      throw new Error("Monaco AMD loader did not initialize.");
    }

    window.require.config({
      paths: {
        vs: baseUrl,
      },
    });

    await new Promise((resolve, reject) => {
      let settled = false;
      const timeout = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error("Timed out loading Monaco editor modules."));
      }, 30000);

      window.require(
        ["vs/editor/editor.main"],
        () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeout);
          resolve();
        },
        error => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeout);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      );
    });

    if (!window.monaco?.editor) {
      throw new Error("Monaco editor failed to initialize.");
    }

    return window.monaco;
  };

  const getLanguageForPath = filePath => {
    const lastDot = filePath.lastIndexOf(".");
    const ext = lastDot >= 0 ? filePath.slice(lastDot).toLowerCase() : "";
    switch (ext) {
      case ".astro":
        return "html";
      case ".md":
      case ".mdx":
        return "markdown";
      case ".js":
      case ".mjs":
      case ".cjs":
      case ".jsx":
        return "javascript";
      case ".ts":
      case ".tsx":
        return "typescript";
      case ".json":
      case ".jsonc":
        return "json";
      case ".yml":
      case ".yaml":
        return "yaml";
      case ".css":
      case ".scss":
      case ".sass":
      case ".less":
        return "css";
      case ".html":
        return "html";
      case ".xml":
      case ".svg":
        return "xml";
      case ".sh":
        return "shell";
      case ".ps1":
      case ".bat":
      case ".cmd":
        return "powershell";
      default:
        return "plaintext";
    }
  };

  const ensureMonacoEditor = async () => {
    if (monacoEditor) return monacoEditor;

    if (!monacoInstance && window.monaco?.editor) {
      monacoInstance = window.monaco;
    }

    if (!monacoReadyPromise) {
      monacoReadyPromise = (async () => {
        let preferredBase = "";
        try {
          const response = await api?.getWorkspaceMonacoBaseUrl?.();
          preferredBase = response?.baseUrl || "";
        } catch {
          preferredBase = "";
        }

        const baseCandidates = [];
        if (preferredBase) baseCandidates.push(preferredBase);
        const cdnBase = "https://cdn.jsdelivr.net/npm/monaco-editor@0.53.0/min/vs";
        if (!baseCandidates.includes(cdnBase)) {
          baseCandidates.push(cdnBase);
        }

        let lastError = null;
        for (const candidate of baseCandidates) {
          try {
            monacoInstance = await loadMonacoFromBaseUrl(candidate);
            log(`Monaco loaded from ${candidate}`);
            break;
          } catch (error) {
            lastError = error;
          }
        }

        if (!monacoInstance?.editor) {
          throw lastError || new Error("Unable to load Monaco editor.");
        }

        return monacoInstance;
      })();
    }

    let monaco = null;
    try {
      monaco = await monacoReadyPromise;
    } catch (error) {
      monacoReadyPromise = null;
      if (window.monaco?.editor) {
        monacoInstance = window.monaco;
        monaco = monacoInstance;
      } else {
        throw error;
      }
    }

    if (!monacoEditor) {
      monacoEditor = monaco.editor.create(monacoHost, {
        value: "",
        language: "plaintext",
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 13,
        lineNumbersMinChars: 3,
        smoothScrolling: true,
        scrollBeyondLastLine: false,
        roundedSelection: false,
      });

      monacoEditor.onDidChangeModelContent(() => {
        if (applyingMonacoProgrammaticChange) return;
        if (!activeFilePath) return;
        const nextDirty = isValueDirty(monacoEditor.getValue(), lastSavedContents);
        if (nextDirty === isDirty) return;
        isDirty = nextDirty;
        updateCurrentFileLabel();
        updateSaveButtonState();
        renderWorkspaceFiles();
      });

      applyMonacoTheme(currentTheme);
      setMonacoVisibility(activeEditorMode === "monaco");
      monacoFailureLogged = false;
    }

    return monacoEditor;
  };

  const expandAncestorsForFile = filePath => {
    const parts = filePath.split("/");
    let current = "";
    for (let i = 0; i < parts.length - 1; i += 1) {
      current = current ? `${current}/${parts[i]}` : parts[i];
      expandedDirs.add(current);
    }
  };

  const buildFileTree = paths => {
    const root = { name: "", path: "", dirs: new Map(), files: [] };

    for (const filePath of paths) {
      const parts = filePath.split("/");
      let node = root;
      let currentPath = "";

      for (let i = 0; i < parts.length; i += 1) {
        const segment = parts[i];
        const isFile = i === parts.length - 1;
        currentPath = currentPath ? `${currentPath}/${segment}` : segment;

        if (isFile) {
          node.files.push({ name: segment, path: currentPath });
          continue;
        }

        if (!node.dirs.has(segment)) {
          node.dirs.set(segment, {
            name: segment,
            path: currentPath,
            dirs: new Map(),
            files: [],
          });
        }
        node = node.dirs.get(segment);
      }
    }

    return root;
  };

  const renderWorkspaceFiles = () => {
    if (!fileListEl) return;

    const filterValue = (fileFilterInput?.value || "").trim().toLowerCase();
    const sourcePaths = filterValue
      ? workspaceFiles.filter(filePath => filePath.toLowerCase().includes(filterValue))
      : workspaceFiles;

    fileListEl.textContent = "";
    if (!sourcePaths.length) {
      const empty = document.createElement("div");
      empty.className = "file-empty";
      empty.textContent = filterValue
        ? "No files match this filter."
        : "No editable files found.";
      fileListEl.appendChild(empty);
      return;
    }

    const maxRendered = 2000;
    const paths = sourcePaths.slice(0, maxRendered);
    const tree = buildFileTree(paths);
    const forceExpanded = Boolean(filterValue);

    const renderDir = (node, depth) => {
      const sortedDirs = Array.from(node.dirs.values()).sort((a, b) =>
        a.name.localeCompare(b.name)
      );
      const sortedFiles = node.files
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name));

      for (const dirNode of sortedDirs) {
        const isExpanded = forceExpanded || expandedDirs.has(dirNode.path);
        const dirBtn = document.createElement("button");
        dirBtn.type = "button";
        dirBtn.className = "file-item dir";
        dirBtn.style.paddingLeft = `${8 + depth * 14}px`;
        dirBtn.title = dirNode.path;

        const toggle = document.createElement("span");
        toggle.className = "file-tree-toggle";
        toggle.textContent = isExpanded ? "▾" : "▸";

        const label = document.createElement("span");
        label.className = "file-tree-label";
        label.textContent = dirNode.name;

        dirBtn.append(toggle, label);
        dirBtn.addEventListener("click", () => {
          if (expandedDirs.has(dirNode.path)) {
            expandedDirs.delete(dirNode.path);
          } else {
            expandedDirs.add(dirNode.path);
          }
          renderWorkspaceFiles();
        });

        fileListEl.appendChild(dirBtn);
        if (isExpanded) {
          renderDir(dirNode, depth + 1);
        }
      }

      for (const fileNode of sortedFiles) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "file-item";
        item.style.paddingLeft = `${24 + depth * 14}px`;
        if (fileNode.path === activeFilePath) item.classList.add("active");
        if (isDirty && fileNode.path === activeFilePath) item.classList.add("dirty");
        item.textContent = fileNode.name;
        item.title = fileNode.path;
        item.addEventListener("click", () => {
          openWorkspaceFile(fileNode.path);
        });
        fileListEl.appendChild(item);
      }
    };

    renderDir(tree, 0);

    if (sourcePaths.length > maxRendered) {
      const overflow = document.createElement("div");
      overflow.className = "file-empty";
      overflow.textContent = `Showing ${maxRendered} of ${sourcePaths.length} files.`;
      fileListEl.appendChild(overflow);
    }

    if (filesTruncated) {
      const hint = document.createElement("div");
      hint.className = "file-empty";
      hint.textContent = "File list truncated for performance.";
      fileListEl.appendChild(hint);
    }
  };

  const refreshWorkspaceFiles = async () => {
    if (!api?.listWorkspaceFiles) return;
    setEditorStatus("Loading files...");
    try {
      const [info, fileData] = await Promise.all([
        api.getWorkspaceInfo(),
        api.listWorkspaceFiles(),
      ]);

      const rootName = info?.rootName || "Repository";
      if (repoLabel) repoLabel.textContent = rootName;
      workspaceFiles = Array.isArray(fileData?.files) ? fileData.files : [];
      filesTruncated = Boolean(fileData?.truncated);
      renderWorkspaceFiles();
      setEditorStatus(`Loaded ${workspaceFiles.length} files`);

      const lastFile = window.localStorage.getItem(LAST_OPEN_FILE_KEY) || "";
      if (!activeFilePath && lastFile && workspaceFiles.includes(lastFile)) {
        expandAncestorsForFile(lastFile);
        renderWorkspaceFiles();
        openWorkspaceFile(lastFile);
      } else if (activeFilePath && !workspaceFiles.includes(activeFilePath)) {
        activeFilePath = "";
        lastSavedContents = "";
        isDirty = false;
        updateCurrentFileLabel();
        updateSaveButtonState();
        if (plainEditor) plainEditor.value = "";
        resetPlainHistory();
        setEditorMode("none");
      }
    } catch (error) {
      setEditorStatus("Failed to load file list");
      log(`File list error: ${error.message}`);
    }
  };

  const openWorkspaceFile = async relativePath => {
    if (!relativePath || !api?.readWorkspaceFile) return;
    if (activeFilePath && activeFilePath !== relativePath) {
      const currentDirty = isValueDirty(getCurrentEditorValue(), lastSavedContents);
      if (currentDirty !== isDirty) {
        isDirty = currentDirty;
        updateCurrentFileLabel();
        updateSaveButtonState();
        renderWorkspaceFiles();
      }
      if (currentDirty) {
        const discard = await showConfirmModal({
          title: "Unsaved Changes",
          body: "You have unsaved changes. Discard them and open another file?",
          okLabel: "Discard",
          danger: true,
        });
        if (!discard) return;
      }
    }

    setEditorStatus(`Opening ${relativePath}...`);
    try {
      const payload = await api.readWorkspaceFile(relativePath);
      if (payload?.missing) {
        throw new Error(`File not found: ${relativePath}`);
      }
      const filePath = payload?.path || relativePath;
      const contents = payload?.contents || "";
      const language = getLanguageForPath(filePath);

      // Show content immediately in the lightweight fallback so first open never stalls.
      if (plainEditor) {
        plainEditor.value = contents;
        resetPlainHistory();
        setEditorMode("plain");
      }

      activeFilePath = filePath;
      lastSavedContents = contents;
      isDirty = false;
      expandAncestorsForFile(filePath);
      updateCurrentFileLabel();
      updateSaveButtonState();
      renderWorkspaceFiles();
      setEditorStatus(`${filePath} loaded`);
      window.localStorage.setItem(LAST_OPEN_FILE_KEY, filePath);

      ensureMonacoEditor()
        .then(editor => {
          if (activeFilePath !== filePath) return;
          try {
            applyingMonacoProgrammaticChange = true;
            editor.setValue(contents);
            const model = editor.getModel();
            if (model && monacoInstance?.editor?.setModelLanguage) {
              monacoInstance.editor.setModelLanguage(model, language);
            }
          } finally {
            applyingMonacoProgrammaticChange = false;
          }
          isDirty = false;
          updateCurrentFileLabel();
          updateSaveButtonState();
          renderWorkspaceFiles();
          setEditorMode("monaco");
          editor.focus();
          monacoFailureLogged = false;
        })
        .catch(monacoError => {
          applyingMonacoProgrammaticChange = false;
          if (!monacoFailureLogged) {
            monacoFailureLogged = true;
            log(`Monaco load warning: ${monacoError.message}`);
            log("Using basic editor mode for now.");
          }
          if (activeFilePath === filePath) {
            setEditorMode("plain");
            setEditorStatus(`${filePath} loaded (basic editor mode)`);
          }
        });
    } catch (error) {
      setEditorStatus("Failed to open file");
      log(`Open file failed: ${error.message}`);
    }
  };

  const saveCurrentFile = async () => {
    if (!api?.writeWorkspaceFile || !activeFilePath) return;
    if (activeEditorMode === "none") return;
    const nextContents = getCurrentEditorValue();
    if (!isValueDirty(nextContents, lastSavedContents)) {
      setEditorStatus("No changes to save");
      isDirty = false;
      updateCurrentFileLabel();
      updateSaveButtonState();
      renderWorkspaceFiles();
      return;
    }
    const allowedByType = await ensureWritableTypeWithWarning(activeFilePath, "Save");
    if (!allowedByType) return;

    saveInProgress = true;
    updateSaveButtonState();
    setEditorStatus(`Saving ${activeFilePath}...`);

    try {
      await api.writeWorkspaceFile(activeFilePath, nextContents);
      lastSavedContents = nextContents;
      isDirty = false;
      updateCurrentFileLabel();
      updateSaveButtonState();
      renderWorkspaceFiles();
      setEditorStatus(`${activeFilePath} saved`);
      log(`Saved ${activeFilePath}`);
    } catch (error) {
      setEditorStatus("Save failed");
      log(`Save failed: ${error.message}`);
    } finally {
      saveInProgress = false;
      updateSaveButtonState();
    }
  };

  const createNewFile = async () => {
    if (!api?.writeWorkspaceFile || !api?.readWorkspaceFile) return;
    const pathResult = await showPathModal({
      title: "Create New File",
      body: "Enter a new file path relative to the repository root.",
      okLabel: "Create",
      suggestedPath: "src/pages/new-page.astro",
    });
    if (!pathResult?.accepted || !pathResult.value) return;
    const targetPath = pathResult.value;

    let exists = false;
    try {
      const probe = await api.readWorkspaceFile(targetPath);
      exists = !probe?.missing;
    } catch {
      exists = false;
    }

    if (exists) {
      const overwrite = await showConfirmModal({
        title: "Overwrite File?",
        body: `"${targetPath}" already exists. Overwrite it?`,
        okLabel: "Overwrite",
      });
      if (!overwrite) return;
    }
    const allowedByType = await ensureWritableTypeWithWarning(targetPath, "Create");
    if (!allowedByType) return;

    saveAsInProgress = true;
    updateSaveButtonState();
    setEditorStatus(`Creating ${targetPath}...`);

    try {
      await api.writeWorkspaceFile(targetPath, "");
      await refreshWorkspaceFiles();
      await openWorkspaceFile(targetPath);
      setEditorStatus(`Created ${targetPath}`);
      log(`Created ${targetPath}`);
    } catch (error) {
      setEditorStatus("Create file failed");
      log(`Create file failed: ${error.message}`);
    } finally {
      saveAsInProgress = false;
      updateSaveButtonState();
    }
  };

  const saveCurrentFileAs = async () => {
    if (!api?.writeWorkspaceFile || !api?.readWorkspaceFile || activeEditorMode === "none") return;

    const suggestedPath = suggestCopyPath(activeFilePath || "src/pages/new-file.astro");
    const pathResult = await showPathModal({
      title: "Save File As",
      body: "Enter the destination path relative to the repository root.",
      okLabel: "Save As",
      suggestedPath,
    });
    if (!pathResult?.accepted || !pathResult.value) return;
    const targetPath = pathResult.value;

    let exists = false;
    try {
      const probe = await api.readWorkspaceFile(targetPath);
      exists = !probe?.missing;
    } catch {
      exists = false;
    }

    if (exists && targetPath !== activeFilePath) {
      const overwrite = await showConfirmModal({
        title: "Overwrite File?",
        body: `"${targetPath}" already exists. Overwrite it?`,
        okLabel: "Overwrite",
      });
      if (!overwrite) return;
    }
    const allowedByType = await ensureWritableTypeWithWarning(targetPath, "Save");
    if (!allowedByType) return;

    const nextContents = getCurrentEditorValue();
    saveAsInProgress = true;
    updateSaveButtonState();
    setEditorStatus(`Saving as ${targetPath}...`);

    try {
      await api.writeWorkspaceFile(targetPath, nextContents);
      await refreshWorkspaceFiles();
      await openWorkspaceFile(targetPath);
      setEditorStatus(`Saved as ${targetPath}`);
      log(`Saved as ${targetPath}`);
    } catch (error) {
      setEditorStatus("Save as failed");
      log(`Save as failed: ${error.message}`);
    } finally {
      saveAsInProgress = false;
      updateSaveButtonState();
    }
  };

  const runUndo = () => {
    if (activeEditorMode === "monaco" && monacoEditor) {
      monacoEditor.trigger("keyboard", "undo", null);
      return;
    }
    if (activeEditorMode === "plain" && plainEditor) {
      if (plainUndoStack.length <= 1) {
        setEditorStatus("Nothing to undo");
        return;
      }
      const current = plainUndoStack.pop();
      if (typeof current === "string") {
        plainRedoStack.push(current);
      }
      const previous = plainUndoStack[plainUndoStack.length - 1] || "";
      applyPlainHistoryValue(previous);
      setEditorStatus("Undo applied");
    }
  };

  const runRedo = () => {
    if (activeEditorMode === "monaco" && monacoEditor) {
      monacoEditor.trigger("keyboard", "redo", null);
      return;
    }
    if (activeEditorMode === "plain" && plainEditor) {
      if (!plainRedoStack.length) {
        setEditorStatus("Nothing to redo");
        return;
      }
      const nextValue = plainRedoStack.pop();
      if (typeof nextValue !== "string") return;
      plainUndoStack.push(nextValue);
      applyPlainHistoryValue(nextValue);
      setEditorStatus("Redo applied");
    }
  };

  const deleteCurrentFile = async () => {
    if (!api?.deleteWorkspaceFile || !activeFilePath) return;
    if (isDirty) {
      const discard = await showConfirmModal({
        title: "Unsaved Changes",
        body: "This file has unsaved changes. Continue and delete it anyway?",
        okLabel: "Continue",
        danger: true,
      });
      if (!discard) return;
    }

    const accepted = await showConfirmModal({
      title: "Delete File",
      body: `Delete "${activeFilePath}"? This cannot be undone.`,
      okLabel: "Delete",
      danger: true,
    });
    if (!accepted) return;

    const deletingPath = activeFilePath;
    setEditorStatus(`Deleting ${deletingPath}...`);

    try {
      await api.deleteWorkspaceFile(deletingPath);
      if (activeEditorMode === "plain" && plainEditor) {
        plainEditor.value = "";
        resetPlainHistory();
      }
      if (activeEditorMode === "monaco" && monacoEditor) {
        monacoEditor.setValue("");
      }
      activeFilePath = "";
      lastSavedContents = "";
      isDirty = false;
      updateCurrentFileLabel();
      updateSaveButtonState();
      setEditorMode("none");
      setEditorStatus(`Deleted ${deletingPath}`);
      log(`Deleted ${deletingPath}`);
      refreshWorkspaceFiles();
    } catch (error) {
      setEditorStatus("Delete failed");
      log(`Delete failed: ${error.message}`);
    }
  };

  document.getElementById("open-site-btn")?.addEventListener("click", () => {
    if (!api?.openExternal) {
      log("Open site unavailable.");
      return;
    }
    api.openExternal(siteUrl).catch(() => {
      log("Failed to open site.");
    });
  });

  toggleConsoleBtn?.addEventListener("click", () => {
    setConsolePaneVisible(!consoleVisible);
  });

  toggleEditorBtn?.addEventListener("click", () => {
    setEditorPaneVisible(!editorVisible);
  });

  document.getElementById("reload-shell-btn")?.addEventListener("click", () => {
    log("Reloading workspace...");
    window.location.reload();
  });

  document.getElementById("clear-console-btn")?.addEventListener("click", () => {
    if (consoleBody) consoleBody.textContent = "";
  });

  saveFileBtn?.addEventListener("click", () => {
    saveCurrentFile();
  });

  saveAsFileBtn?.addEventListener("click", () => {
    saveCurrentFileAs();
  });

  newFileBtn?.addEventListener("click", () => {
    createNewFile();
  });

  undoFileBtn?.addEventListener("click", () => {
    runUndo();
  });

  redoFileBtn?.addEventListener("click", () => {
    runRedo();
  });

  deleteFileBtn?.addEventListener("click", () => {
    deleteCurrentFile();
  });

  refreshFilesBtn?.addEventListener("click", () => {
    refreshWorkspaceFiles();
  });

  fileFilterInput?.addEventListener("input", () => {
    renderWorkspaceFiles();
  });

  confirmOkBtn?.addEventListener("click", () => {
    resolveConfirmModal(true);
  });

  confirmCancelBtn?.addEventListener("click", () => {
    resolveConfirmModal(false);
  });

  confirmOverlay?.addEventListener("click", event => {
    if (event.target === confirmOverlay) {
      resolveConfirmModal(false);
    }
  });

  pathModalOkBtn?.addEventListener("click", () => {
    resolvePathModal(true);
  });

  pathModalCancelBtn?.addEventListener("click", () => {
    resolvePathModal(false);
  });

  pathModalOverlay?.addEventListener("click", event => {
    if (event.target === pathModalOverlay) {
      resolvePathModal(false);
    }
  });

  pathModalInput?.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      resolvePathModal(true);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      resolvePathModal(false);
    }
  });

  const bindWindowControl = (id, fnName) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("pointerdown", event => {
      event.preventDefault();
      event.stopPropagation();
    });
    el.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      callWindowControl(fnName);
    });
  };

  bindWindowControl("min-btn", "minimizeWindow");
  bindWindowControl("max-btn", "maximizeWindow");
  bindWindowControl("close-btn", "closeWindow");

  frame?.addEventListener("load", () => {
    requestThemeFromEditor();
    bindFrameThemeObserver();
    bindFrameUiObserver();
    syncThemeFromFrame();
    hideAstroDevToolbarInFrameTree();
  });

  const runBuild = () => {
    if (!api || !buildBtn) return;
    if (buildBtn.classList.contains("busy")) return;

    setBusy(true);
    setStatus("Building...");
    log("Build started.");

    api.runReadyProd().catch(() => {
      setBusy(false);
      setStatus("Build failed");
      log("Build command failed to start.");
    });
  };

  buildBtn?.addEventListener("click", runBuild);

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && pendingPathModalResolve) {
      event.preventDefault();
      resolvePathModal(false);
      return;
    }

    if (event.key === "Escape" && pendingConfirmResolve) {
      event.preventDefault();
      resolveConfirmModal(false);
      return;
    }

    if (pendingConfirmResolve || pendingPathModalResolve) return;

    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();

    if (key === "r") {
      event.preventDefault();
      reloadFrame();
    }

    if (key === "l" && event.shiftKey) {
      event.preventDefault();
      setConsolePaneVisible(!consoleVisible);
    }

    if (key === "s" && event.shiftKey) {
      event.preventDefault();
      saveCurrentFileAs();
    }

    if (key === "s" && !event.shiftKey) {
      event.preventDefault();
      saveCurrentFile();
    }

    if (key === "n" && event.shiftKey) {
      event.preventDefault();
      createNewFile();
    }

    if (key === "z" && !event.shiftKey) {
      event.preventDefault();
      runUndo();
    }

    if (key === "y" || (key === "z" && event.shiftKey)) {
      event.preventDefault();
      runRedo();
    }
  });

  document.addEventListener("contextmenu", event => {
    if (monacoHost?.contains(event.target)) return;
    event.preventDefault();
    api?.showContextMenu().catch(() => {});
  });

  window.addEventListener("message", event => {
    if (messageOrigin !== "*" && event.origin !== messageOrigin) return;
    if (frame?.contentWindow && event.source !== frame.contentWindow) return;
    if (event.data?.type !== "editor-theme") return;
    applyShellTheme(event.data.value);
  });

  api?.onRefreshCms(() => {
    reloadFrame();
  });

  api?.onReadyProdEvent(payload => {
    if (!payload) return;
    if (payload.type === "start" || payload.type === "trigger" || payload.type === "busy") {
      setBusy(true);
      setStatus("Building...");
      log(payload.message || "Build running...");
      return;
    }

    if (payload.type === "log") {
      log(payload.message || "");
      return;
    }

    if (payload.type === "success") {
      setBusy(false);
      setStatus("Ready");
      log(payload.message || "Build finished.");
      api.showNotification("Build Complete", "Your site has been built successfully!").catch(() => {});
      return;
    }

    if (payload.type === "failure" || payload.type === "error") {
      setBusy(false);
      setStatus("Build failed");
      log(payload.message || "Build failed.");
      api.showNotification("Build Failed", payload.message || "Build failed").catch(() => {});
    }
  });

  api?.getReadyProdStatus().then(status => {
    if (status?.running) {
      setBusy(true);
      setStatus("Building...");
      log("Build already in progress.");
    } else {
      setBusy(false);
      setStatus("Ready");
    }
  });

  const preferredTheme =
    window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  applyShellTheme(preferredTheme);
  requestThemeFromEditor();
  updateCurrentFileLabel();
  updateSaveButtonState();
  initSplitter();
  setEditorPaneVisible(window.localStorage.getItem(EDITOR_VISIBLE_KEY) !== "0");
  setConsolePaneVisible(window.localStorage.getItem(CONSOLE_VISIBLE_KEY) !== "0");
  refreshWorkspaceFiles();
  ensureMonacoEditor().catch(() => {});

  const workspaceResizeObserver = new ResizeObserver(() => {
    if (monacoEditor) monacoEditor.layout();
  });
  if (workspaceMain) workspaceResizeObserver.observe(workspaceMain);

  const themeSyncTimer = window.setInterval(() => {
    bindFrameThemeObserver();
    bindFrameUiObserver();
    syncThemeFromFrame();
    hideAstroDevToolbarInFrameTree();
  }, 1200);

  window.addEventListener("beforeunload", () => {
    window.clearInterval(themeSyncTimer);
    if (frameThemeObserver) frameThemeObserver.disconnect();
    if (frameUiObserver) frameUiObserver.disconnect();
    workspaceResizeObserver.disconnect();
  });

  setEditorStatus("Editor ready");
  setEditorMode("none");
  log("Companion shell initialized.");
})();
