// Bundles the Electron main process, preload script and in-process API server
// into dist-electron/*.cjs. `node scripts/electron-build.mjs` builds once;
// scripts/dev.mjs imports `options` and watches instead.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

/** @type {import("esbuild").BuildOptions} */
export const options = {
  entryPoints: { main: "electron/main.ts", preload: "electron/preload.ts", server: "server/index.ts" },
  outdir: "dist-electron",
  outExtension: { ".js": ".cjs" },
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  sourcemap: true,
  // npm dependencies are shipped in node_modules (Prisma needs its engine files there).
  packages: "external",
  // main.ts loads the server bundle lazily, after it has set DATABASE_URL.
  external: ["electron", "./server.cjs"],
  logLevel: "info",
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await build(options);
}
