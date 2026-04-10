"""Defaults partilhados OPL+SMB (opl_smb_host.py e rota /opl/smb)."""

from __future__ import annotations

import os
import sys


def opl_smb_port_int() -> int:
    """Porta SMB: OPL_SMB_PORT se definida; senão 4445 no Windows (445 costuma dar WinError 10013), 445 noutros SO."""
    raw = os.environ.get("OPL_SMB_PORT")
    if raw is not None and str(raw).strip() != "":
        try:
            return int(str(raw).strip())
        except ValueError:
            pass
    return 4445 if sys.platform == "win32" else 445


def opl_smb2_enabled() -> bool:
    """
    SMB2 no servidor Impacket.

    Por defeito False (SMB1): compatível com OPL em consolas antigas (ex. SCPH-30xxx),
    onde o fluxo SMB2 costuma falhar antes do login (reconexões em ciclo).

    Ativar SMB2: OPL_SMB2=1 / true / on / smb2 (útil em builds OPL recentes que precisam de SMB2).
    Desativar explicitamente: OPL_SMB2=0 / false / off / no / smb1 / legacy.
    """
    raw = os.environ.get("OPL_SMB2")
    if raw is None or str(raw).strip() == "":
        return False
    s = str(raw).strip().lower()
    if s in ("0", "false", "off", "no", "smb1", "legacy"):
        return False
    return s in ("1", "true", "yes", "on", "smb2")
