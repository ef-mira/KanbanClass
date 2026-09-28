import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, safeStorage, shell, type IpcMainInvokeEvent } from "electron";
import { existsSync, promises as fs, readFileSync } from "node:fs";
import path from "node:path";
import type { ApiKeyStatus } from "../shared/desktop";

/**
 * KanbanClass desktop shell. The Express API from `server/` runs inside this
 * process on 127.0.0.1, and the window loads the React client from it. The
 * preload bridge adds the few things a web page can't do: native folder
 * pickers and an API key kept in the OS keychain-backed safeStorage.
 */

const DEV_URL = process.env.VITE_DEV_SERVER_URL;
// Fixed so the window's origin (and its localStorage, e.g. the theme) is stable between launches.
const PREFERRED_PORT = DEV_URL ? 3001 : 41731;

if (!app.requestSingleInstanceLock()) app.quit();

const appRoot = app.getAppPath();
const userData = app.getPath("userData");
const configFile = path.join(userData, "config.json");
const windowStateFile = path.join(userData, "window-state.json");

interface Config {
  anthropicApiKey?: string; // safeStorage-encrypted, base64
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2));
}

// ---- Environment for the in-process server (must be set before it loads) ----

if (DEV_URL) {
  try {
    process.loadEnvFile(path.join(appRoot, ".env"));
  } catch {
    // .env is optional
  }
}
const keyFromEnv = Boolean(process.env.ANTHROPIC_API_KEY);
process.env.DATABASE_URL ??= `file:${path.join(userData, "kanbanclass.db").replace(/\\/g, "/")}`;

function loadStoredApiKey() {
  const enc = readJson<Config>(configFile, {}).anthropicApiKey;
  if (keyFromEnv || !enc || !safeStorage.isEncryptionAvailable()) return;
  try {
    process.env.ANTHROPIC_API_KEY = safeStorage.decryptString(Buffer.from(enc, "base64"));
  } catch {
    console.warn("Stored API key could not be decrypted; ignoring it.");
  }
}

// ---- Window ----

let win: BrowserWindow | null = null;
let appOrigin = "";

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized?: boolean;
}

function createWindow(url: string) {
  const state = readJson<WindowState>(windowStateFile, { width: 1440, height: 900 });
  win = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: "KanbanClass",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#111217" : "#ffffff",
    autoHideMenuBar: true,
    icon: path.join(appRoot, "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  if (state.maximized) win.maximize();
  win.once("ready-to-show", () => win?.show());

  const saveState = () => {
    if (!win || win.isMinimized()) return;
    void writeJson(windowStateFile, { ...win.getNormalBounds(), maximized: win.isMaximized() });
  };
  win.on("close", saveState);
  win.on("closed", () => (win = null));

  // Links to other sites open in the default browser, never inside the app.
  const isAppUrl = (u: string) => new URL(u).origin === appOrigin;
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:/.test(target)) void shell.openExternal(target);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, target) => {
    if (isAppUrl(target)) return;
    e.preventDefault();
    if (/^https?:/.test(target)) void shell.openExternal(target);
  });

  void win.loadURL(url);
}

function buildMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { label: "File", submenu: [{ label: "Open data folder", click: () => void shell.openPath(userData) }, { type: "separator" }, { role: "quit" }] },
      { role: "editMenu" },
      {
        label: "View",
        submenu: [
          { role: "reload" },
          { role: "toggleDevTools" },
          { type: "separator" },
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { type: "separator" },
          { role: "togglefullscreen" },
        ],
      },
    ]),
  );
}

// ---- IPC (only accepted from our own window) ----

function trusted(e: IpcMainInvokeEvent) {
  const url = e.senderFrame?.url;
  if (!url || new URL(url).origin !== appOrigin) throw new Error("Untrusted sender");
}

function apiKeyStatus(): ApiKeyStatus {
  return {
    configured: Boolean(process.env.ANTHROPIC_API_KEY),
    source: keyFromEnv ? "env" : process.env.ANTHROPIC_API_KEY ? "app" : null,
    canStore: safeStorage.isEncryptionAvailable(),
  };
}

function registerIpc() {
  ipcMain.handle("kc:pick-folder", async (e, defaultPath: unknown) => {
    trusted(e);
    const opts: Electron.OpenDialogOptions = {
      title: "Choose the folder for lesson files",
      properties: ["openDirectory", "createDirectory"],
      defaultPath: typeof defaultPath === "string" && existsSync(defaultPath) ? defaultPath : undefined,
    };
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    return r.canceled ? null : r.filePaths[0];
  });

  ipcMain.handle("kc:api-key:status", (e) => {
    trusted(e);
    return apiKeyStatus();
  });

  ipcMain.handle("kc:api-key:set", async (e, key: unknown) => {
    trusted(e);
    if (keyFromEnv) throw new Error("The API key is set by the ANTHROPIC_API_KEY environment variable");
    const config = readJson<Config>(configFile, {});
    const value = typeof key === "string" ? key.trim() : "";
    if (value) {
      if (!safeStorage.isEncryptionAvailable()) throw new Error("Secure storage is not available on this computer");
      config.anthropicApiKey = safeStorage.encryptString(value).toString("base64");
      process.env.ANTHROPIC_API_KEY = value;
    } else {
      delete config.anthropicApiKey;
      delete process.env.ANTHROPIC_API_KEY;
    }
    await writeJson(configFile, config);
    return apiKeyStatus();
  });

  ipcMain.handle("kc:open-data-folder", async (e) => {
    trusted(e);
    await shell.openPath(userData);
  });
}

// ---- Startup ----

app.on("second-instance", () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.on("window-all-closed", () => app.quit());

app.whenReady().then(async () => {
  loadStoredApiKey();
  buildMenu();
  registerIpc();
  try {
    // Loaded only now, so DATABASE_URL and the API key are in place before Prisma and the AI client read them.
    const { startServer } = require("./server.cjs") as typeof import("../server/index");
    const port = await startServer({
      port: PREFERRED_PORT,
      strictPort: Boolean(DEV_URL), // Vite's dev proxy expects this exact port
      distDir: DEV_URL ? undefined : path.join(appRoot, "dist"),
      migrationsDir: path.join(appRoot, "prisma", "migrations"),
    });
    const url = DEV_URL ?? `http://127.0.0.1:${port}`;
    appOrigin = new URL(url).origin;
    createWindow(url);
  } catch (err) {
    dialog.showErrorBox("KanbanClass could not start", err instanceof Error ? (err.stack ?? err.message) : String(err));
    app.quit();
  }
});
