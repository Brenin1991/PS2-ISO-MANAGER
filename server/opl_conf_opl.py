"""
Gera `conf_opl.cfg` mínimo do OPL (chaves = include/config.h CONFIG_OPL_*).

eth_mode / usb_mode (START_MODE): 0=off, 1=manual, 2=auto — Auto liga a stack ao abrir o OPL.
default_device: ETH_MODE=5 (IO_MODES) = menu inicial “Jogos em rede” (SMB).

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
    usb_mode: int = _START_AUTO,
    hdd_mode: int = _START_DISABLED,
    app_mode: int = _START_DISABLED,
    bdm_cache: int = 16,
    smb_cache: int = 16,
    scrolling: int = 1,
    autosort: int = 1,
    autorefresh: int = 0,
    remember_last: int = 1,
    autostart_last: int = 5,
) -> bytes:
    """
    Linhas key=value com CRLF (igual ao configWrite do OPL).

    default_device=ETH_MODE (5): menu inicial = jogos em rede (SMB).
    eth/usb_mode=2 (AUTO): liga stack ao abrir o OPL — não é preciso ir ao separador ETH/USB à mão.
    remember_last + autostart_last: último jogo arranca sozinho após contagem (quando conf_last existe).
    """
    lines = [
        f"eth_mode={int(eth_mode)}",
        f"default_device={int(default_device)}",
        f"usb_mode={int(usb_mode)}",
        f"hdd_mode={int(hdd_mode)}",
        f"app_mode={int(app_mode)}",
        f"bdm_cache={int(bdm_cache)}",
        f"smb_cache={int(smb_cache)}",
        f"scrolling={int(scrolling)}",
        f"autosort={int(autosort)}",
        f"autorefresh={int(autorefresh)}",
        f"remember_last={int(remember_last)}",
        f"autostart_last={int(autostart_last)}",
    ]
    return ("\r\n".join(lines) + "\r\n").encode("utf-8")
