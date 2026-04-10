const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("osdxmb", {
  getRepoRoot: () => ipcRenderer.invoke("get-repo-root"),

  windowMinimize: () => ipcRenderer.invoke("window-minimize"),
  windowToggleMaximize: () => ipcRenderer.invoke("window-toggle-maximize"),
  windowClose: () => ipcRenderer.invoke("window-close"),
  windowIsMaximized: () => ipcRenderer.invoke("window-is-maximized"),
  onWindowMaximizedChange: (cb) => {
    const handler = (_event, maximized) => {
      cb(maximized);
    };
    ipcRenderer.on("window-maximized-changed", handler);
    return () => {
      ipcRenderer.removeListener("window-maximized-changed", handler);
    };
  },
  pickDirectory: () => ipcRenderer.invoke("pick-directory"),
  startPythonBackend: (mode, env) => ipcRenderer.invoke("start-python-backend", { mode, env: env || {} }),
  stopPythonBackend: () => ipcRenderer.invoke("stop-python-backend"),
  runUsbPack: (opts) => ipcRenderer.invoke("run-usb-pack", opts),
  /** Devolve função de cleanup — obrigatório no useEffect do React para não acumular listeners. */
  onPythonLog: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("python-log", handler);
    return () => ipcRenderer.removeListener("python-log", handler);
  },
  onPythonExit: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("python-exit", handler);
    return () => ipcRenderer.removeListener("python-exit", handler);
  },
});
