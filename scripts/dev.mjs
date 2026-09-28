// Development: Vite serves the client with hot reload on :5173, esbuild watches
// the Electron and server code, and Electron restarts whenever that rebuilds.
import { spawn } from "node:child_process";
import electronPath from "electron";
import { context } from "esbuild";
import { createServer } from "vite";
import { options } from "./electron-build.mjs";

const vite = await createServer({ server: { port: 5173, strictPort: true } });
await vite.listen();
const devUrl = vite.resolvedUrls.local[0];

/** @type {import("node:child_process").ChildProcess | null} */
let electron = null;
let quitting = false;

async function restartElectron() {
  if (electron) {
    const old = electron;
    electron = null;
    // Wait for it to exit so the API port is free again.
    await new Promise((resolve) => {
      old.once("exit", resolve);
      old.kill();
    });
  }
  const child = spawn(electronPath, ["."], { stdio: "inherit", env: { ...process.env, VITE_DEV_SERVER_URL: devUrl } });
  child.once("exit", () => {
    // Closing the window ends the dev session; a restart has already cleared `electron`.
    if (electron === child) void shutdown();
  });
  electron = child;
}

async function shutdown() {
  if (quitting) return;
  quitting = true;
  electron?.kill();
  await ctx.dispose();
  await vite.close();
  process.exit(0);
}

const ctx = await context({
  ...options,
  plugins: [
    {
      name: "restart-electron",
      setup(b) {
        b.onEnd((result) => {
          if (result.errors.length === 0 && !quitting) void restartElectron();
        });
      },
    },
  ],
});
await ctx.watch();

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
