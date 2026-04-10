const { app, BrowserWindow, ipcMain, dialog, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { spawn, execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

/**
 * Raiz do projeto (pasta que contém server/ e OSDXMB/).
 * Dev: client/electron -> ../..
 * Instalador: resources/osdxmb/ (extraResources no electron-builder).
 */
function defaultRepoRoot() {
  if (process.env.OSDXMB_REPO) return path.resolve(process.env.OSDXMB_REPO);
  try {
    if (app.isPackaged) {
      const bundled = path.join(process.resourcesPath, "osdxmb");
      if (fs.existsSync(path.join(bundled, "server", "server.py"))) {
        return bundled;
      }
    }
  } catch (_) {}
  return path.resolve(__dirname, "..", "..");
}

let mainWindow = null;
let pythonChild = null;
/** Evita dois arranques em paralelo (duplo clique / StrictMode + race). */
let pythonStartChain = Promise.resolve();
/** Incrementa por cada spawn — prefixo no log para não misturar saída de processos antigos. */
let pythonLogSession = 0;

function venvPythonCandidates(repoRoot) {
  const serverDir = path.join(repoRoot, "server");
  if (process.platform === "win32") {
    return [path.join(serverDir, ".venv", "Scripts", "python.exe")];
  }
  return [
    path.join(serverDir, ".venv", "bin", "python3"),
    path.join(serverDir, ".venv", "bin", "python"),
  ];
}

function getVenvPythonExe(repoRoot) {
  for (const p of venvPythonCandidates(repoRoot)) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Preferir server/.venv (Impacket e deps estáveis); evitar Python 3.14+ do PATH com wheels partidos.
 */
function resolvePythonExe(repoRoot) {
  const v = getVenvPythonExe(repoRoot);
  if (v) return { exe: v, source: "venv" };
  const fallback = process.platform === "win32" ? "python" : "python3";
  return { exe: fallback, source: "path" };
}

/** Python do sistema para criar o venv (Windows: py -3.12 …). */
async function resolveBootstrapPython() {
  const tryRun = async (cmd, args) => {
    const { stdout } = await execFileAsync(cmd, args, {
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024,
    });
    const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
    const p = lines[lines.length - 1];
    if (p && fs.existsSync(p)) return p;
    return null;
  };

  if (process.platform === "win32") {
    for (const ver of ["-3.12", "-3.11", "-3.10"]) {
      try {
        const p = await tryRun("py", [ver, "-c", "import sys; print(sys.executable)"]);
        if (p) return p;
      } catch (_) {}
    }
    try {
      const p = await tryRun("py", ["-c", "import sys; print(sys.executable)"]);
      if (p) return p;
    } catch (_) {}
    try {
      const p = await tryRun("python", ["-c", "import sys; print(sys.executable)"]);
      if (p) return p;
    } catch (_) {}
  } else {
    for (const cmd of ["python3", "python"]) {
      try {
        const p = await tryRun(cmd, ["-c", "import sys; print(sys.executable)"]);
        if (p) return p;
      } catch (_) {}
    }
  }
  return null;
}

function hashRequirementsFiles(serverDir, mode) {
  const h = crypto.createHash("sha256");
  const baseReq = path.join(serverDir, "requirements.txt");
  if (fs.existsSync(baseReq)) h.update(fs.readFileSync(baseReq));
  else h.update("(missing requirements.txt)");
  if (mode === "opl-smb") {
    const smbReq = path.join(serverDir, "requirements-opl-smb.txt");
    if (fs.existsSync(smbReq)) h.update(fs.readFileSync(smbReq));
    else h.update("(missing requirements-opl-smb.txt)");
  }
  return h.digest("hex");
}

function readStamp(p) {
  try {
    return fs.readFileSync(p, "utf8").trim();
  } catch (_) {
    return "";
  }
}

function writeStamp(p, value) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, value + "\n", "utf8");
}

function emitSetupLog(sessionId, stream, line) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("python-log", {
      stream,
      line: `[#${sessionId}] [setup] ${line}\n`,
    });
  }
}

function runModuleWithStreamedOutput(cmd, args, options, onLine) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      ...options,
      shell: false,
      windowsHide: true,
    });
    let out = "";
    let err = "";
    const feed = (buf, acc, stream) => {
      const text = acc + buf.toString("utf8");
      const parts = text.split(/\r?\n/);
      const tail = parts.pop() ?? "";
      for (const line of parts) {
        if (line.length) onLine(stream, line);
      }
      return tail;
    };
    child.stdout?.on("data", (d) => {
      out = feed(d, out, "stdout");
    });
    child.stderr?.on("data", (d) => {
      err = feed(d, err, "stderr");
    });
    child.on("error", (e) => reject(e));
    child.on("close", (code) => {
      if (out.length) onLine("stdout", out);
      if (err.length) onLine("stderr", err);
      if (code === 0) resolve();
      else reject(new Error(`comando terminou com código ${code}`));
    });
  });
}

/**
 * Cria server/.venv se não existir e instala dependências pip (cache por hash dos requirements).
 * mode: "flask" | "opl-smb"
 */
async function ensureServerPythonDeps(repoRoot, mode, sessionId) {
  const serverDir = path.join(repoRoot, "server");
  if (!fs.existsSync(serverDir)) {
    return { ok: false, error: `Pasta server não encontrada: ${serverDir}` };
  }

  let venvPy = getVenvPythonExe(repoRoot);
  if (!venvPy) {
    emitSetupLog(sessionId, "stdout", "Ambiente virtual não encontrado — a criar server/.venv …");
    const bootstrap = await resolveBootstrapPython();
    if (!bootstrap) {
      return {
        ok: false,
        error:
          "Python 3.10–3.12 não encontrado. Instale desde https://www.python.org/downloads/ (marque “Add to PATH”) ou o launcher “py”.",
      };
    }
    emitSetupLog(sessionId, "stdout", `Interpretador para o venv: ${bootstrap}`);
    try {
      await execFileAsync(bootstrap, ["-m", "venv", ".venv"], {
        cwd: serverDir,
        windowsHide: true,
      });
    } catch (e) {
      const msg = e && (e.stderr || e.message) ? String(e.stderr || e.message) : String(e);
      return { ok: false, error: `Falha ao criar venv: ${msg}` };
    }
    venvPy = getVenvPythonExe(repoRoot);
    if (!venvPy) {
      return { ok: false, error: "venv criado mas python não encontrado em server/.venv" };
    }
    emitSetupLog(sessionId, "stdout", "venv criado.");
  }

  const stampName = mode === "opl-smb" ? ".osdxmb_stamp_oplsmb" : ".osdxmb_stamp_flask";
  const stampPath = path.join(serverDir, ".venv", stampName);
  const wantHash = hashRequirementsFiles(serverDir, mode);
  if (readStamp(stampPath) === wantHash) {
    emitSetupLog(sessionId, "stdout", "Dependências Python em dia (cache).");
    return { ok: true };
  }

  const env = envForPythonSubprocess({});
  const onLine = (stream, line) => emitSetupLog(sessionId, stream, line);

  emitSetupLog(sessionId, "stdout", "A instalar/atualizar pacotes pip (pode demorar na 1.ª vez) …");
  try {
    await runModuleWithStreamedOutput(
      venvPy,
      ["-m", "pip", "install", "--disable-pip-version-check", "-U", "pip", "setuptools", "wheel"],
      { cwd: serverDir, env },
      onLine,
    );
  } catch (e) {
    emitSetupLog(sessionId, "stderr", `aviso: atualização pip: ${e.message || e}`);
  }

  const reqBase = path.join(serverDir, "requirements.txt");
  if (!fs.existsSync(reqBase)) {
    return { ok: false, error: `Ficheiro em falta: ${reqBase}` };
  }
  try {
    await runModuleWithStreamedOutput(
      venvPy,
      ["-m", "pip", "install", "--disable-pip-version-check", "-r", reqBase],
      { cwd: serverDir, env },
      onLine,
    );
  } catch (e) {
    return { ok: false, error: `pip install requirements.txt falhou: ${e.message || e}` };
  }

  if (mode === "opl-smb") {
    const reqSmb = path.join(serverDir, "requirements-opl-smb.txt");
    if (!fs.existsSync(reqSmb)) {
      return { ok: false, error: `Ficheiro em falta: ${reqSmb}` };
    }
    try {
      await runModuleWithStreamedOutput(
        venvPy,
        ["-m", "pip", "install", "--disable-pip-version-check", "-r", reqSmb],
        { cwd: serverDir, env },
        onLine,
      );
    } catch (e) {
      return { ok: false, error: `pip install requirements-opl-smb.txt falhou: ${e.message || e}` };
    }
  }

  writeStamp(stampPath, wantHash);
  emitSetupLog(sessionId, "stdout", "Dependências instaladas.");
  return { ok: true };
}

/** Só garante que existe server/.venv (ex.: pack USB — não precisa de Flask). */
async function ensureVenvOnly(repoRoot, sessionId) {
  if (getVenvPythonExe(repoRoot)) return { ok: true };
  const serverDir = path.join(repoRoot, "server");
  if (!fs.existsSync(serverDir)) {
    return { ok: false, error: `Pasta server não encontrada: ${serverDir}` };
  }
  emitSetupLog(sessionId, "stdout", "A criar server/.venv para scripts locais …");
  const bootstrap = await resolveBootstrapPython();
  if (!bootstrap) {
    return {
      ok: false,
      error:
        "Python 3.10–3.12 não encontrado. Instale desde https://www.python.org/downloads/ (marque “Add to PATH”).",
    };
  }
  try {
    await execFileAsync(bootstrap, ["-m", "venv", ".venv"], {
      cwd: serverDir,
      windowsHide: true,
    });
  } catch (e) {
    const msg = e && (e.stderr || e.message) ? String(e.stderr || e.message) : String(e);
    return { ok: false, error: `Falha ao criar venv: ${msg}` };
  }
  if (!getVenvPythonExe(repoRoot)) {
    return { ok: false, error: "venv criado mas python não encontrado em server/.venv" };
  }
  emitSetupLog(sessionId, "stdout", "venv criado.");
  return { ok: true };
}

/**
 * Mata o processo Python e filhos (Waitress + thread SMB no mesmo PID; no Windows
 * com shell:true antigo ficavam órfãos — aqui usamos shell:false + taskkill /T).
 */
async function killPythonProcessTree(child) {
  if (!child || !child.pid) return;
  const pid = child.pid;
  try {
    child.stdout?.removeAllListeners("data");
    child.stderr?.removeAllListeners("data");
    child.removeAllListeners("close");
  } catch (_) {}
  try {
    if (process.platform === "win32") {
      await execFileAsync("taskkill", ["/PID", String(pid), "/T", "/F"], {
        windowsHide: true,
      });
    } else {
      try {
        child.kill("SIGTERM");
      } catch (_) {}
      await new Promise((r) => setTimeout(r, 400));
      try {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
        }
      } catch (_) {}
    }
  } catch (_) {
    /* já terminou */
  }
  if (process.platform === "win32") {
    await new Promise((r) => setTimeout(r, 400));
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 820,
    minWidth: 800,
    minHeight: 560,
    show: true,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: "#09090b",
  });

  mainWindow.on("maximize", () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send("window-maximized-changed", true);
    }
  });
  mainWindow.on("unmaximize", () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send("window-maximized-changed", false);
    }
  });

  mainWindow.webContents.on("did-fail-load", (_e, code, desc, failedUrl) => {
    console.error("[Electron] did-fail-load:", code, desc, failedUrl);
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl).catch((err) => {
      console.error("[Electron] loadURL falhou:", err?.message || err);
    });
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("window-all-closed", async () => {
  if (pythonChild) {
    await killPythonProcessTree(pythonChild);
    pythonChild = null;
  }
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("get-repo-root", () => defaultRepoRoot());

ipcMain.handle("window-minimize", () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
});

ipcMain.handle("window-toggle-maximize", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
  return mainWindow.isMaximized();
});

ipcMain.handle("window-close", () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
});

ipcMain.handle("window-is-maximized", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  return mainWindow.isMaximized();
});

ipcMain.handle("pick-directory", async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory", "createDirectory"],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  return r.filePaths[0];
});

ipcMain.handle("stop-python-backend", async () => {
  if (!pythonChild) return { ok: true };
  const ch = pythonChild;
  pythonChild = null;
  await killPythonProcessTree(ch);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("python-exit", { code: null });
  }
  return { ok: true };
});

function mergeProcessEnv(inject) {
  const env = { ...process.env };
  if (inject && typeof inject === "object") {
    for (const [k, v] of Object.entries(inject)) {
      if (v !== undefined && v !== null) env[k] = String(v);
    }
  }
  return env;
}

/** UTF-8 na stdout/stderr do Python (Windows: evita mquina em vez de máquina). */
function envForPythonSubprocess(inject) {
  const env = mergeProcessEnv(inject);
  if (!env.PYTHONIOENCODING) env.PYTHONIOENCODING = "utf-8";
  if (process.platform === "win32") {
    env.PYTHONUTF8 = "1";
  }
  return env;
}

ipcMain.handle("start-python-backend", async (_e, { mode, env: inject }) => {
  const repo = defaultRepoRoot();
  const serverDir = path.join(repo, "server");
  const script = mode === "opl-smb" ? "opl_smb_host.py" : "server.py";
  const scriptPath = path.join(serverDir, script);

  const myWork = async () => {
    if (!fs.existsSync(scriptPath)) {
      return { ok: false, error: `Script não encontrado: ${scriptPath}` };
    }
    if (pythonChild) {
      const old = pythonChild;
      pythonChild = null;
      await killPythonProcessTree(old);
      await new Promise((r) => setTimeout(r, process.platform === "win32" ? 450 : 250));
    }

    const sessionId = ++pythonLogSession;
    const depMode = mode === "opl-smb" ? "opl-smb" : "flask";
    const deps = await ensureServerPythonDeps(repo, depMode, sessionId);
    if (!deps.ok) {
      return {
        ok: false,
        error: deps.error,
        script: scriptPath,
        pythonExe: "",
        pythonSource: "path",
        pythonHint: deps.error,
      };
    }

    const { exe: cmd, source: pySource } = resolvePythonExe(repo);
    const child = spawn(cmd, ["-u", scriptPath], {
      cwd: serverDir,
      env: envForPythonSubprocess(inject),
      shell: false,
      windowsHide: true,
    });

    pythonChild = child;

    let outBuf = "";
    let errBuf = "";
    const emitCompleteLines = (stream, acc, chunk) => {
      const text = acc + chunk.toString("utf8");
      const parts = text.split(/\r?\n/);
      const tail = parts.pop() ?? "";
      for (const line of parts) {
        if (line.length === 0) continue;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("python-log", { stream, line: `[#${sessionId}] ${line}\n` });
        }
      }
      return tail;
    };
    const flushTail = (stream, tail) => {
      if (tail.length > 0 && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("python-log", { stream, line: `[#${sessionId}] ${tail}\n` });
      }
    };

    child.stdout?.on("data", (d) => {
      outBuf = emitCompleteLines("stdout", outBuf, d);
    });
    child.stderr?.on("data", (d) => {
      errBuf = emitCompleteLines("stderr", errBuf, d);
    });
    child.on("error", (err) => {
      if (pythonChild === child) pythonChild = null;
      const msg = err && err.message ? err.message : String(err);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("python-log", { stream: "stderr", line: `[#${sessionId}] [spawn] ${msg}\n` });
        mainWindow.webContents.send("python-exit", { code: -1 });
      }
    });
    child.on("close", (code) => {
      flushTail("stdout", outBuf);
      flushTail("stderr", errBuf);
      outBuf = "";
      errBuf = "";
      if (pythonChild === child) pythonChild = null;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("python-exit", { code });
      }
    });

    const pythonHint =
      pySource === "venv"
        ? "Interpretador: venv do projeto (server/.venv)."
        : "Interpretador: python do PATH. Recomendado: criar server/.venv e instalar deps (Impacket falha em Python 3.14 do Store).";

    return { ok: true, script: scriptPath, pythonExe: cmd, pythonSource: pySource, pythonHint };
  };

  const p = pythonStartChain.then(() => myWork());
  pythonStartChain = p.catch(() => {});
  return p;
});

ipcMain.handle("run-usb-pack", async (_e, opts) => {
  const repo = defaultRepoRoot();
  const serverDir = path.join(repo, "server");
  const scriptPath = path.join(serverDir, "setup_opl_usb_pack.py");
  if (!fs.existsSync(scriptPath)) {
    return { code: -1, out: "", error: `Não encontrado: ${scriptPath}` };
  }
  const sid = ++pythonLogSession;
  const venvOk = await ensureVenvOnly(repo, sid);
  if (!venvOk.ok) {
    return { code: -1, out: "", error: venvOk.error };
  }
  const args = [
    "-u",
    scriptPath,
    "--out",
    opts.outDir,
    "--pc-ip",
    opts.pcIp || "192.168.0.140",
  ];
  if (opts.skipOsdxmb) args.push("--skip-osdxmb");
  if (opts.staticPs2) args.push("--static-ps2");
  if (opts.ps2Ip) {
    args.push("--ps2-ip", opts.ps2Ip);
    args.push("--ps2-mask", opts.ps2Mask || "255.255.255.0");
    args.push("--ps2-gw", opts.ps2Gw || "192.168.0.1");
    if (opts.ps2Dns) args.push("--ps2-dns", opts.ps2Dns);
  }
  if (opts.layout === "opl-only") args.push("--layout", "opl-only");
  if (opts.copyElf) args.push("--copy-elf");

  const { exe: cmd } = resolvePythonExe(repo);
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: serverDir,
      env: envForPythonSubprocess(opts.env),
      shell: false,
      windowsHide: true,
    });
    let out = "";
    child.stdout?.on("data", (d) => {
      out += d.toString();
    });
    child.stderr?.on("data", (d) => {
      out += d.toString();
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 0, out });
    });
  });
});
