import type { FileEntry } from "../../../shared/types";
import { LocalDiskStorage } from "./LocalDiskStorage";

/**
 * Storage abstraction for lesson folders. V1 writes to the local disk; V2 can
 * provide S3 / Google Drive implementations behind the same interface.
 *
 * Paths passed in are storage-relative keys like "2026/Fysik_10/Lesson_12".
 * `resolve` returns the implementation's absolute locator (a disk path here,
 * a URL for cloud backends) which is what gets stored on Lesson.folderPath.
 */
export interface StorageService {
  readonly kind: "local" | "s3" | "gdrive";
  root(): Promise<string>;
  resolve(key: string): Promise<string>;
  ensureFolder(key: string): Promise<string>;
  exists(locator: string): Promise<boolean>;
  list(locator: string): Promise<FileEntry[]>;
  /** Reveal the folder to the user (file manager locally, a browser URL in V2). */
  reveal(locator: string): Promise<void>;
}

export function createStorageService(userId: string): StorageService {
  return new LocalDiskStorage(userId);
}

/** Turn a display name into a filesystem-safe segment: "Fysik 10" -> "Fysik_10". */
export function safeSegment(name: string): string {
  const cleaned = name
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/\.+$/, "");
  return cleaned || "Untitled";
}
