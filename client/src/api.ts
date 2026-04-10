const LS_KEY = "osdxmb_backend_url";

export function getBackendUrl(): string {
  return localStorage.getItem(LS_KEY) || "http://127.0.0.1:5000";
}

export function setBackendUrl(url: string) {
  localStorage.setItem(LS_KEY, url.replace(/\/$/, ""));
}

export function isLoopbackHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "0:0:0:0:0:0:0:1";
}

/** Host e porta do URL do backend. Sem porta em `http://` → 5000 (Flask típico). */
export function parseBackendHostPort(urlRaw: string): { host: string; port: number } | null {
  let s = urlRaw.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  try {
    const u = new URL(s);
    const host = u.hostname;
    if (!host) return null;
    let port: number;
    if (u.port) {
      port = parseInt(u.port, 10);
    } else if (u.protocol === "https:") {
      port = 443;
    } else {
      port = 5000;
    }
    if (!Number.isFinite(port) || port < 1 || port > 65535) port = 5000;
    return { host, port };
  } catch {
    return null;
  }
}

export type GsmMode = { id: number; label: string };

export type LibraryRow = {
  file: string;
  name: string;
  gameid: string;
  size: number;
  has_art: boolean;
  description: string;
  /** Metadados extra (SQLite) */
  release_date?: string;
  developers?: string;
  publisher?: string;
  max_players?: string;
  /** -1 = GSM off; 0..28 = índice OPL $GSMVMode (ficheiro CFG/<gameid>.cfg na partilha) */
  opl_gsm_vmode?: number;
  has_cover: boolean;
  /** Caminho relativo, ex. `/api/library/cover/SLUS_123.45` */
  cover_url: string;
  /** Tempo total jogado (servidor), segundos */
  play_seconds_total?: number;
};

export type PlayStatus = {
  idle_threshold_seconds: number;
  active: {
    iso_relpath: string;
    name?: string;
    gameid?: string;
    session_seconds?: number;
    /** disk = leituras SMB/HTTP; xmb = relatório GET do XMB */
    source?: "disk" | "xmb";
  } | null;
  session_seconds: number | null;
  seconds_since_last_read: number | null;
};

export function formatPlayDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0s";
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export async function apiHealth(base: string): Promise<{ ok: boolean; iso_dir?: string }> {
  const r = await fetch(`${base}/api/health`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export async function apiLibrary(base: string): Promise<LibraryRow[]> {
  const r = await fetch(`${base}/api/library`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export async function apiLibraryGsmModes(base: string): Promise<GsmMode[]> {
  const r = await fetch(`${base}/api/library/gsm-modes`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<GsmMode[]>;
}

export async function apiPlayStatus(base: string): Promise<PlayStatus> {
  const r = await fetch(`${base}/api/play/status`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<PlayStatus>;
}

export async function apiSmb(base: string) {
  const r = await fetch(`${base}/opl/smb`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<{
    share: string;
    username: string;
    password: string;
    port: number;
    iso_dir: string;
    hint: string;
  }>;
}

export async function apiSaveLibrary(
  base: string,
  fd: FormData
): Promise<{ ok: boolean; file?: string; gameid?: string; error?: string }> {
  const r = await fetch(`${base}/api/library/save`, { method: "POST", body: fd });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: (j as { error?: string }).error || r.statusText };
  const o = j as { file?: string; gameid?: string };
  return { ok: true, file: o.file, gameid: o.gameid };
}

export async function apiInspectIso(
  base: string,
  fd: FormData
): Promise<{ gameid: string; display_name: string; error?: string }> {
  const r = await fetch(`${base}/api/library/inspect`, { method: "POST", body: fd });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { gameid: "", display_name: "", error: (j as { error?: string }).error || r.statusText };
  const o = j as { gameid?: string; display_name?: string };
  return { gameid: String(o.gameid || ""), display_name: String(o.display_name || "") };
}

export function artUrl(base: string, gameid: string, name: "icon0.png" | "pic1.png" | "pic2.png") {
  return `${base}/art/${encodeURIComponent(gameid)}/${name}`;
}

/** URL absoluta da capa de biblioteca (UI); só usar se `has_cover`. */
export function libraryCoverAbsUrl(base: string, coverUrl: string) {
  if (!coverUrl.startsWith("/")) return `${base}/${coverUrl}`;
  return `${base}${coverUrl}`;
}

/** Imagem principal para grelha/lista: capa UI ou icon0 OPL. */
export function gameTileImageUrl(base: string, r: LibraryRow): string {
  if (r.has_cover && r.cover_url) return libraryCoverAbsUrl(base, r.cover_url);
  if (r.gameid) return artUrl(base, r.gameid, "icon0.png");
  return "";
}

/** URL de download do ISO no servidor (`GET /download/...`). */
export function gameDownloadUrl(base: string, isoRelPath: string): string {
  const norm = isoRelPath.replace(/\\/g, "/");
  const path = norm.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  return `${base.replace(/\/$/, "")}/download/${path}`;
}
