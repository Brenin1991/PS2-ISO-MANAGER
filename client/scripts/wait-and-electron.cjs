/**
 * Espera o Vite (HTTP) e abre o Electron.
 * Vite tem de estar em 127.0.0.1 — ver vite.config.ts server.host
 */
const { spawn } = require("child_process");
const path = require("path");
const waitOn = require("wait-on");

const root = path.join(__dirname, "..");
const url = "http://127.0.0.1:5173";

console.log("[OSDXMB] À espera do Vite em", url, "…");

waitOn({
  resources: [url],
  timeout: 90000,
  interval: 150,
  validateStatus: (status) => status >= 200 && status < 500,
})
  .then(() => {
    console.log("[OSDXMB] Vite OK. A abrir Electron…");

    const electronExe = require("electron");
    const env = { ...process.env, VITE_DEV_SERVER_URL: url };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.NODE_OPTIONS;

    const child = spawn(electronExe, ["."], {
      cwd: root,
      env,
      stdio: "inherit",
      windowsHide: false,
    });

    child.on("error", (err) => {
      console.error("[OSDXMB] spawn Electron:", err.message);
      process.exit(1);
    });

    child.on("close", (code) => process.exit(code == null ? 0 : code));
  })
  .catch((err) => {
    console.error("[OSDXMB] Timeout / erro ao esperar o Vite:", err.message || err);
    console.error("[OSDXMB] Confirma vite.config.ts → server.host: \"127.0.0.1\"");
    process.exit(1);
  });
