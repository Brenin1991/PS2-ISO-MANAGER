"""
Servidor UDP em rede para a PS2: udpfs_server.py (Rick Gaiser / Neutrino).

Por defeito (UDPBD_MANAGED=0, definido em server.py) o Flask só serve HTTP: lista de ISOs, arte,
/udpbd/prepare (valida ficheiro). O udpfs_server corre à mão: ex. python udpfs_server.py -d PASTA -r

Modos (UDPBD_NET_MODE no PC — default udpfs):
  - udpfs: -d pasta; na PS2 netiso udpfs_net=1; -bsd=udpfs -dvd=udpfs:nome.iso
  - block: UDPBD_NET_MODE=block — -b um ISO; na PS2 bdfs:udp0p0

Env:
  UDPBD_MANAGED — default 0 (só lista/prepare no Flask). Se 1 / true: o Flask inicia/mata udpfs_server.

  UDPBD_PREPARE_WAIT — após spawn do udpfs (só com UDPBD_MANAGED=1). default 0.5 s; máx. 5.

  UDPBD_SAME_ROOT_SLEEP_MS — opcional (só managed). Mesma pasta sem reiniciar; grace em ms; máx. 5000.

  UDPBD_AUTOSTART — com UDPBD_MANAGED=1 e udpfs: ao subir o Flask, udpfs_server -d em PS2_ISO_DIR
  (ou UDPBD_FS_ROOT). Desligar: 0 / false / off.
"""

from __future__ import annotations

import atexit
import os
import subprocess
import time
import sys
import threading
from typing import Any

_lock = threading.Lock()
_proc: subprocess.Popen[Any] | None = None
_proc_root: str | None = None
_udpbd_stderr_fp: Any | None = None

_NEUTRINO_PC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "neutrino_pc")
_UDPFS_SCRIPT = os.path.join(_NEUTRINO_PC, "udpfs_server.py")
_PACK_NEUTRINO_VER = os.path.normpath(
    os.path.join(os.path.dirname(_NEUTRINO_PC), "..", "OSDXMB", "APPS", "neutrino", "version.txt")
)


def _truthy_env(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in ("1", "true", "yes", "on")


def _managed() -> bool:
    """Se False (default), prepare_iso só valida ISO; udpfs_server corre à parte."""
    v = (os.environ.get("UDPBD_MANAGED") or "0").strip().lower()
    return v not in ("0", "false", "no", "off", "external")


def _autostart_enabled() -> bool:
    """Por defeito ligado; desligar com UDPBD_AUTOSTART=0 / false / off / no."""
    v = (os.environ.get("UDPBD_AUTOSTART") or "1").strip().lower()
    return v not in ("0", "false", "no", "off")


def _srv_log(msg: str) -> None:
    """Sempre na consola do Flask/Waitress (flush imediato no Windows)."""
    print(f"[UDPBD] {msg}", flush=True)


def net_mode() -> str:
    """udpfs (default, -d pasta) | block (-b ISO + bdfs:udp0p0) com UDPBD_NET_MODE=block"""
    v = (os.environ.get("UDPBD_NET_MODE") or "udpfs").strip().lower()
    if v in ("block", "bd", "udpbd"):
        return "block"
    return "udpfs"


def _pack_neutrino_version() -> str | None:
    if not os.path.isfile(_PACK_NEUTRINO_VER):
        return None
    try:
        with open(_PACK_NEUTRINO_VER, encoding="utf-8") as f:
            return f.read().strip() or None
    except OSError:
        return None


def prepare_response_meta(sector: int | None = None) -> dict[str, Any]:
    s = _default_sector_size() if sector is None else sector
    mode = net_mode()
    hint = (
        "Neutrino v1.8+: UDPFS — udpfs_ioman/udpfs_fhi + ministack (bsd-udpfs.toml ip=) e mesmo udpfs_server.py."
        if mode == "udpfs"
        else "UDPBD bloco — smap_udpbd.irx (bsd-udpbd.toml ip=) e mesmo udpfs_server.py."
    )
    try:
        pw = float((os.environ.get("UDPBD_PREPARE_WAIT") or "0.5").strip())
    except ValueError:
        pw = 0.5
    pw = max(0.0, min(pw, 5.0))
    return {
        "net_mode": mode,
        "sector_size": s,
        "udpbd_verbose": _truthy_env("UDPBD_VERBOSE"),
        "neutrino_pack_version": _pack_neutrino_version(),
        "match_hint": hint,
        "prepare_wait_sec": pw,
        "udpbd_managed": _managed(),
        "udpbd_autostart": _autostart_enabled(),
    }


def _udpfs_argv_block(iso_abs: str, sector: int) -> list[str]:
    cmd: list[str] = [
        sys.executable,
        _UDPFS_SCRIPT,
        "-b",
        iso_abs,
        "-r",
        "-s",
        str(sector),
    ]
    if _truthy_env("UDPBD_VERBOSE"):
        cmd.append("-v")
    return cmd


def _udpfs_argv_dir(root_dir: str) -> list[str]:
    cmd: list[str] = [
        sys.executable,
        _UDPFS_SCRIPT,
        "-d",
        root_dir,
        "-r",
    ]
    if _truthy_env("UDPBD_VERBOSE"):
        cmd.append("-v")
    return cmd


def _stderr_for_udpbd() -> Any:
    global _udpbd_stderr_fp
    log_path = (os.environ.get("UDPBD_LOG") or "").strip()
    if log_path:
        if _udpbd_stderr_fp is not None:
            return _udpbd_stderr_fp
        try:
            _udpbd_stderr_fp = open(log_path, "a", encoding="utf-8", buffering=1)
        except OSError:
            return None if _truthy_env("UDPBD_VERBOSE") else subprocess.DEVNULL
        return _udpbd_stderr_fp
    if _truthy_env("UDPBD_VERBOSE"):
        return None
    return subprocess.DEVNULL


def _default_sector_size() -> int:
    try:
        return int(os.environ.get("UDPBD_SECTOR_SIZE", "2048"), 10)
    except ValueError:
        return 2048


def _prepare_wait_after_spawn(source: str = "prepare_iso") -> None:
    """Dá tempo ao subprocess de fazer bind na porta de discovery antes de seguir."""
    raw = (os.environ.get("UDPBD_PREPARE_WAIT") or "0.5").strip()
    try:
        sec = float(raw)
    except ValueError:
        sec = 0.5
    sec = max(0.0, min(sec, 5.0))
    if sec <= 0:
        return
    time.sleep(sec)
    _srv_log(f"{source}: UDPBD_PREPARE_WAIT={sec}s (discovery pronta)")


def shutdown() -> None:
    global _proc, _proc_root, _udpbd_stderr_fp
    with _lock:
        if _proc is None:
            pass
        else:
            try:
                _proc.terminate()
                try:
                    _proc.wait(timeout=4.0)
                except subprocess.TimeoutExpired:
                    _proc.kill()
            except OSError:
                pass
            _proc = None
        _proc_root = None
    if _udpbd_stderr_fp is not None:
        try:
            _udpbd_stderr_fp.close()
        except OSError:
            pass
        _udpbd_stderr_fp = None


atexit.register(shutdown)


def _spawn_proc(argv: list[str], stderr_dest: Any, stdout_dest: Any, creationflags: int) -> bool:
    global _proc
    try:
        _proc = subprocess.Popen(
            argv,
            cwd=_NEUTRINO_PC,
            stdout=stdout_dest,
            stderr=stderr_dest,
            creationflags=creationflags,
        )
        if _proc.poll() is not None:
            _srv_log(f"SUBPROCESSO MORREU logo ao arrancar (exit={_proc.poll()})")
            _proc = None
            return False
        return True
    except OSError as e:
        _srv_log(f"Falha ao lançar subprocess: {e!r}")
        _proc = None
        return False


def maybe_autostart_with_iso_dir(iso_dir: str) -> None:
    """
    Com UDPBD_AUTOSTART=1 e UDPBD_NET_MODE=udpfs, arranca udpfs_server -d uma vez no arranque do Flask.
    """
    global _proc, _proc_root
    if not _autostart_enabled():
        return
    if not _managed():
        _srv_log("UDPBD_AUTOSTART: ignorado (UDPBD_MANAGED=0)")
        return
    if net_mode() != "udpfs":
        _srv_log("UDPBD_AUTOSTART: ignorado — defina UDPBD_NET_MODE=udpfs para servir pasta fixa")
        return
    root = os.environ.get("UDPBD_FS_ROOT", "").strip() or iso_dir
    root = os.path.realpath(root)
    if not os.path.isdir(root):
        _srv_log(f"UDPBD_AUTOSTART: pasta inválida — {root!r}")
        return
    if not os.path.isfile(_UDPFS_SCRIPT):
        _srv_log("UDPBD_AUTOSTART: falta neutrino_pc/udpfs_server.py")
        return

    creationflags = 0
    if sys.platform == "win32":
        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    stderr_dest = _stderr_for_udpbd()
    stdout_dest: Any = subprocess.DEVNULL
    if _truthy_env("UDPBD_VERBOSE"):
        stdout_dest = None

    with _lock:
        if _proc is not None and _proc.poll() is None and _proc_root is not None:
            if os.path.normcase(_proc_root) == os.path.normcase(root):
                _srv_log(f"UDPBD_AUTOSTART: servidor já ativo pid={_proc.pid} root={root!r}")
                return
            _srv_log("UDPBD_AUTOSTART: a substituir processo udpfs anterior…")
            try:
                _proc.terminate()
                try:
                    _proc.wait(timeout=4.0)
                except subprocess.TimeoutExpired:
                    _proc.kill()
            except OSError:
                pass
            _proc = None
            _proc_root = None

        argv = _udpfs_argv_dir(root)
        _proc_root = root
        _srv_log(f"UDPBD_AUTOSTART: a iniciar udpfs_server -d {root!r} (read-only)")
        if not _spawn_proc(argv, stderr_dest, stdout_dest, creationflags):
            _proc_root = None
            return
        _srv_log(f"UDPBD_AUTOSTART: OK pid={_proc.pid} — discovery 62966; prepare não precisa de cold start")
        _prepare_wait_after_spawn("UDPBD_AUTOSTART")


def prepare_iso(iso_abs: str) -> tuple[bool, str]:
    global _proc, _proc_root

    if not os.environ.get("ENABLE_UDPBD", "1").strip() in ("1", "true", "True", "yes", "YES"):
        _srv_log("prepare_iso: ENABLE_UDPBD desativado no ambiente")
        return False, "UDPBD desativado (ENABLE_UDPBD)"

    if not os.path.isfile(iso_abs):
        _srv_log(f"prepare_iso: ISO não existe — {iso_abs!r}")
        return False, "ISO não encontrada"

    if not _managed():
        _srv_log("prepare_iso: UDPBD_MANAGED=0 — subprocesso externo (só validação do ficheiro)")
        if net_mode() == "block":
            _srv_log(
                "prepare_iso: modo block externo — o teu udpfs_server tem de usar -b com ESTE .iso"
            )
        return True, os.path.basename(iso_abs)

    if not os.path.isfile(_UDPFS_SCRIPT):
        _srv_log("prepare_iso: falta neutrino_pc/udpfs_server.py")
        return False, "neutrino_pc/udpfs_server.py em falta"

    mode = net_mode()
    base = os.path.basename(iso_abs)
    _srv_log(f"prepare_iso: ficheiro={base!r} modo={mode!r}")
    sector = _default_sector_size()
    creationflags = 0
    if sys.platform == "win32":
        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)

    stderr_dest = _stderr_for_udpbd()
    stdout_dest: Any = subprocess.DEVNULL
    if _truthy_env("UDPBD_VERBOSE"):
        stdout_dest = None

    with _lock:
        if mode == "udpfs":
            root = os.path.realpath(os.path.dirname(os.path.abspath(iso_abs)))
            if not os.path.isdir(root):
                _srv_log(f"prepare_iso: pasta inválida — {root!r}")
                return False, "pasta do ISO invalida"
            if (
                _proc is not None
                and _proc.poll() is None
                and _proc_root is not None
                and os.path.normcase(_proc_root) == os.path.normcase(root)
            ):
                _srv_log(
                    f"udpfs_server já a correr (mesma pasta), pid={_proc.pid}, "
                    f"root={root!r}, jogo={base!r}"
                )
                try:
                    same_ms = int(
                        (os.environ.get("UDPBD_SAME_ROOT_SLEEP_MS") or "0").strip() or "0"
                    )
                except ValueError:
                    same_ms = 0
                same_ms = max(0, min(same_ms, 5000))
                if same_ms > 0:
                    time.sleep(same_ms / 1000.0)
                    _srv_log(f"prepare_iso: UDPBD_SAME_ROOT_SLEEP_MS={same_ms} ms")
                return True, os.path.basename(iso_abs)
        else:
            _proc_root = None

        if _proc is not None:
            _srv_log(f"A terminar udpfs_server anterior (pid={_proc.pid})…")
            try:
                _proc.terminate()
                try:
                    _proc.wait(timeout=4.0)
                except subprocess.TimeoutExpired:
                    _proc.kill()
            except OSError:
                pass
            _proc = None

        if mode == "udpfs":
            root = os.path.realpath(os.path.dirname(os.path.abspath(iso_abs)))
            argv = _udpfs_argv_dir(root)
            _proc_root = root
            _srv_log(f"A iniciar udpfs_server -d {root!r} (read-only)")
        else:
            argv = _udpfs_argv_block(iso_abs, sector)
            _proc_root = None
            _srv_log(
                f"A iniciar udpfs_server -b (bloco) sector={sector} ficheiro={iso_abs!r}"
            )

        if not _spawn_proc(argv, stderr_dest, stdout_dest, creationflags):
            _proc_root = None
            return False, "udpfs_server terminou ao arrancar"
        ps2_hint = (
            f"PS2: -bsd=udpfs -dvd=udpfs:{base}  (README: sem / após udpfs:)"
            if mode == "udpfs"
            else "PS2: -bsd=udpbd -dvd=bdfs:udp0p0"
        )
        _srv_log(
            f"udpfs_server OK — pid={_proc.pid}, UDP 62966 (0x{0xF5F6:04X}). {ps2_hint}"
        )
        _prepare_wait_after_spawn()

    return True, os.path.basename(iso_abs)


def status() -> dict[str, Any]:
    with _lock:
        running = _proc is not None and _proc.poll() is None
        pid = _proc.pid if _proc is not None else None
        served = _proc_root
    out: dict[str, Any] = {
        "running": running,
        "pid": pid,
        "served_root": served,
        "port": 0xF5F6,
        "port_decimal": 62966,
    }
    out.update(prepare_response_meta())
    return out
