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
