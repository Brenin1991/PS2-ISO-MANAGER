"""
Gera `conf_opl.cfg` mínimo do OPL (chaves = include/config.h CONFIG_OPL_*).

eth_mode (iosupport.h START_MODE): 0=desligado, 1=manual, 2=auto.
  Auto (2) faz o OPL iniciar a stack SMB ao abrir — não é preciso ir ao separador ETH primeiro.
default_device: ETH_MODE=5 na enum IO_MODES (BDM=0..4, ETH=5, HDD=6, APP=7).

remember_last / autostart_last: no OPL, “lembrar último jogo” e contagem para arrancar sozinho
(só o *último* jogo jogado; o XMB não pode dizer qual ISO abrir — o OPL não usa argv para SMB).
"""

from __future__ import annotations

# iosupport.h — START_MODE
_START_DISABLED = 0
_START_MANUAL = 1
_START_AUTO = 2
# IO_MODES — ETH_MODE = 5
_ETH_MODE = 5


def build_conf_opl_crlf(
    *,
    eth_mode: int = _START_AUTO,
    default_device: int = _ETH_MODE,
    smb_cache: int = 16,
    scrolling: int = 1,
    autosort: int = 1,
    autorefresh: int = 0,
    remember_last: int = 0,
    autostart_last: int = 0,
) -> bytes:
    """Linhas key=value com CRLF (igual ao configWrite do OPL)."""
    lines = [
        f"eth_mode={int(eth_mode)}",
        f"default_device={int(default_device)}",
        f"smb_cache={int(smb_cache)}",
        f"scrolling={int(scrolling)}",
        f"autosort={int(autosort)}",
        f"autorefresh={int(autorefresh)}",
        f"remember_last={int(remember_last)}",
        f"autostart_last={int(autostart_last)}",
    ]
    return ("\r\n".join(lines) + "\r\n").encode("utf-8")
