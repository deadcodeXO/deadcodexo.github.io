interface Window {
  theme?: {
    themeValue: string;
    setPreference: () => void;
    reflectPreference: () => void;
    getTheme: () => string;
    setTheme: (val: string) => void;
  };
  electronAPI?: {
    runReadyProd: () => Promise<any>;
    getReadyProdStatus: () => Promise<any>;
    onReadyProdEvent: (callback: (payload: any) => void) => void;
    minimizeWindow: () => Promise<void>;
    maximizeWindow: () => Promise<void>;
    closeWindow: () => Promise<void>;
    openExternal: (url: string) => Promise<void>;
    showNotification: (title: string, body: string) => Promise<void>;
    showContextMenu: () => Promise<void>;
    onRefreshCms: (callback: () => void) => void;
  };
  __windowControlsSetUp?: boolean;
  __electronReadyProdSetUp?: boolean;
}
