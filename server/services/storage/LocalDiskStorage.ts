import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { prisma } from "../../db";
import type { FileEntry } from "../../../shared/types";
import type { StorageService } from "./StorageService";

export function defaultTeachingRoot(): string {
  return path.join(os.homedir(), "Documents", "Teaching");
}

export class LocalDiskStorage implements StorageService {
  readonly kind = "local" as const;

  constructor(private readonly userId: string) {}

  async root(): Promise<string> {
    const settings = await prisma.userSettings.findUnique({ where: { userId: this.userId } });
    return path.resolve(settings?.teachingRoot || defaultTeachingRoot());
  }

  async resolve(key: string): Promise<string> {
    const root = await this.root();
    const full = path.resolve(root, key);
    this.assertInside(root, full);
    return full;
  }

  async ensureFolder(key: string): Promise<string> {
    const full = await this.resolve(key);
    await fs.mkdir(full, { recursive: true });
    return full;
  }

  async exists(locator: string): Promise<boolean> {
    try {
      return (await fs.stat(locator)).isDirectory();
    } catch {
      return false;
    }
  }

  async list(locator: string): Promise<FileEntry[]> {
    await this.assertLocatorInside(locator);
    if (!(await this.exists(locator))) return [];
    const entries = await fs.readdir(locator, { withFileTypes: true });
    const out: FileEntry[] = [];
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const st = await fs.stat(path.join(locator, e.name)).catch(() => null);
      if (!st) continue;
      out.push({
        name: e.name,
        isDirectory: e.isDirectory(),
        size: st.size,
        modifiedAt: st.mtime.toISOString(),
      });
    }
    return out.sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name));
  }

  async reveal(locator: string): Promise<void> {
    await this.assertLocatorInside(locator);
    await fs.mkdir(locator, { recursive: true });
    const [cmd, args] =
      process.platform === "win32"
        ? ["explorer.exe", [locator]]
        : process.platform === "darwin"
          ? ["open", [locator]]
          : ["xdg-open", [locator]];
    // No shell: the path is passed as a single argv entry, never interpolated.
    const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
    child.on("error", () => {});
    child.unref();
  }

  async writeFile(locator: string, fileName: string, data: Buffer): Promise<string> {
    await this.assertLocatorInside(locator);
    await fs.mkdir(locator, { recursive: true });
    // Keep only the base name and strip characters Windows/macOS reject.
    const base = path.basename(fileName.replace(/\\/g, "/")).replace(/[<>:"|?*\u0000-\u001f]/g, "").trim() || "file";
    const ext = path.extname(base);
    const stem = base.slice(0, base.length - ext.length);
    for (let n = 1; ; n++) {
      const name = n === 1 ? base : `${stem} (${n})${ext}`;
      try {
        await fs.writeFile(path.join(locator, name), data, { flag: "wx" });
        return name;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST" || n > 999) throw err;
      }
    }
  }

  private async assertLocatorInside(locator: string) {
    this.assertInside(await this.root(), path.resolve(locator));
  }

  private assertInside(root: string, full: string) {
    const rel = path.relative(root, full);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw Object.assign(new Error("Path is outside the teaching folder"), { status: 400 });
    }
  }
}
