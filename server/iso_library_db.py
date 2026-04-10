"""
Biblioteca de metadados de ISOs em SQLite (substitui iso_library.json).

Migração automática: na primeira execução, importa iso_library.json se existir.
"""

from __future__ import annotations

import json
import os
import sqlite3
import time
from typing import Any

SCHEMA_VERSION = 1


def connect(db_path: str) -> sqlite3.Connection:
    parent = os.path.dirname(os.path.abspath(db_path))
    if parent:
        os.makedirs(parent, exist_ok=True)
    conn = sqlite3.connect(db_path, timeout=30)
    conn.row_factory = sqlite3.Row
    return conn


def init_schema(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY NOT NULL,
            value TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS library_entry (
            iso_relpath TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL DEFAULT '',
            gameid TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            updated_at REAL NOT NULL
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_library_gameid ON library_entry(gameid)")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS play_time_stats (
            iso_relpath TEXT PRIMARY KEY NOT NULL,
            total_seconds REAL NOT NULL DEFAULT 0,
            last_played_at REAL
        )
        """
    )
    conn.commit()


def _get_meta(conn: sqlite3.Connection, key: str) -> str | None:
    row = conn.execute("SELECT value FROM meta WHERE key = ?", (key,)).fetchone()
    return str(row[0]) if row else None


def _set_meta(conn: sqlite3.Connection, key: str, value: str) -> None:
    conn.execute(
        "INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )


def migrate_from_json(conn: sqlite3.Connection, json_path: str) -> int:
    """Importa iso_library.json para SQLite. Devolve número de linhas importadas."""
    if not os.path.isfile(json_path):
        return 0
    try:
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError, json.JSONDecodeError):
        return 0
    if not isinstance(data, dict) or not data:
        return 0
    n = 0
    now = time.time()
    for relpath, meta in data.items():
        if not isinstance(meta, dict):
            continue
        rp = str(relpath).replace("\\", "/").strip()
        if not rp:
            continue
        name = (meta.get("name") or "").strip()
        gameid = (meta.get("gameid") or "").strip()
        desc = (meta.get("description") or "").strip()
        conn.execute(
            """
            INSERT INTO library_entry(iso_relpath, name, gameid, description, updated_at)
            VALUES(?, ?, ?, ?, ?)
            ON CONFLICT(iso_relpath) DO UPDATE SET
                name = excluded.name,
                gameid = excluded.gameid,
                description = excluded.description,
                updated_at = excluded.updated_at
            """,
            (rp, name, gameid, desc, now),
        )
        n += 1
    conn.commit()
    return n


def ensure_db(db_path: str, json_legacy_path: str | None) -> None:
    conn = connect(db_path)
    try:
        init_schema(conn)
        ver = _get_meta(conn, "schema_version")
        if ver is None:
            _set_meta(conn, "schema_version", str(SCHEMA_VERSION))
            if json_legacy_path:
                count = conn.execute("SELECT COUNT(*) FROM library_entry").fetchone()[0]
                if count == 0:
                    imported = migrate_from_json(conn, json_legacy_path)
                    if imported > 0 and os.path.isfile(json_legacy_path):
                        try:
                            bak = json_legacy_path + ".migrated.bak"
                            if not os.path.isfile(bak):
                                os.replace(json_legacy_path, bak)
                        except OSError:
                            pass
            conn.commit()
    finally:
        conn.close()


def load_all_as_dict(db_path: str) -> dict[str, dict[str, Any]]:
    conn = connect(db_path)
    try:
        rows = conn.execute(
            "SELECT iso_relpath, name, gameid, description FROM library_entry"
        ).fetchall()
        out: dict[str, dict[str, Any]] = {}
        for r in rows:
            out[str(r["iso_relpath"])] = {
                "name": r["name"] or "",
                "gameid": r["gameid"] or "",
                "description": r["description"] or "",
            }
        return out
    finally:
        conn.close()


def upsert_entry(
    db_path: str,
    iso_relpath: str,
    *,
    name: str,
    gameid: str,
    description: str = "",
) -> None:
    rp = iso_relpath.replace("\\", "/").strip()
    conn = connect(db_path)
    try:
        conn.execute(
            """
            INSERT INTO library_entry(iso_relpath, name, gameid, description, updated_at)
            VALUES(?, ?, ?, ?, ?)
            ON CONFLICT(iso_relpath) DO UPDATE SET
                name = excluded.name,
                gameid = excluded.gameid,
                description = excluded.description,
                updated_at = excluded.updated_at
            """,
            (rp, name, gameid, description[:8000], time.time()),
        )
        conn.commit()
    finally:
        conn.close()


def find_display_name_by_gameid(db_path: str, gid: str) -> str | None:
    if not gid:
        return None
    conn = connect(db_path)
    try:
        row = conn.execute(
            "SELECT name FROM library_entry WHERE UPPER(TRIM(gameid)) = UPPER(TRIM(?)) AND LENGTH(TRIM(name)) > 0 LIMIT 1",
            (gid,),
        ).fetchone()
        return str(row[0]).strip() if row else None
    finally:
        conn.close()


def play_time_add_seconds(db_path: str, iso_relpath: str, seconds: float) -> None:
    if seconds <= 0:
        return
    rp = iso_relpath.replace("\\", "/").strip()
    if not rp:
        return
    now = time.time()
    conn = connect(db_path)
    try:
        conn.execute(
            """
            INSERT INTO play_time_stats(iso_relpath, total_seconds, last_played_at)
            VALUES(?, ?, ?)
            ON CONFLICT(iso_relpath) DO UPDATE SET
                total_seconds = play_time_stats.total_seconds + excluded.total_seconds,
                last_played_at = excluded.last_played_at
            """,
            (rp, float(seconds), now),
        )
        conn.commit()
    finally:
        conn.close()


def play_time_totals_map(db_path: str) -> dict[str, float]:
    conn = connect(db_path)
    try:
        rows = conn.execute("SELECT iso_relpath, total_seconds FROM play_time_stats").fetchall()
        return {str(r["iso_relpath"]): float(r["total_seconds"] or 0) for r in rows}
    finally:
        conn.close()
