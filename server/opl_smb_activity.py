"""
Atividade SMB (Impacket SimpleSMBServer): deteta ligações TCP/SMB ao servidor OPL.

O impacket.smbserver regista mensagens do tipo:
  Incoming connection (192.168.x.x,port)
  Closing down connection (192.168.x.x,port)

Isto não garante autenticação ou tree-connect com sucesso, mas na PS2+OPL é um
sinal forte de que o cliente chegou ao SMB (firewall/porta/user corretos).

Uso: chamar attach_smb_activity_logging() antes de srv.start() (opl_smb_host.py).
Consulta: GET /opl/smb/activity no Flask (server.py).
"""

from __future__ import annotations

import logging
import re
import sys
import threading
import time
from typing import Any

_lock = threading.Lock()
_attached = False

_state: dict[str, Any] = {
    "tracking": False,
    "connections_total": 0,
    "disconnects_total": 0,
    "last_peer": None,
    "last_peer_port": None,
    "last_event": None,
    "last_event_ts": None,
    "last_connect_ts": None,
    "last_disconnect_ts": None,
    "recent": [],
}

_MAX_RECENT = 40
_RE_INCOMING = re.compile(r"Incoming connection \(([^,]+),(\d+)\)")
_RE_CLOSING = re.compile(r"Closing down connection \(([^,]+),(\d+)\)")
# Impacket smbComSessionSetupAndX (basic): %s com bytes ou SMB1 desalinhado → "User  2\opl"
_RE_BASIC_AUTH = re.compile(
    r"User\s*(.*?)\\(\S+)\s+authenticated successfully \(basic\)\s*\Z"
)
# Nome NetBIOS / workgroup plausível (15 chars); fora disto costuma ser lixo SMB1 do OPL.
_NETBIOS_LIKE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,14})$")


def _smb1_domain_looks_garbage(ds: str) -> bool:
    if not ds:
        return False
    s = ds.replace("\x00", "").strip()
    if not s:
        return False
    if len(s) <= 3:
        return True
    if " " in s:
        return True
    if re.fullmatch(r"[0-9\s]+", s):
        return True
    if _NETBIOS_LIKE.fullmatch(s):
        return False
    return True


class _ImpacketConsoleFilter(logging.Filter):
    """
    - Remove linhas tipo b'user'::b'dom':: (dump NTLM / John — ruído).
    - Corrige texto quando o domínio SMB1 vem lixo curto (re-ligação OPL).
    """

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            msg = record.getMessage()
        except Exception:
            return True
        # Dump interno do Impacket após autenticação basic
        if msg.startswith("b'") and "::b'" in msg:
            return False
        m = _RE_BASIC_AUTH.match(msg)
        if m:
            dom, user = m.group(1), m.group(2)
            ds = dom.replace("\x00", "").strip()
            if _smb1_domain_looks_garbage(ds):
                # Um só dígito (ex. OPL na 2.ª sessão) — mesmo ruído conhecido; linha idêntica à vazia.
                if len(ds) == 1 and ds.isdigit():
                    record.msg = f"User \\{user} authenticated successfully (basic)"
                else:
                    record.msg = (
                        f"User \\{user} authenticated successfully (basic) "
                        f"[SMB1 domain field raw={ds!r} — ignorado; auth OK]"
                    )
                record.args = ()
            elif not ds:
                record.msg = f"User \\{user} authenticated successfully (basic)"
                record.args = ()
        return True


def _push_recent(kind: str, peer: str, port: int) -> None:
    lst = _state["recent"]
    if not isinstance(lst, list):
        return
    lst.append(
        {
            "ts": time.time(),
            "kind": kind,
            "peer": peer,
            "port": port,
        }
    )
    if len(lst) > _MAX_RECENT:
        del lst[:-_MAX_RECENT]


class _SmbActivityHandler(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        try:
            msg = record.getMessage()
        except Exception:
            return
        m = _RE_INCOMING.search(msg)
        if m:
            peer, port_s = m.group(1).strip(), m.group(2)
            try:
                port = int(port_s)
            except ValueError:
                port = 0
            with _lock:
                _state["connections_total"] = int(_state["connections_total"]) + 1
                _state["last_peer"] = peer
                _state["last_peer_port"] = port
                _state["last_event"] = "connect"
                now = time.time()
                _state["last_event_ts"] = now
                _state["last_connect_ts"] = now
                _push_recent("connect", peer, port)
            return
        m = _RE_CLOSING.search(msg)
        if m:
            peer, port_s = m.group(1).strip(), m.group(2)
            try:
                port = int(port_s)
            except ValueError:
                port = 0
            with _lock:
                _state["disconnects_total"] = int(_state["disconnects_total"]) + 1
                _state["last_peer"] = peer
                _state["last_peer_port"] = port
                _state["last_event"] = "disconnect"
                now = time.time()
                _state["last_event_ts"] = now
                _state["last_disconnect_ts"] = now
                _push_recent("disconnect", peer, port)


def attach_smb_activity_logging() -> bool:
    """
    Regista handler no logger do Impacket (idempotente).
    Devolve True se acabou de anexar ou já estava anexado.
    """
    global _attached
    with _lock:
        if _attached:
            _state["tracking"] = True
            return True
        _attached = True
        lg = logging.getLogger("impacket.smbserver")
        lg.setLevel(logging.INFO)
        lg.addFilter(_ImpacketConsoleFilter())
        # Sem isto, o mesmo registo propaga para o root (Waitress/logging) e aparece em duplicado.
        lg.propagate = False
        sh = logging.StreamHandler(sys.stderr)
        sh.setLevel(logging.INFO)
        sh.setFormatter(logging.Formatter("%(levelname)s:%(name)s:%(message)s"))
        lg.addHandler(sh)
        h = _SmbActivityHandler()
        h.setLevel(logging.INFO)
        lg.addHandler(h)
        _state["tracking"] = True
    return True


def get_snapshot() -> dict[str, Any]:
    """Cópia segura para JSON (GET /opl/smb/activity)."""
    with _lock:
        recent = list(_state["recent"]) if isinstance(_state["recent"], list) else []
        return {
            "tracking": bool(_state.get("tracking")),
            "note": (
                "connect = cliente abriu sessão SMB (TCP). Não prova leitura de ISO; "
                "em OPL costuma ser o PS2 a ligar à partilha."
            ),
            "connections_total": int(_state.get("connections_total") or 0),
            "disconnects_total": int(_state.get("disconnects_total") or 0),
            "last_peer": _state.get("last_peer"),
            "last_peer_port": _state.get("last_peer_port"),
            "last_event": _state.get("last_event"),
            "last_event_ts": _state.get("last_event_ts"),
            "last_connect_ts": _state.get("last_connect_ts"),
            "last_disconnect_ts": _state.get("last_disconnect_ts"),
            "recent": recent,
        }
