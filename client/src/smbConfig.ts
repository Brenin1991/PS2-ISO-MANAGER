/** Config SMB/OPL guardada no cliente (localStorage) e injetada no spawn do Python. */

export const SMB_STORAGE_KEY = "osdxmb.smbConfig.v1";

export type SmbClientConfig = {
  share: string;
  username: string;
  password: string;
  anonymous: boolean;
  port: string;
  bind: string;
  smb2: boolean;
  isoDir: string;
};

export function defaultSmbConfig(): SmbClientConfig {
  return {
    share: "PS2ISO",
    username: "opl",
    password: "oplopl",
    anonymous: false,
    port: "",
    bind: "0.0.0.0",
    smb2: false,
    isoDir: "",
  };
}

export function loadSmbConfig(): SmbClientConfig {
  try {
    const raw = localStorage.getItem(SMB_STORAGE_KEY);
    if (!raw) return defaultSmbConfig();
    const p = JSON.parse(raw) as Partial<SmbClientConfig>;
    return { ...defaultSmbConfig(), ...p };
  } catch {
    return defaultSmbConfig();
  }
}

export function saveSmbConfig(c: SmbClientConfig): void {
  localStorage.setItem(SMB_STORAGE_KEY, JSON.stringify(c));
}

/** Variáveis passadas ao processo Python (Flask, OPL+SMB, pack USB). */
export function smbConfigToProcessEnv(c: SmbClientConfig): Record<string, string> {
  const o: Record<string, string> = {};
  const iso = c.isoDir.trim();
  if (iso) o.PS2_ISO_DIR = iso;
  const sh = c.share.trim();
  if (sh) o.OPL_SMB_SHARE = sh;
  const u = c.username.trim();
  if (u) o.OPL_SMB_USER = u;
  if (c.anonymous) o.OPL_SMB_PASS = "";
  else o.OPL_SMB_PASS = (c.password || "oplopl").trim();
  const port = c.port.trim();
  if (port) o.OPL_SMB_PORT = port;
  const b = c.bind.trim();
  if (b) o.OPL_SMB_BIND = b;
  o.OPL_SMB2 = c.smb2 ? "1" : "0";
  return o;
}
