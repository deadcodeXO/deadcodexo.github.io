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
  });

  console.log("[preload] electronAPI exposed successfully");
} catch (error) {
  console.error("[preload] Error exposing electronAPI:", error);
}
