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
            release_date TEXT NOT NULL DEFAULT '',
            developers TEXT NOT NULL DEFAULT '',
            publisher TEXT NOT NULL DEFAULT '',
            max_players TEXT NOT NULL DEFAULT '',
            opl_gsm_vmode INTEGER NOT NULL DEFAULT -1,
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


def migrate_library_extra_columns(conn: sqlite3.Connection) -> None:
    """ALTER em bases antigas (colunas novas)."""
    cur = conn.execute("PRAGMA table_info(library_entry)")
    cols = {str(row[1]) for row in cur.fetchall()}
    alters = (
        ("release_date", "ALTER TABLE library_entry ADD COLUMN release_date TEXT NOT NULL DEFAULT ''"),
        ("developers", "ALTER TABLE library_entry ADD COLUMN developers TEXT NOT NULL DEFAULT ''"),
        ("publisher", "ALTER TABLE library_entry ADD COLUMN publisher TEXT NOT NULL DEFAULT ''"),
        ("max_players", "ALTER TABLE library_entry ADD COLUMN max_players TEXT NOT NULL DEFAULT ''"),
        ("opl_gsm_vmode", "ALTER TABLE library_entry ADD COLUMN opl_gsm_vmode INTEGER NOT NULL DEFAULT -1"),
    )
    for col, sql in alters:
        if col not in cols:
            conn.execute(sql)
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
        rd = (meta.get("release_date") or "").strip()[:64]
        dev = (meta.get("developers") or "").strip()[:2000]
        pub = (meta.get("publisher") or "").strip()[:512]
        mp = (meta.get("max_players") or "").strip()[:32]
        try:
            og = int(meta.get("opl_gsm_vmode", -1))
        except (TypeError, ValueError):
            og = -1
        conn.execute(
            """
            INSERT INTO library_entry(
                iso_relpath, name, gameid, description,
                release_date, developers, publisher, max_players, opl_gsm_vmode, updated_at
            )
            VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(iso_relpath) DO UPDATE SET
                name = excluded.name,
                gameid = excluded.gameid,
                description = excluded.description,
                release_date = excluded.release_date,
                developers = excluded.developers,
                publisher = excluded.publisher,
                max_players = excluded.max_players,
                opl_gsm_vmode = excluded.opl_gsm_vmode,
                updated_at = excluded.updated_at
            """,
            (rp, name, gameid, desc, rd, dev, pub, mp, og, now),
        )
        n += 1
    conn.commit()
    return n


def ensure_db(db_path: str, json_legacy_path: str | None) -> None:
    conn = connect(db_path)
    try:
        init_schema(conn)
        migrate_library_extra_columns(conn)
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
        migrate_library_extra_columns(conn)
        rows = conn.execute(
            """
            SELECT iso_relpath, name, gameid, description,
                   release_date, developers, publisher, max_players, opl_gsm_vmode
            FROM library_entry
            """
        ).fetchall()
        out: dict[str, dict[str, Any]] = {}
        for r in rows:
            try:
                og = int(r["opl_gsm_vmode"] if r["opl_gsm_vmode"] is not None else -1)
            except (TypeError, ValueError):
                og = -1
            out[str(r["iso_relpath"])] = {
                "name": r["name"] or "",
                "gameid": r["gameid"] or "",
                "description": r["description"] or "",
                "release_date": r["release_date"] or "",
                "developers": r["developers"] or "",
                "publisher": r["publisher"] or "",
                "max_players": r["max_players"] or "",
                "opl_gsm_vmode": og,
            }
        return out
    finally:
        conn.close()


def get_entry(db_path: str, iso_relpath: str) -> dict[str, Any] | None:
    """Metadados guardados para um ISO (caminho relativo a PS2_ISO_DIR)."""
    rp = iso_relpath.replace("\\", "/").strip()
    if not rp:
        return None
    conn = connect(db_path)
    try:
        migrate_library_extra_columns(conn)
        row = conn.execute(
            """
            SELECT iso_relpath, name, gameid, description,
                   release_date, developers, publisher, max_players, opl_gsm_vmode
            FROM library_entry WHERE iso_relpath = ?
            """,
            (rp,),
        ).fetchone()
        if not row:
            return None
        try:
            og = int(row["opl_gsm_vmode"] if row["opl_gsm_vmode"] is not None else -1)
        except (TypeError, ValueError):
            og = -1
        return {
            "iso_relpath": str(row["iso_relpath"]),
            "name": row["name"] or "",
            "gameid": row["gameid"] or "",
            "description": row["description"] or "",
            "release_date": row["release_date"] or "",
            "developers": row["developers"] or "",
            "publisher": row["publisher"] or "",
            "max_players": row["max_players"] or "",
            "opl_gsm_vmode": og,
        }
    finally:
        conn.close()


def upsert_entry(
    db_path: str,
    iso_relpath: str,
    *,
    name: str,
    gameid: str,
    description: str = "",
    release_date: str = "",
    developers: str = "",
    publisher: str = "",
    max_players: str = "",
    opl_gsm_vmode: int = -1,
) -> None:
    rp = iso_relpath.replace("\\", "/").strip()
    conn = connect(db_path)
    try:
        migrate_library_extra_columns(conn)
        conn.execute(
            """
            INSERT INTO library_entry(
                iso_relpath, name, gameid, description,
                release_date, developers, publisher, max_players, opl_gsm_vmode, updated_at
            )
            VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(iso_relpath) DO UPDATE SET
                name = excluded.name,
                gameid = excluded.gameid,
                description = excluded.description,
                release_date = excluded.release_date,
                developers = excluded.developers,
                publisher = excluded.publisher,
                max_players = excluded.max_players,
                opl_gsm_vmode = excluded.opl_gsm_vmode,
                updated_at = excluded.updated_at
            """,
            (
                rp,
                name,
                gameid,
                description[:8000],
                release_date[:64],
                developers[:2000],
                publisher[:512],
                max_players[:32],
                int(opl_gsm_vmode),
                time.time(),
            ),
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
