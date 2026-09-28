/** Contract between the Electron preload script and the React client (`window.kanbanclass`). */

export interface ApiKeyStatus {
  configured: boolean;
  /** "env": fixed by ANTHROPIC_API_KEY and not editable in the app. */
  source: "env" | "app" | null;
  /** False when the OS offers no secure storage, so a key can't be saved. */
  canStore: boolean;
}

export interface DesktopBridge {
  pickFolder(defaultPath?: string): Promise<string | null>;
  apiKeyStatus(): Promise<ApiKeyStatus>;
  /** Saves (encrypted) or, with null/"", removes the Anthropic API key. Takes effect immediately. */
  setApiKey(key: string | null): Promise<ApiKeyStatus>;
  openDataFolder(): Promise<void>;
}
