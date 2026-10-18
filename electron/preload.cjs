const { contextBridge, ipcRenderer } = require("electron");
const methods = [
  "state",
  "story-list",
  "story-save",
  "story-delete",
  "story-import-images",
  "save-settings",
  "choose-folder",
  "choose-codex",
  "diagnose",
  "create",
  "cancel",
  "delete",
  "retry",
  "detail",
  "open-folder",
];
contextBridge.exposeInMainWorld("studio", {
  call: (method, ...args) => {
    if (!methods.includes(method)) return Promise.reject(Error("未知操作"));
    return ipcRenderer.invoke(method, ...args);
  },
  subscribe: (fn) => {
    const listener = (_, j) => fn(j);
    ipcRenderer.on("task:update", listener);
    return () => ipcRenderer.removeListener("task:update", listener);
  },
});
