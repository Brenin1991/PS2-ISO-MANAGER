/// <reference types="vite/client" />

import type { UsbPackOpts } from "./osdxmb-ipc";

declare global {
  interface Window {
    osdxmb?: {
      getRepoRoot: () => Promise<string>;
      /** IPv4 da LAN (Electron) — quando o URL do backend é localhost. */
      getLanIPv4: () => Promise<string | null>;
      windowMinimize: () => Promise<void>;
      windowToggleMaximize: () => Promise<boolean>;
      windowClose: () => Promise<void>;
      windowIsMaximized: () => Promise<boolean>;
      onWindowMaximizedChange: (cb: (maximized: boolean) => void) => () => void;
      pickDirectory: () => Promise<string | null>;
      startPythonBackend: (
        mode: "flask" | "opl-smb",
        env?: Record<string, string>,
      ) => Promise<{
        ok: boolean;
        error?: string;
        script?: string;
        pythonExe?: string;
        pythonSource?: "venv" | "path";
        pythonHint?: string;
      }>;
      stopPythonBackend: () => Promise<{ ok: boolean }>;
      runUsbPack: (opts: UsbPackOpts) => Promise<{ code: number; out: string; error?: string }>;
      onPythonLog: (cb: (data: { stream: string; line: string }) => void) => () => void;
      onPythonExit: (cb: (data: { code: number | null }) => void) => () => void;
    };
  }
}

export {};
