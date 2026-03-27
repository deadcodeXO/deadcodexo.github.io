const { contextBridge, ipcRenderer } = require("electron");

console.log("[preload] Starting preload script...");

try {
  contextBridge.exposeInMainWorld("electronAPI", {
    runReadyProd: () => ipcRenderer.invoke("run-readyprod"),
    getReadyProdStatus: () => ipcRenderer.invoke("get-readyprod-status"),
    onReadyProdEvent: callback => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("readyprod-event", listener);
      return () => ipcRenderer.removeListener("readyprod-event", listener);
    },
    minimizeWindow: () => ipcRenderer.invoke("minimize-window"),
    maximizeWindow: () => ipcRenderer.invoke("maximize-window"),
    closeWindow: () => ipcRenderer.invoke("close-window"),
    openExternal: url => ipcRenderer.invoke("open-external", url),
    showNotification: (title, body) =>
      ipcRenderer.invoke("show-notification", title, body),
    showContextMenu: () => ipcRenderer.invoke("show-context-menu"),
    getWorkspaceInfo: () => ipcRenderer.invoke("workspace-info"),
    listWorkspaceFiles: () => ipcRenderer.invoke("workspace-list-files"),
    readWorkspaceFile: relativePath =>
      ipcRenderer.invoke("workspace-read-file", relativePath),
    writeWorkspaceFile: (relativePath, contents) =>
      ipcRenderer.invoke("workspace-write-file", relativePath, contents),
    deleteWorkspaceFile: relativePath =>
      ipcRenderer.invoke("workspace-delete-file", relativePath),
    getWorkspaceMonacoBaseUrl: () =>
      ipcRenderer.invoke("workspace-monaco-base-url"),
    getMonacoPilotConfig: () =>
      ipcRenderer.invoke("workspace-monacopilot-config"),
    requestMonacoPilotCompletion: payload =>
      ipcRenderer.invoke("workspace-monacopilot-complete", payload),
    onRefreshCms: callback => {
      const listener = () => callback();
      ipcRenderer.on("refresh-cms", listener);
      return () => ipcRenderer.removeListener("refresh-cms", listener);
    },
  });

  console.log("[preload] electronAPI exposed successfully");
} catch (error) {
  console.error("[preload] Error exposing electronAPI:", error);
}
