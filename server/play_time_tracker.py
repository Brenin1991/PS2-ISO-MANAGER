"""
Rastreio de jogo ativo + tempo jogado (SQLite).

- SMB (OPL): hooks em leituras SMB1 READ_ANDX e SMB2 READ (impacket) — ver smb_iso_hooks.
- HTTP: rotas /download e /download_segment no Flask.

Env:
  PLAY_IDLE_SECONDS — após N s sem leituras no ISO, a sessão fecha (default 120).
  XMB_PLAY_REPORT_TTL — segundos em que um relatório GET/POST do XMB conta como "a jogar" (default 14400 = 4 h).
  OSDXMB_REPORT_KEY — se definido, o pedido /api/play/report deve enviar o mesmo valor em ?key=
"""

from __future__ import annotations

import os
import threading
import time
from typing import Any

import iso_library_db

_lock = threading.RLock()
_iso_dir: str | None = None
_db_path: str | None = None

_active_iso: str | None = None
_session_start: float | None = None
_last_read_ts: float | None = None
_idle_thread: threading.Thread | None = None
_stop_idle = threading.Event()

_xmb_iso: str | None = None
_xmb_name: str = ""
_xmb_gameid: str = ""
_xmb_ts: float | None = None
_disk_session_from_xmb_report: bool = False


def configure(iso_dir: str, library_db_path: str) -> None:
    global _iso_dir, _db_path
    iso_library_db.ensure_db(library_db_path, None)
    _iso_dir = os.path.realpath(iso_dir)
    _db_path = library_db_path
    _ensure_idle_thread()


def _idle_seconds() -> float:
    try:
        return max(30.0, float(os.environ.get("PLAY_IDLE_SECONDS", "120")))
    except ValueError:
        return 120.0


def _xmb_report_ttl() -> float:
    try:
        return max(60.0, float(os.environ.get("XMB_PLAY_REPORT_TTL", "14400")))
    except ValueError:
        return 14400.0


def _relpath_from_abs(abs_path: str) -> str | None:
    if not _iso_dir:
        return None
    try:
        p = os.path.realpath(abs_path)
    except OSError:
        return None
    if not p.lower().endswith(".iso"):
        return None
    root = _iso_dir
    if not (p.startswith(root + os.sep) or p == root):
        return None
    rel = os.path.relpath(p, root).replace("\\", "/")
    if ".." in rel.split("/"):
        return None
    return rel


def _finalize_session_locked() -> None:
    global _active_iso, _session_start, _last_read_ts
    db = _db_path
    if not db or not _active_iso or _session_start is None or _last_read_ts is None:
        _active_iso = None
        _session_start = None
        _last_read_ts = None
        return
    delta = float(_last_read_ts) - float(_session_start)
    if delta >= 1.0:
        iso_library_db.play_time_add_seconds(db, _active_iso, delta)
    _active_iso = None
    _session_start = None
    _last_read_ts = None


def touch_iso_relpath(iso_relpath: str, _weight_bytes: int = 0, *, from_xmb_report: bool = False) -> None:
    """Regista atividade de leitura num ISO (caminho relativo a PS2_ISO_DIR)."""
    rp = iso_relpath.replace("\\", "/").strip()
    if not rp.lower().endswith(".iso"):
        return
    now = time.time()
    with _lock:
        global _active_iso, _session_start, _last_read_ts, _disk_session_from_xmb_report
        if not from_xmb_report:
            _disk_session_from_xmb_report = False
        if _active_iso != rp:
            _finalize_session_locked()
            _active_iso = rp
            _session_start = now
            _disk_session_from_xmb_report = bool(from_xmb_report)
        elif from_xmb_report:
            _disk_session_from_xmb_report = True
        _last_read_ts = now


def touch_iso_abspath(abs_path: str, weight_bytes: int = 0) -> None:
    rp = _relpath_from_abs(abs_path)
    if rp:
        touch_iso_relpath(rp, weight_bytes)


def idle_tick() -> None:
    """Se passou o intervalo sem leituras, fecha a sessão e grava tempo."""
    now = time.time()
    idle_lim = _idle_seconds()
    with _lock:
        if not _active_iso or _last_read_ts is None:
            return
        if now - _last_read_ts <= idle_lim:
            return
        _finalize_session_locked()


def _idle_loop() -> None:
    while not _stop_idle.wait(4.0):
        idle_tick()


def _ensure_idle_thread() -> None:
    global _idle_thread
    if _idle_thread is not None and _idle_thread.is_alive():
        return
    _stop_idle.clear()
    _idle_thread = threading.Thread(target=_idle_loop, name="play-time-idle", daemon=True)
    _idle_thread.start()


def report_from_xmb(
    iso_relpath: str,
    *,
    name: str = "",
    gameid: str = "",
    clear: bool = False,
) -> tuple[bool, str | None]:
    """
    Relatório explícito da consola (GET/POST /api/play/report).
    Usa o mesmo ISO_DIR que o servidor; não valida existência do ficheiro.
    """
    global _xmb_iso, _xmb_name, _xmb_gameid, _xmb_ts
    if clear:
        with _lock:
            global _disk_session_from_xmb_report
            # Termina sessão em disco e grava tempo; limpa também relatório XMB (TTL longo).
            _finalize_session_locked()
            _xmb_iso = None
            _xmb_name = ""
            _xmb_gameid = ""
            _xmb_ts = None
            _disk_session_from_xmb_report = False
        return True, None
    rp = iso_relpath.replace("\\", "/").strip()
    if not rp.lower().endswith(".iso"):
        return False, "iso inválido"
    if ".." in rp.split("/"):
        return False, "caminho inválido"
    now = time.time()
    with _lock:
        _xmb_iso = rp
        _xmb_name = (name or "").strip()
        _xmb_gameid = (gameid or "").strip()
        _xmb_ts = now
    touch_iso_relpath(rp, 0, from_xmb_report=True)
    return True, None


def get_snapshot() -> dict[str, Any]:
    """Estado para GET /api/play/status."""
    now = time.time()
    idle_lim = _idle_seconds()
    xmb_ttl = _xmb_report_ttl()
    with _lock:
        active_iso = _active_iso
        session_start = _session_start
        last_read = _last_read_ts
        xmb_iso = _xmb_iso
        xmb_name = _xmb_name
        xmb_gameid = _xmb_gameid
        xmb_ts = _xmb_ts
        disk_from_xmb = _disk_session_from_xmb_report
    out: dict[str, Any] = {
        "idle_threshold_seconds": idle_lim,
        "active": None,
        "session_seconds": None,
        "seconds_since_last_read": None,
        "help": (
            "1) Leituras reais no .iso (SMB/HTTP). 2) Relatório do XMB: GET/POST /api/play/report "
            "(Request.download no script). XMB_PLAY_REPORT_TTL segundos após o relatório, "
            "se não houver leituras detetadas."
        ),
    }
    if active_iso and session_start is not None and last_read is not None:
        since_read = now - last_read
        out["seconds_since_last_read"] = round(since_read, 1)
        out["session_seconds"] = round(now - session_start, 1)
        if since_read <= idle_lim:
            src = "xmb" if disk_from_xmb else "disk"
            meta: dict[str, Any] = {"iso_relpath": active_iso, "source": src}
            if _db_path:
                lib = iso_library_db.load_all_as_dict(_db_path)
                row = lib.get(active_iso) or {}
                meta["name"] = row.get("name") or ""
                meta["gameid"] = row.get("gameid") or ""
            meta["session_seconds"] = round(now - session_start, 1)
            out["active"] = meta
            return out

    if xmb_iso and xmb_ts is not None and (now - xmb_ts) <= xmb_ttl:
        meta2: dict[str, Any] = {
            "iso_relpath": xmb_iso,
            "source": "xmb",
            "session_seconds": round(now - xmb_ts, 1),
            "seconds_since_last_read": round(now - xmb_ts, 1),
        }
        if _db_path:
            lib = iso_library_db.load_all_as_dict(_db_path)
            row = lib.get(xmb_iso) or {}
            meta2["name"] = (xmb_name or row.get("name") or "").strip()
            meta2["gameid"] = (xmb_gameid or row.get("gameid") or "").strip()
        else:
            meta2["name"] = xmb_name
            meta2["gameid"] = xmb_gameid
        out["session_seconds"] = meta2["session_seconds"]
        out["seconds_since_last_read"] = meta2["seconds_since_last_read"]
        out["active"] = meta2
        return out

    return out


def shutdown() -> None:
    _stop_idle.set()
    with _lock:
        _finalize_session_locked()
