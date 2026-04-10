const LS_KEY = "osdxmb_backend_url";

export function getBackendUrl(): string {
  return localStorage.getItem(LS_KEY) || "http://127.0.0.1:5000";
}

export function setBackendUrl(url: string) {
  localStorage.setItem(LS_KEY, url.replace(/\/$/, ""));
}

export type LibraryRow = {
  file: string;
  name: string;
  gameid: string;
  size: number;
  has_art: boolean;
  description: string;
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
