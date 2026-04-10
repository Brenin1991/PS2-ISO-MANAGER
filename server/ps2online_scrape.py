# Scraping ps2online.com — usado pelo server.py (cache a cada 5 min).
from __future__ import annotations

import html as html_module
import re
import threading
import time
import urllib.error
import urllib.request

PS2ONLINE_URL = "https://ps2online.com/"
USER_AGENT = (
    "Mozilla/5.0 (compatible; OSD-XMB-PS2/1.0; +https://github.com/HiroTex/OSD-XMB)"
)

_row_re = re.compile(
    r"<tr[^>]*>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*</tr>",
    re.DOTALL | re.IGNORECASE,
)


def _strip_tags(fragment: str) -> str:
    t = re.sub(r"<[^>]+>", " ", fragment)
    t = re.sub(r"\s+", " ", t).strip()
    return html_module.unescape(t)


def _first_int(s: str) -> int:
    m = re.search(r"(\d+)", s)
    return int(m.group(1)) if m else 0


def parse_games_table(page_html: str):
    games = []
    start = page_html.find("<h1>Game</h1>")
    if start < 0:
        return games
    chunk = page_html[start : start + 120000]
    for m in _row_re.finditer(chunk):
        raw_name, c1, c2, c3 = m.group(1), m.group(2), m.group(3), m.group(4)
        name = _strip_tags(raw_name)
        if not name or name.lower() == "game":
            continue
        if name.lower() == "total" or name.startswith("Total"):
            continue

        t1, t2, t3 = _strip_tags(c1), _strip_tags(c2), _strip_tags(c3)
        online = _first_int(t1)
        rooms = _first_int(t2)
        logins = _first_int(t3)
        q1 = "?" in t1
        q2 = "?" in t2

        if online == 0 and rooms == 0:
            if logins > 0 or (q1 or q2):
                pass
            else:
                continue

        games.append(
            {
                "name": name[:200],
                "online": online,
                "rooms": rooms,
                "logins_last_hour": logins,
            }
        )

    games.sort(
        key=lambda g: (-(g["online"] + g["rooms"]), -g["logins_last_hour"], g["name"])
    )
    return games


def parse_activity_log(page_html: str):
    lines = []
    marker = "PlayStation 2 Online Log"
    idx = page_html.find(marker)
    if idx < 0:
        return lines
    chunk = page_html[idx : idx + 200000]
    body_end = chunk.find("</body>")
    if body_end > 0:
        chunk = chunk[:body_end]
    for m in re.finditer(
        r"(\d{1,2}:\d{2}:\d{2}\s*\|\|.+?)(?=\s*<hr\s*/?\s*>|</div>|</body>|$)",
        chunk,
        re.DOTALL | re.IGNORECASE,
    ):
        text = _strip_tags(m.group(1))
        if len(text) < 12 or "||" not in text:
            continue
        lines.append({"line": text[:600]})
    if not lines:
        for m in re.finditer(
            r"(\d{1,2}:\d{2}:\d{2}\s*\|\|[^\n\r<]+(?:<[^>]+>[^<\n]*)*)",
            chunk,
            re.IGNORECASE,
        ):
            text = _strip_tags(m.group(1))
            if len(text) < 12:
                continue
            lines.append({"line": text[:600]})
    out = []
    seen = set()
    for item in lines:
        k = item["line"][:200]
        if k in seen:
            continue
        seen.add(k)
        out.append(item)
    return out[:80]


def fetch_ps2online_html() -> str:
    req = urllib.request.Request(PS2ONLINE_URL, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=35) as resp:
        return resp.read().decode("utf-8", "replace")


_cache_lock = threading.Lock()
_cache_games = []
_cache_logs = []
_cache_updated: float = 0.0
_cache_error: str = ""


def refresh_ps2online_cache() -> None:
    global _cache_games, _cache_logs, _cache_updated, _cache_error
    try:
        html = fetch_ps2online_html()
        games = parse_games_table(html)
        logs = parse_activity_log(html)
        with _cache_lock:
            _cache_games = games
            _cache_logs = logs
            _cache_updated = time.time()
            _cache_error = ""
    except (urllib.error.URLError, OSError, ValueError) as e:
        with _cache_lock:
            _cache_error = str(e)


def get_cached_games():
    with _cache_lock:
        return list(_cache_games), _cache_updated, _cache_error


def get_cached_logs():
    with _cache_lock:
        return list(_cache_logs), _cache_updated, _cache_error


def start_ps2online_refresh_thread(interval_sec: int = 300) -> None:
    refresh_ps2online_cache()

    def loop() -> None:
        while True:
            time.sleep(interval_sec)
            refresh_ps2online_cache()

    t = threading.Thread(target=loop, daemon=True, name="ps2online-refresh")
    t.start()
