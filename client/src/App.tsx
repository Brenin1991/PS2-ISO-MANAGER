import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  apiHealth,
  apiInspectIso,
  apiLibrary,
  apiPlayStatus,
  apiSaveLibrary,
  apiSmb,
  artUrl,
  formatPlayDuration,
  gameDownloadUrl,
  gameTileImageUrl,
  getBackendUrl,
  setBackendUrl,
  type LibraryRow,
  type PlayStatus,
} from "./api";
import {
  defaultSmbConfig,
  loadSmbConfig,
  saveSmbConfig,
  smbConfigToProcessEnv,
  type SmbClientConfig,
} from "./smbConfig";

type Tab = "library" | "smb" | "usb" | "server";

type LibraryViewMode = "grid" | "list";

function ElectronTitleBar({
  maximized,
  onMaximizedChange,
}: {
  maximized: boolean;
  onMaximizedChange: (v: boolean) => void;
}) {
  const ipc = window.osdxmb;
  if (!ipc?.windowMinimize) return null;
  const { windowMinimize, windowToggleMaximize, windowClose } = ipc;

  async function toggleMax() {
    const m = await windowToggleMaximize();
    if (typeof m === "boolean") onMaximizedChange(m);
  }

  return (
    <div className="titlebar">
      <div
        className="titlebar-drag"
        role="presentation"
        onDoubleClick={() => {
          void toggleMax();
        }}
      >
        OSDXMB Control
      </div>
      <div className="titlebar-controls">
        <button type="button" className="titlebar-btn" aria-label="Minimizar" onClick={() => void windowMinimize()}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <path d="M0 5h10" stroke="currentColor" strokeWidth="1.2" fill="none" />
          </svg>
        </button>
        <button type="button" className="titlebar-btn" aria-label={maximized ? "Restaurar" : "Maximizar"} onClick={() => void toggleMax()}>
          {maximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
              <path d="M2.5 2.5V7h4.5V2.5H2.5z" stroke="currentColor" strokeWidth="1" fill="none" />
              <path d="M3 3h4.5v4.5" stroke="currentColor" strokeWidth="1" fill="none" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
              <rect x="1" y="1" width="8" height="8" stroke="currentColor" strokeWidth="1" fill="none" />
            </svg>
          )}
        </button>
        <button type="button" className="titlebar-btn titlebar-btn--close" aria-label="Fechar" onClick={() => void windowClose()}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.2" fill="none" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function LibraryGameDetailView({
  base,
  row,
  onBack,
}: {
  base: string;
  row: LibraryRow;
  onBack: () => void;
}) {
  const hero = gameTileImageUrl(base, row);
  const downloadHref = gameDownloadUrl(base, row.file);
  const sizeMb = (row.size / (1024 * 1024)).toFixed(1);

  return (
    <div className="library-detail">
      <header className="library-detail-top">
        <button type="button" className="library-back" onClick={onBack}>
          ← Biblioteca
        </button>
      </header>
      <div className="library-detail-hero">
        <div className="library-detail-cover-wrap">
          {hero ? (
            <img
              className="library-detail-cover"
              src={hero}
              alt=""
              onError={(e) => {
                const el = e.currentTarget;
                if (row.has_cover && row.gameid && el.src.includes("/api/library/cover/")) {
                  el.src = artUrl(base, row.gameid, "icon0.png");
                } else {
                  el.style.opacity = "0";
                }
              }}
            />
          ) : (
            <div className="library-detail-cover library-detail-cover--empty" aria-hidden />
          )}
        </div>
        <div className="library-detail-main">
          <h1 className="library-detail-title">{row.name}</h1>
          <div className="library-detail-badges">
            {row.gameid ? <span className="library-pill library-pill--id mono">{row.gameid}</span> : null}
            <span className="library-pill">{sizeMb} MB</span>
            <span className={row.has_art ? "library-pill library-pill--ok" : "library-pill"}>
              Arte OPL: {row.has_art ? "sim" : "não"}
            </span>
            <span className={row.has_cover ? "library-pill library-pill--ok" : "library-pill"}>
              Capa UI: {row.has_cover ? "sim" : "não"}
            </span>
          </div>
          <p className="library-detail-path mono">{row.file}</p>
          <section className="library-detail-block">
            <h2 className="library-detail-h2">Tempo jogado</h2>
            <p className="library-detail-desc">
              {formatPlayDuration(row.play_seconds_total ?? 0)} no total
              <span className="library-detail-muted" style={{ display: "block", marginTop: "0.35rem", fontSize: "0.82rem" }}>
                Calculado a partir de leituras do ISO (SMB OPL ou HTTP). Sessão termina após inatividade no disco.
              </span>
            </p>
          </section>
          {row.description ? (
            <section className="library-detail-block">
              <h2 className="library-detail-h2">Descrição</h2>
              <p className="library-detail-desc">{row.description}</p>
            </section>
          ) : (
            <p className="library-detail-muted">Sem descrição definida.</p>
          )}
          <div className="library-detail-actions">
            <a className="library-btn library-btn--primary" href={downloadHref}>
              Descarregar ISO
            </a>
            {row.gameid ? (
              <span className="library-detail-muted">
                Arte XMB:{" "}
                <a className="library-inline-link" href={artUrl(base, row.gameid, "icon0.png")} target="_blank" rel="noreferrer">
                  icon0
                </a>
                {" · "}
                <a className="library-inline-link" href={artUrl(base, row.gameid, "pic1.png")} target="_blank" rel="noreferrer">
                  pic1
                </a>
                {" · "}
                <a className="library-inline-link" href={artUrl(base, row.gameid, "pic2.png")} target="_blank" rel="noreferrer">
                  pic2
                </a>
              </span>
            ) : null}
          </div>
        </div>
      </div>
      {row.gameid ? (
        <section className="library-detail-opl">
          <h2 className="library-detail-h2">Pré-visualização OPL (HTTP)</h2>
          <div className="library-opl-strip">
            {(["icon0.png", "pic1.png", "pic2.png"] as const).map((name) => (
              <a
                key={name}
                className="library-opl-thumb"
                href={artUrl(base, row.gameid, name)}
                target="_blank"
                rel="noreferrer"
              >
                <img src={artUrl(base, row.gameid, name)} alt={name} />
                <span className="mono">{name}</span>
              </a>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>("library");
  const [base, setBase] = useState(getBackendUrl);
  const [health, setHealth] = useState<string>("");
  const [rows, setRows] = useState<LibraryRow[]>([]);
  const [loadErr, setLoadErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const [gameid, setGameid] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [existingIso, setExistingIso] = useState("");
  const [isoFile, setIsoFile] = useState<File | null>(null);

  const [libraryDetailFile, setLibraryDetailFile] = useState<string | null>(null);
  const [libraryViewMode, setLibraryViewMode] = useState<LibraryViewMode>(() => {
    try {
      return localStorage.getItem("osdxmb_library_view") === "list" ? "list" : "grid";
    } catch {
      return "grid";
    }
  });
  const [librarySearch, setLibrarySearch] = useState("");
  const [cadastroOpen, setCadastroOpen] = useState(false);

  const [smb, setSmb] = useState<Record<string, unknown> | null>(null);
  const [smbCfg, setSmbCfg] = useState<SmbClientConfig>(() => loadSmbConfig());
  const [smbCfgMsg, setSmbCfgMsg] = useState("");

  const [usbOut, setUsbOut] = useState("");
  const [usbPcIp, setUsbPcIp] = useState("192.168.0.140");
  const [usbSkipDash, setUsbSkipDash] = useState(false);
  const [usbLog, setUsbLog] = useState("");
  const [usbRunning, setUsbRunning] = useState(false);

  const [repoHint, setRepoHint] = useState("");

  const [playStatus, setPlayStatus] = useState<PlayStatus | null>(null);

  const [pyLog, setPyLog] = useState("");
  const [pyMode, setPyMode] = useState<"flask" | "opl-smb" | "">("");
  const [pyStarting, setPyStarting] = useState(false);
  const pyLogBoxRef = useRef<HTMLDivElement>(null);

  const refreshLibrary = useCallback(async () => {
    setLoadErr("");
    try {
      const list = await apiLibrary(base);
      setRows(list);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : String(e));
      setRows([]);
    }
  }, [base]);

  const ping = useCallback(async () => {
    setHealth("");
    try {
      const h = await apiHealth(base);
      setHealth(h.ok ? `OK · ISO: ${h.iso_dir || "—"}` : "falhou");
    } catch {
      setHealth("offline");
    }
  }, [base]);

  useEffect(() => {
    void ping();
  }, [ping]);

  useEffect(() => {
    if (tab === "library") void refreshLibrary();
  }, [tab, refreshLibrary]);

  useEffect(() => {
    if (tab !== "library") setLibraryDetailFile(null);
  }, [tab]);

  useEffect(() => {
    try {
      localStorage.setItem("osdxmb_library_view", libraryViewMode);
    } catch {
      /* ignore */
    }
  }, [libraryViewMode]);

  const filteredLibraryRows = useMemo(() => {
    const q = librarySearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.file.toLowerCase().includes(q) ||
        (r.gameid && r.gameid.toLowerCase().includes(q))
    );
  }, [rows, librarySearch]);

  useEffect(() => {
    void window.osdxmb?.getRepoRoot().then(setRepoHint).catch(() => setRepoHint(""));
  }, []);

  useEffect(() => {
    let id: ReturnType<typeof setInterval>;
    const run = () => {
      void apiPlayStatus(base)
        .then(setPlayStatus)
        .catch(() => setPlayStatus(null));
    };
    run();
    id = setInterval(run, 4000);
    return () => clearInterval(id);
  }, [base]);

  useEffect(() => {
    const w = window.osdxmb;
    if (!w) return;
    const offLog = w.onPythonLog?.(({ line }) => setPyLog((p) => p + line));
    const offExit = w.onPythonExit?.(({ code }) => {
      if (code !== null) {
        setPyLog((p) => p + `\n[processo terminado, código ${code}]\n`);
      }
      setPyMode("");
    });
    return () => {
      if (typeof offLog === "function") offLog();
      if (typeof offExit === "function") offExit();
    };
  }, []);

  async function applyBase() {
    setBackendUrl(base);
    setBase(getBackendUrl());
    await ping();
  }

  async function loadSmb() {
    try {
      const j = await apiSmb(base);
      setSmb(j as unknown as Record<string, unknown>);
    } catch {
      setSmb(null);
    }
  }

  useEffect(() => {
    if (tab === "smb") void loadSmb();
  }, [tab, base]);

  async function onSaveLibrary(e: React.FormEvent) {
    e.preventDefault();
    setSaveMsg("");
    setSaving(true);
    const fd = new FormData();
    fd.set("gameid", gameid.trim());
    fd.set("display_name", displayName.trim());
    fd.set("description", description);
    if (existingIso) fd.set("existing_iso", existingIso);
    if (isoFile) fd.set("iso", isoFile);
    const i0 = (document.getElementById("icon0") as HTMLInputElement)?.files?.[0];
    const p1 = (document.getElementById("pic1") as HTMLInputElement)?.files?.[0];
    const p2 = (document.getElementById("pic2") as HTMLInputElement)?.files?.[0];
    const cov = (document.getElementById("cover") as HTMLInputElement)?.files?.[0];
    if (i0) fd.set("icon0", i0);
    if (p1) fd.set("pic1", p1);
    if (p2) fd.set("pic2", p2);
    if (cov) fd.set("cover", cov);
    try {
      const r = await apiSaveLibrary(base, fd);
      if (r.ok) {
        setSaveMsg(`Guardado: ${r.file}${r.gameid ? ` · ID ${r.gameid}` : ""}`);
        setGameid("");
        setDisplayName("");
        setDescription("");
        setExistingIso("");
        setIsoFile(null);
        await refreshLibrary();
      } else {
        setSaveMsg(r.error || "Erro");
      }
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function pickUsbFolder() {
    const p = await window.osdxmb?.pickDirectory();
    if (p) setUsbOut(p);
  }

  async function runUsbPack() {
    if (!usbOut.trim()) {
      setUsbLog("Escolha a pasta de destino.");
      return;
    }
    setUsbRunning(true);
    setUsbLog("A correr…\n");
    saveSmbConfig(smbCfg);
    const r = await window.osdxmb?.runUsbPack({
      outDir: usbOut.trim(),
      pcIp: usbPcIp.trim() || "192.168.0.140",
      skipOsdxmb: usbSkipDash,
      env: smbConfigToProcessEnv(smbCfg),
    });
    setUsbRunning(false);
    if (!r) {
      setUsbLog("Electron API indisponível (corra com npm run dev).");
      return;
    }
    setUsbLog((r.out || "") + (r.error ? `\n${r.error}` : "") + `\n[código ${r.code}]`);
  }

  async function startPy(mode: "flask" | "opl-smb") {
    if (pyStarting) return;
    setPyStarting(true);
    try {
      saveSmbConfig(smbCfg);
      const env = smbConfigToProcessEnv(smbCfg);
      setPyLog((p) => p + `\n─── A iniciar ${mode === "opl-smb" ? "OPL+SMB" : "Flask"}… ───\n`);
      const r = await window.osdxmb?.startPythonBackend(mode, env);
      if (r?.ok) {
        setPyMode(mode);
        const hint = r.pythonHint ? `${r.pythonHint}\n` : "";
        const exe = r.pythonExe ? `Python: ${r.pythonExe}\n` : "";
        setPyLog((p) => p + `OK: ${r.script}\n${exe}${hint}`);
      } else {
        setPyLog((p) => p + `[Erro] ${r?.error || "Falha ao iniciar"}\n`);
      }
    } finally {
      setPyStarting(false);
    }
  }

  async function stopPy() {
    if (pyStarting) return;
    setPyStarting(true);
    try {
      await window.osdxmb?.stopPythonBackend();
      setPyMode("");
      setPyLog((p) => p + "\n─── Parado pelo utilizador ───\n");
    } finally {
      setPyStarting(false);
    }
  }

  function scrollPyLogToEnd() {
    const el = pyLogBoxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }

  const [titleMaximized, setTitleMaximized] = useState(false);

  useEffect(() => {
    const w = window.osdxmb;
    if (!w?.onWindowMaximizedChange || !w?.windowIsMaximized) return;
    void w.windowIsMaximized().then(setTitleMaximized);
    const off = w.onWindowMaximizedChange(setTitleMaximized);
    return () => off();
  }, []);

  const isElectron = Boolean(window.osdxmb);
  const libraryDetailRow = libraryDetailFile ? rows.find((r) => r.file === libraryDetailFile) : undefined;

  return (
    <div className="app">
      {isElectron ? <ElectronTitleBar maximized={titleMaximized} onMaximizedChange={setTitleMaximized} /> : null}
      <header>
        {!isElectron ? <h1>OSDXMB Control</h1> : null}
        <span className="badge">{isElectron ? "Electron" : "Browser"}</span>
        <nav>
          <button type="button" className={tab === "library" ? "active" : ""} onClick={() => setTab("library")}>
            Biblioteca ISO
          </button>
          <button type="button" className={tab === "smb" ? "active" : ""} onClick={() => setTab("smb")}>
            SMB / OPL
          </button>
          <button type="button" className={tab === "usb" ? "active" : ""} onClick={() => setTab("usb")}>
            Pendrive
          </button>
          <button type="button" className={tab === "server" ? "active" : ""} onClick={() => setTab("server")}>
            Servidor
          </button>
        </nav>
      </header>

      {playStatus?.active ? (
        <div className="now-playing" role="status" aria-live="polite">
          <span className="now-playing-dot" aria-hidden />
          <span className="now-playing-label">A jogar agora</span>
          <strong className="now-playing-title">{playStatus.active.name?.trim() || playStatus.active.iso_relpath}</strong>
          {playStatus.active.gameid ? (
            <span className="now-playing-id mono">{playStatus.active.gameid}</span>
          ) : null}
          {playStatus.active.source === "xmb" ? (
            <span className="now-playing-src" title="Indicado pelo XMB ao lançar o jogo">
              XMB
            </span>
          ) : null}
          <span className="now-playing-time">
            sessão {formatPlayDuration(playStatus.active.session_seconds ?? playStatus.session_seconds ?? 0)}
          </span>
        </div>
      ) : null}

      <main className={tab === "library" ? "main main--hub" : "main"}>
        {tab === "library" && (
          <>
            {libraryDetailFile ? (
              libraryDetailRow ? (
                <LibraryGameDetailView base={base} row={libraryDetailRow} onBack={() => setLibraryDetailFile(null)} />
              ) : (
                <div className="card library-missing">
                  <p className="err">Entrada não encontrada ou lista desatualizada.</p>
                  <button type="button" className="primary" onClick={() => setLibraryDetailFile(null)}>
                    Voltar à biblioteca
                  </button>
                </div>
              )
            ) : (
              <section className="library-hub" aria-label="Biblioteca de jogos">
                <div className="library-hub-banner">
                  <div className="library-hub-intro">
                    <h2 className="library-hub-title">Biblioteca</h2>
                    <p className="library-hub-sub">
                      {rows.length} {rows.length === 1 ? "título" : "títulos"}
                      {loadErr ? <span className="err"> · {loadErr}</span> : null}
                    </p>
                  </div>
                  <div className="library-hub-toolbar">
                    <input
                      type="search"
                      className="library-search"
                      placeholder="Pesquisar por nome, ficheiro ou ID…"
                      value={librarySearch}
                      onChange={(e) => setLibrarySearch(e.target.value)}
                      aria-label="Pesquisar na biblioteca"
                    />
                    <div className="library-view-toggle" role="group" aria-label="Modo de visualização">
                      <button
                        type="button"
                        className={libraryViewMode === "grid" ? "active" : undefined}
                        onClick={() => setLibraryViewMode("grid")}
                        aria-pressed={libraryViewMode === "grid"}
                      >
                        Grelha
                      </button>
                      <button
                        type="button"
                        className={libraryViewMode === "list" ? "active" : undefined}
                        onClick={() => setLibraryViewMode("list")}
                        aria-pressed={libraryViewMode === "list"}
                      >
                        Lista
                      </button>
                    </div>
                    <button type="button" className="ghost library-refresh" onClick={() => void refreshLibrary()}>
                      Atualizar
                    </button>
                    <button
                      type="button"
                      className={cadastroOpen ? "library-cadastro-btn is-open" : "library-cadastro-btn"}
                      onClick={() => setCadastroOpen((o) => !o)}
                    >
                      {cadastroOpen ? "Fechar cadastro" : "Adicionar jogo"}
                    </button>
                  </div>
                </div>

                {cadastroOpen && (
                  <div className="card cadastro-card">
                    <h3 className="cadastro-title">Cadastro — novo registo</h3>
                    <p className="sub">
                      ISOs em <code className="mono">server/isos/</code>. Arte OPL:{" "}
                      <code className="mono">/art/&lt;gameid&gt;/…</code>. Metadados e capa de interface: SQLite +{" "}
                      <code className="mono">iso_covers/</code>.
                    </p>
                    <form onSubmit={onSaveLibrary}>
                      <div className="row2">
                        <div>
                          <label htmlFor="gid">Game ID</label>
                          <input
                            id="gid"
                            value={gameid}
                            onChange={(e) => setGameid(e.target.value)}
                            placeholder="Opcional — detetado ao escolher o ISO"
                            pattern="[A-Za-z0-9._\-]{4,40}"
                          />
                        </div>
                        <div>
                          <label htmlFor="dname">Nome na lista</label>
                          <input
                            id="dname"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            required
                          />
                        </div>
                      </div>
                      <label htmlFor="iso">Ficheiro ISO novo</label>
                      <input
                        id="iso"
                        type="file"
                        accept=".iso"
                        onChange={(e) => {
                          const f = e.target.files?.[0] || null;
                          setIsoFile(f);
                          setExistingIso("");
                          if (!f?.name.toLowerCase().endsWith(".iso")) return;
                          const fd = new FormData();
                          fd.set("iso", f);
                          void apiInspectIso(base, fd).then((res) => {
                            if (res.gameid) {
                              setGameid((prev) => (prev.trim() ? prev : res.gameid));
                            }
                            if (res.display_name) {
                              setDisplayName((prev) => (prev.trim() ? prev : res.display_name));
                            }
                          });
                        }}
                      />
                      <label htmlFor="ex">Ou ISO já na pasta</label>
                      <select id="ex" value={existingIso} onChange={(e) => setExistingIso(e.target.value)}>
                        <option value="">— upload novo acima —</option>
                        {rows.map((r) => (
                          <option key={r.file} value={r.file}>
                            {r.file}
                          </option>
                        ))}
                      </select>
                      <label htmlFor="desc">Descrição (opcional)</label>
                      <textarea
                        id="desc"
                        rows={4}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Resumo ou notas — visível na ficha do jogo."
                      />
                      <label htmlFor="cover">Capa para a biblioteca (PNG/JPG)</label>
                      <input id="cover" type="file" accept="image/png,image/jpeg" />
                      <label htmlFor="icon0">icon0 (PNG/JPG)</label>
                      <input id="icon0" type="file" accept="image/png,image/jpeg" />
                      <label htmlFor="pic1">pic1</label>
                      <input id="pic1" type="file" accept="image/png,image/jpeg" />
                      <label htmlFor="pic2">pic2 (opcional)</label>
                      <input id="pic2" type="file" accept="image/png,image/jpeg" />
                      <button type="submit" className="primary" disabled={saving}>
                        {saving ? "A guardar…" : "Guardar"}
                      </button>
                      {saveMsg && <p className={saveMsg.startsWith("Guardado") ? "ok" : "err"}>{saveMsg}</p>}
                    </form>
                  </div>
                )}

                <div className="library-collection">
                  {libraryViewMode === "grid" ? (
                    <div className="library-tile-grid">
                      {filteredLibraryRows.map((r) => {
                        const img = gameTileImageUrl(base, r);
                        return (
                          <button
                            key={r.file}
                            type="button"
                            className="library-tile"
                            onClick={() => setLibraryDetailFile(r.file)}
                          >
                            <div className="library-tile-visual">
                              {img ? (
                                <img
                                  className="library-tile-img"
                                  src={img}
                                  alt=""
                                  onError={(e) => {
                                    const el = e.currentTarget;
                                    if (r.has_cover && r.gameid && el.src.includes("/api/library/cover/")) {
                                      el.src = artUrl(base, r.gameid, "icon0.png");
                                    } else {
                                      el.style.opacity = "0";
                                    }
                                  }}
                                />
                              ) : null}
                              <div className="library-tile-shade" aria-hidden />
                            </div>
                            <div className="library-tile-caption">
                              <span className="library-tile-name">{r.name}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="library-list">
                      {filteredLibraryRows.map((r) => {
                        const img = gameTileImageUrl(base, r);
                        return (
                          <button
                            key={r.file}
                            type="button"
                            className="library-list-row"
                            onClick={() => setLibraryDetailFile(r.file)}
                          >
                            <div className="library-list-thumb">
                              {img ? (
                                <img
                                  src={img}
                                  alt=""
                                  onError={(e) => {
                                    const el = e.currentTarget;
                                    if (r.has_cover && r.gameid && el.src.includes("/api/library/cover/")) {
                                      el.src = artUrl(base, r.gameid, "icon0.png");
                                    } else {
                                      el.style.opacity = "0";
                                    }
                                  }}
                                />
                              ) : (
                                <div className="library-list-thumb--empty" aria-hidden />
                              )}
                            </div>
                            <span className="library-list-name">{r.name}</span>
                            <span className="library-list-go" aria-hidden>
                              →
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {!filteredLibraryRows.length && !loadErr && (
                    <p className="library-empty">
                      {rows.length ? "Nenhum resultado para a pesquisa." : `Nenhum jogo — servidor em ${base}`}
                    </p>
                  )}
                </div>
              </section>
            )}
          </>
        )}

        {tab === "smb" && (
          <>
            <div className="card">
              <h2>Definições SMB / OPL (cliente)</h2>
              <p className="sub">
                Estes valores são gravados neste PC e passados ao Python quando inicias Flask ou OPL+SMB no separador Servidor, e ao gerar o pack USB. Alinham{" "}
                <code className="mono">OPL_SMB_*</code> e <code className="mono">PS2_ISO_DIR</code>.
              </p>
              <div className="row2">
                <div>
                  <label htmlFor="smb-share">Nome da partilha</label>
                  <input
                    id="smb-share"
                    value={smbCfg.share}
                    onChange={(e) => setSmbCfg((c) => ({ ...c, share: e.target.value }))}
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label htmlFor="smb-user">Utilizador</label>
                  <input
                    id="smb-user"
                    value={smbCfg.username}
                    onChange={(e) => setSmbCfg((c) => ({ ...c, username: e.target.value }))}
                    autoComplete="off"
                  />
                </div>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginTop: "0.5rem" }}>
                <input
                  type="checkbox"
                  checked={smbCfg.anonymous}
                  onChange={(e) => setSmbCfg((c) => ({ ...c, anonymous: e.target.checked }))}
                />
                Acesso anónimo (sem password no Impacket)
              </label>
              <label htmlFor="smb-pass">Password</label>
              <input
                id="smb-pass"
                type="password"
                value={smbCfg.password}
                onChange={(e) => setSmbCfg((c) => ({ ...c, password: e.target.value }))}
                disabled={smbCfg.anonymous}
                autoComplete="new-password"
              />
              <div className="row2">
                <div>
                  <label htmlFor="smb-port">Porta SMB (vazio = auto: 4445 Windows / 445 resto)</label>
                  <input
                    id="smb-port"
                    value={smbCfg.port}
                    onChange={(e) => setSmbCfg((c) => ({ ...c, port: e.target.value.replace(/\D/g, "") }))}
                    placeholder="ex. 4445"
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <label htmlFor="smb-bind">Bind (IP a escutar)</label>
                  <input
                    id="smb-bind"
                    value={smbCfg.bind}
                    onChange={(e) => setSmbCfg((c) => ({ ...c, bind: e.target.value }))}
                    placeholder="0.0.0.0"
                  />
                </div>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginTop: "0.5rem" }}>
                <input
                  type="checkbox"
                  checked={smbCfg.smb2}
                  onChange={(e) => setSmbCfg((c) => ({ ...c, smb2: e.target.checked }))}
                />
                SMB2 (<code className="mono">OPL_SMB2=1</code>) — ligue em OPL recente se a lista de jogos falhar; desligado por defeito (SMB1) para consolas antigas (ex. SCPH-30xxx) que muitas vezes não completam login em SMB2
              </label>
              <label htmlFor="smb-iso">Pasta dos ISOs (<code className="mono">PS2_ISO_DIR</code>)</label>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                <input
                  id="smb-iso"
                  style={{ flex: "1 1 240px" }}
                  value={smbCfg.isoDir}
                  onChange={(e) => setSmbCfg((c) => ({ ...c, isoDir: e.target.value }))}
                  placeholder="Vazio = server/isos ao lado de server.py"
                />
                {isElectron && (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() =>
                      void window.osdxmb?.pickDirectory().then((p) => {
                        if (p) setSmbCfg((c) => ({ ...c, isoDir: p }));
                      })
                    }
                  >
                    Procurar…
                  </button>
                )}
                {isElectron && repoHint && (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      const sep = repoHint.includes("\\") ? "\\" : "/";
                      const base = repoHint.replace(/[/\\]+$/, "");
                      setSmbCfg((c) => ({ ...c, isoDir: `${base}${sep}server${sep}isos` }));
                    }}
                  >
                    Usar repo / server / isos
                  </button>
                )}
              </div>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    saveSmbConfig(smbCfg);
                    setSmbCfgMsg("Guardado. Reinicia o Python se já estiver a correr para aplicar.");
                  }}
                >
                  Guardar definições
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setSmbCfg(defaultSmbConfig());
                    saveSmbConfig(defaultSmbConfig());
                    setSmbCfgMsg("Repostas de fábrica guardadas.");
                  }}
                >
                  Repor predefinições
                </button>
              </div>
              {smbCfgMsg && <p className="ok" style={{ marginTop: "0.5rem" }}>{smbCfgMsg}</p>}
            </div>

            <div className="card">
              <h2>Estado no servidor (GET /opl/smb)</h2>
              <p className="sub">Só reflete o processo Python em curso (variáveis de ambiente efectivas).</p>
              <button type="button" className="ghost" onClick={() => void loadSmb()}>
                Atualizar
              </button>
              {smb ? (
                <ul className="mono" style={{ marginTop: "0.75rem", paddingLeft: "1.2rem" }}>
                  <li>share: {String(smb.share)}</li>
                  <li>user: {String(smb.username)}</li>
                  <li>password: {String(smb.password).length === 0 ? "(vazio / anónimo)" : "••••"}</li>
                  <li>port: {String(smb.port)}</li>
                  <li>smb2 (servidor): {String(smb.smb2)}</li>
                  <li>iso_dir: {String(smb.iso_dir)}</li>
                  <li style={{ marginTop: "0.5rem", color: "var(--muted)", whiteSpace: "pre-wrap" }}>
                    {String(smb.hint || "")}
                  </li>
                  {"checklist" in smb && smb.checklist != null && (
                    <li style={{ marginTop: "0.5rem", color: "var(--muted)", whiteSpace: "pre-wrap" }}>
                      {String(smb.checklist)}
                    </li>
                  )}
                </ul>
              ) : (
                <p className="err">Sem resposta do servidor.</p>
              )}
            </div>
          </>
        )}

        {tab === "usb" && (
          <div className="card">
            <h2>Pendrive PS2 (OPL flat + OSDXMB)</h2>
            <p className="sub">
              Gera na pasta escolhida: <code className="mono">ART CFG CHT… DVD CD conf_*.cfg</code> na raiz + cópia
              completa de <code className="mono">OSDXMB/</code>. Copie o conteúdo para a FAT32 do USB. Repo detectado:{" "}
              <code className="mono">{repoHint || "—"}</code>
            </p>
            <label>Pasta de saída</label>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
              <input type="text" value={usbOut} onChange={(e) => setUsbOut(e.target.value)} placeholder="E:\ ou pasta staging" style={{ flex: "1 1 240px" }} />
              {isElectron && (
                <button type="button" className="ghost" onClick={() => void pickUsbFolder()}>
                  Procurar…
                </button>
              )}
            </div>
            <label>IP do PC (SMB no conf_network.cfg)</label>
            <input type="text" value={usbPcIp} onChange={(e) => setUsbPcIp(e.target.value)} />
            <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginTop: "0.75rem" }}>
              <input type="checkbox" checked={usbSkipDash} onChange={(e) => setUsbSkipDash(e.target.checked)} />
              Só pastas OPL (não copiar OSDXMB)
            </label>
            <button type="button" className="primary" disabled={usbRunning || !isElectron} onClick={() => void runUsbPack()}>
              Gerar pack
            </button>
            {!isElectron && <p className="sub">Disponível na app Electron (<code className="mono">npm run dev</code> na pasta client).</p>}
            {usbLog && <div className="logbox">{usbLog}</div>}
          </div>
        )}

        {tab === "server" && (
          <>
            <div className="card">
              <h2>URL do backend Flask</h2>
              <input type="url" value={base} onChange={(e) => setBase(e.target.value.trim())} />
              <button type="button" className="primary" onClick={() => void applyBase()}>
                Aplicar e testar
              </button>
              <p className="sub">
                Estado: <strong>{health || "…"}</strong>
              </p>
            </div>
            {isElectron && (
              <div className="card">
                <h2>Python local (pasta server/ do repo)</h2>
                <p className="sub">
                  Na primeira vez (ou se mudarem os <code className="mono">requirements*.txt</code>), a app cria{" "}
                  <code className="mono">server/.venv</code> e instala dependências com <code className="mono">pip</code> — só precisa de Python
                  3.10–3.12 no PC. <code className="mono">server.py</code> — só HTTP (biblioteca, lista, arte).{" "}
                  <code className="mono">opl_smb_host.py</code> — HTTP + SMB Impacket. Variáveis{" "}
                  <code className="mono">OPL_SMB_*</code> e <code className="mono">PS2_ISO_DIR</code> vêm das definições no separador SMB / OPL.
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
                  <button
                    type="button"
                    className="primary"
                    disabled={pyStarting || pyMode === "flask"}
                    onClick={() => void startPy("flask")}
                  >
                    Iniciar Flask
                  </button>
                  <button
                    type="button"
                    className="primary"
                    disabled={pyStarting || pyMode === "opl-smb"}
                    onClick={() => void startPy("opl-smb")}
                  >
                    Iniciar OPL+SMB
                  </button>
                  <button type="button" className="ghost" disabled={pyStarting} onClick={() => void stopPy()}>
                    Parar
                  </button>
                  {pyMode && <span className="badge">{pyMode}</span>}
                  {pyStarting && <span className="badge">a arrancar…</span>}
                </div>
                <h3 style={{ marginTop: "1rem", marginBottom: "0.35rem", fontSize: "1rem" }}>Consola (saída Python)</h3>
                <p className="sub" style={{ marginTop: 0 }}>
                  Separado dos botões de arranque: só mostra o log; use Limpar ou ir para o fim sem reiniciar o servidor.
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <button type="button" className="ghost" onClick={() => setPyLog("")}>
                    Limpar consola
                  </button>
                  <button type="button" className="ghost" onClick={scrollPyLogToEnd} disabled={!pyLog}>
                    Ir para o fim do log
                  </button>
                </div>
                <div ref={pyLogBoxRef} className="logbox" style={{ maxHeight: "280px", overflow: "auto" }}>
                  {pyLog || <span className="sub">(sem saída ainda)</span>}
                </div>
              </div>
            )}
            {!isElectron && (
              <div className="card">
                <p className="sub">
                  Para arrancar Python a partir da UI, use a build Electron. No browser, inicie manualmente na pasta{" "}
                  <code className="mono">server</code>: <code className="mono">python server.py</code>.
                </p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
