import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge } from "../shared/desktop";

const bridge: DesktopBridge = {
  pickFolder: (defaultPath) => ipcRenderer.invoke("kc:pick-folder", defaultPath),
  apiKeyStatus: () => ipcRenderer.invoke("kc:api-key:status"),
  setApiKey: (key) => ipcRenderer.invoke("kc:api-key:set", key),
  openDataFolder: () => ipcRenderer.invoke("kc:open-data-folder"),
};

contextBridge.exposeInMainWorld("kanbanclass", bridge);
