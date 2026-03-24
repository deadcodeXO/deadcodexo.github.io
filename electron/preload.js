const { contextBridge, ipcRenderer } = require("electron");

console.log("[preload] Starting preload script...");

try {
  contextBridge.exposeInMainWorld("electronAPI", {
    runReadyProd: () => ipcRenderer.invoke("run-readyprod"),
    getReadyProdStatus: () => ipcRenderer.invoke("get-readyprod-status"),
    onReadyProdEvent: (callback) => {
      ipcRenderer.on("readyprod-event", (_event, payload) => callback(payload));
      return () => ipcRenderer.removeAllListeners("readyprod-event");
    },
    minimizeWindow: () => ipcRenderer.invoke("minimize-window"),
    maximizeWindow: () => ipcRenderer.invoke("maximize-window"),
    closeWindow: () => ipcRenderer.invoke("close-window"),
    openExternal: (url) => ipcRenderer.invoke("open-external", url),
    showNotification: (title, body) => ipcRenderer.invoke("show-notification", title, body),
    showContextMenu: () => ipcRenderer.invoke("show-context-menu"),
    onRefreshCms: (callback) => ipcRenderer.on("refresh-cms", callback),
  });

  console.log("[preload] electronAPI exposed successfully");
} catch (error) {
  console.error("[preload] Error exposing electronAPI:", error);
}
