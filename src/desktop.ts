import type { DesktopBridge } from "../shared/desktop";

declare global {
  interface Window {
    kanbanclass?: DesktopBridge;
  }
}

/** Native features from the Electron preload. Undefined if the client is opened in a plain browser. */
export const desktop: DesktopBridge | undefined = window.kanbanclass;
