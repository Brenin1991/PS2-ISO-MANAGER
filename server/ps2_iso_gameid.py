from __future__ import annotations

import re
import struct
from typing import BinaryIO

_SECTOR = 2048
_CODE_RE = re.compile(rb"([A-Z]{4}[-_][0-9]{3}\.[0-9]{2})")


def normalize_ps2_product_code(raw: str) -> str:
    s = (raw or "").strip().upper()
    m = re.match(r"^([A-Z]{4})[-_](\d{3})\.(\d{2})$", s)
    if m:
        return f"{m.group(1)}_{m.group(2)}.{m.group(3)}"
    return s


def _parse_system_cnf(data: bytes) -> str | None:
    text = data.decode("latin-1", errors="replace")
    for line in text.splitlines():
        if "BOOT2" not in line.upper():
            continue
        m = _CODE_RE.search(line.upper().encode("latin-1", errors="ignore"))
        if m:
            return normalize_ps2_product_code(m.group(1).decode("ascii", errors="ignore"))
    return None


def _iter_iso9660_dir_records(data: bytes):
    i = 0
    n = len(data)
    while i < n:
        reclen = data[i]
        if reclen == 0:
            i = ((i // _SECTOR) + 1) * _SECTOR
            if i >= n:
                break
            continue
        if i + reclen > n:
            break
        yield data[i : i + reclen]
        i += reclen


def _dr_extent(rec: bytes) -> tuple[int, int] | None:
    if len(rec) < 33:
        return None
    return struct.unpack_from("<I", rec, 2)[0], struct.unpack_from("<I", rec, 10)[0]


def _dr_is_dir(rec: bytes) -> bool:
    return len(rec) > 25 and (rec[25] & 0x02) != 0


def _dr_name(rec: bytes) -> str:
    if len(rec) < 34:
        return ""
    nl = rec[32]
    return rec[33 : 33 + nl].decode("ascii", errors="replace")


def _find_system_cnf_extent(f: BinaryIO, dir_data: bytes, depth: int = 0) -> tuple[int, int] | None:
    if depth > 3:
        return None
    for rec in _iter_iso9660_dir_records(dir_data):
        if rec[0] < 33:
            continue
        name = _dr_name(rec).split(";")[0].strip().upper()
        if name in ("", ".", "..", "\x00", "\x01"):
            continue
        ext = _dr_extent(rec)
        if not ext:
            continue
        lba, size = ext
        if _dr_is_dir(rec):
            f.seek(lba * _SECTOR)
            sub = f.read(size)
            hit = _find_system_cnf_extent(f, sub, depth + 1)
            if hit:
                return hit
            continue
        if name == "SYSTEM.CNF":
            return lba, size
    return None


def _extract_via_pvd(f: BinaryIO) -> str | None:
    f.seek(16 * _SECTOR)
    pvd = f.read(_SECTOR)
    if len(pvd) < 190 or pvd[1:6] != b"CD001":
        return None
    dr = pvd[156 : 156 + 34]
    if len(dr) < 34 or dr[0] < 34:
        return None
    lba = struct.unpack_from("<I", dr, 2)[0]
    dsize = struct.unpack_from("<I", dr, 10)[0]
    f.seek(lba * _SECTOR)
    root = f.read(dsize)
    hit = _find_system_cnf_extent(f, root, 0)
    if not hit:
        return None
    clba, csize = hit
    f.seek(clba * _SECTOR)
    cnf = f.read(min(csize, 65536))
    return _parse_system_cnf(cnf)


def _fallback_scan(f: BinaryIO, max_bytes: int = 32 * 1024 * 1024) -> str | None:
    f.seek(0)
    data = f.read(max_bytes)
    idx = 0
    while True:
        j = data.find(b"BOOT2", idx)
        if j < 0:
            break
        chunk = data[j : j + 280]
        m = _CODE_RE.search(chunk.upper())
        if m:
            return normalize_ps2_product_code(m.group(1).decode("ascii", errors="ignore"))
        idx = j + 5
    m = _CODE_RE.search(data[: min(len(data), 8 * 1024 * 1024)])
    if m:
        return normalize_ps2_product_code(m.group(1).decode("ascii", errors="ignore"))
    return None


def extract_ps2_product_code_from_iso(path: str) -> str | None:
    try:
        with open(path, "rb") as f:
            gid = _extract_via_pvd(f)
            if gid:
                return gid
            return _fallback_scan(f)
    except OSError:
        return None
