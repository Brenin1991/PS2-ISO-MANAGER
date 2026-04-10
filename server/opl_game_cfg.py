"""
Ficheiros per-jogo do OPL na pasta CFG/ (mesmo volume que DVD/CD — ex. SMB share).

Chaves alinhadas a include/config.h (Open PS2 Loader): $EnableGSM, $GSMVMode, …
Índices de $GSMVMode: src/gsm.c predef_vmode[0..28].
"""

from __future__ import annotations

import os

# CONFIG_SOURCE_USER
_GSM_SOURCE_USER = "1"

# Ordem de escrita das chaves GSM no ficheiro
_GSM_KEYS_ORDER = (
    "$GSMSource",
    "$EnableGSM",
    "$GSMVMode",
    "$GSMXOffset",
    "$GSMYOffset",
    "$GSMFIELDFix",
)
_GSM_KEYS_SET = frozenset(_GSM_KEYS_ORDER)

# Índices 0..28 = entradas em gsm.c::predef_vmode (ordem fixa do OPL)
GSM_VMODE_LABELS: tuple[str, ...] = (
    "NTSC entrelaçado (field)",
    "NTSC entrelaçado (frame)",
    "PAL entrelaçado (field)",
    "PAL entrelaçado (frame)",
    "PAL / NTSC-like 480i (field)",
    "PAL / NTSC-like 480i (frame)",
    "480p (DTV)",
    "576p (DTV)",
    "480p alternativo",
    "576p alternativo",
    "720p",
    "1080i (field)",
    "1080i (frame)",
    "VGA 640×480 @60",
    "VGA 640×480 @72",
    "VGA 640×480 @75",
    "VGA 640×480 @85",
    "VGA 640×480 @60 entrelaçado (field)",
    "VGA 800×600 @56",
    "VGA 800×600 @60",
    "VGA 800×600 @72",
    "VGA 800×600 @75",
    "VGA 800×600 @85",
    "VGA 1024×768 @60",
    "VGA 1024×768 @70",
    "VGA 1024×768 @75",
    "VGA 1024×768 @85",
    "VGA 1280×1024 @60",
    "VGA 1280×1024 @75",
)


def gsm_modes_for_api() -> list[dict[str, int | str]]:
    """Lista para GET /api/library/gsm-modes (id -1 = GSM desligado no OPL)."""
    out: list[dict[str, int | str]] = [{"id": -1, "label": "GSM desligado (predefinição OPL)"}]
    for i, lab in enumerate(GSM_VMODE_LABELS):
        out.append({"id": i, "label": f"{i}: {lab}"})
    return out


def clamp_gsm_vmode(v: int | None) -> int:
    """-1 = off; 0..28 = modo GSM."""
    if v is None:
        return -1
    try:
        n = int(v)
    except (TypeError, ValueError):
        return -1
    if n < 0:
        return -1
    if n > len(GSM_VMODE_LABELS) - 1:
        return len(GSM_VMODE_LABELS) - 1
    return n


def _parse_cfg_file(path: str) -> tuple[list[str], dict[str, str]]:
    order: list[str] = []
    seen: set[str] = set()
    d: dict[str, str] = {}
    if not os.path.isfile(path):
        return order, d
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        for raw in f:
            line = raw.replace("\x00", "").strip().strip("\ufeff")
            if not line or line.startswith(";"):
                continue
            if "=" not in line:
                continue
            k, _, rest = line.partition("=")
            k = k.strip()
            v = rest.strip()
            if not k:
                continue
            if k not in seen:
                seen.add(k)
                order.append(k)
            d[k] = v
    return order, d


def _write_cfg_file(path: str, order: list[str], data: dict[str, str]) -> None:
    order_clean = [k for k in order if k not in _GSM_KEYS_SET]
    lines: list[str] = []
    for k in order_clean:
        if k in data:
            lines.append(f"{k}={data[k]}")
    for k in _GSM_KEYS_ORDER:
        if k in data:
            lines.append(f"{k}={data[k]}")
    body = "\r\n".join(lines) + ("\r\n" if lines else "")
    parent = os.path.dirname(os.path.abspath(path))
    if parent:
        os.makedirs(parent, exist_ok=True)
    with open(path, "wb") as f:
        f.write(body.encode("utf-8"))


def _apply_gsm_to_map(data: dict[str, str], gsm_vmode: int) -> None:
    xo = data.get("$GSMXOffset", "0")
    yo = data.get("$GSMYOffset", "0")
    ff = data.get("$GSMFIELDFix", "0")
    for k in _GSM_KEYS_SET:
        data.pop(k, None)
    data["$GSMSource"] = _GSM_SOURCE_USER
    if gsm_vmode < 0:
        data["$EnableGSM"] = "0"
        data["$GSMVMode"] = "0"
    else:
        data["$EnableGSM"] = "1"
        data["$GSMVMode"] = str(gsm_vmode)
        data["$GSMXOffset"] = xo
        data["$GSMYOffset"] = yo
        data["$GSMFIELDFix"] = ff


def game_cfg_path(iso_dir: str, gameid: str) -> str:
    return os.path.join(os.path.abspath(iso_dir), "CFG", f"{gameid}.cfg")


def write_game_cfg(iso_dir: str, gameid: str, gsm_vmode: int) -> str | None:
    """
    Cria ou actualiza CFG/<gameid>.cfg preservando outras chaves.
    Devolve caminho escrito ou None se gameid inválido.
    """
    gid = (gameid or "").strip()
    if not gid or ".." in gid or "/" in gid or "\\" in gid:
        return None
    path = game_cfg_path(iso_dir, gid)
    order, data = _parse_cfg_file(path)
    _apply_gsm_to_map(data, clamp_gsm_vmode(gsm_vmode))
    _write_cfg_file(path, order, data)
    return path


def rename_game_cfg_if_needed(iso_dir: str, old_gameid: str | None, new_gameid: str) -> None:
    """Se o ID mudar, renomeia CFG/old.cfg -> CFG/new.cfg."""
    old = (old_gameid or "").strip()
    new = (new_gameid or "").strip()
    if not old or not new or old.upper() == new.upper():
        return
    if ".." in old or ".." in new:
        return
    cfg_dir = os.path.join(os.path.abspath(iso_dir), "CFG")
    op = os.path.join(cfg_dir, f"{old}.cfg")
    np = os.path.join(cfg_dir, f"{new}.cfg")
    if not os.path.isfile(op):
        return
    if os.path.isfile(np):
        return
    try:
        os.replace(op, np)
    except OSError:
        pass
