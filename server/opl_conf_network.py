"""
Gera `conf_network.cfg` do Open PS2 Loader (OPL) — mesmo formato que o menu Rede grava.

Chaves (ps2homebrew/Open-PS2-Loader, include/config.h + src/config.c):
  smb_ip, smb_port, smb_share, smb_user, smb_pass,
  smb_share_use_nbns (0=IP), smb_share_nb_addr,
  ps2_ip_use_dhcp, ps2_ip_addr, ps2_netmask, ps2_gateway, ps2_dns, eth_linkmode

Copiar para a mesma pasta que o OPL usa para conf_opl.cfg (ex.: raiz do USB
sem pasta OPL: mass0:/conf_network.cfg; ou mass0:/OPL/ se a tua build usar).
"""

from __future__ import annotations

import os
import re

import opl_smb_env

# ETH_OP_MODE_AUTO (include/opl.h)
_ETH_LINKMODE_AUTO = 0


def _validate_ipv4(label: str, s: str) -> str:
    s = s.strip()
    if not re.fullmatch(r"(\d{1,3}\.){3}\d{1,3}", s):
        raise ValueError(f"{label} inválido: {s!r} (esperado IPv4)")
    parts = [int(x) for x in s.split(".")]
    if any(p < 0 or p > 255 for p in parts):
        raise ValueError(f"{label} fora do intervalo: {s!r}")
    return s


def build_conf_network_crlf(
    pc_ip: str,
    *,
    dhcp: bool = True,
    ps2_ip: str = "192.168.0.10",
    ps2_netmask: str = "255.255.255.0",
    ps2_gateway: str = "192.168.0.1",
    ps2_dns: str | None = None,
    eth_linkmode: int = _ETH_LINKMODE_AUTO,
) -> bytes:
    """Devolve o .cfg completo em bytes (CRLF), pronto a gravar."""
    pc_ip = _validate_ipv4("pc_ip", pc_ip)
    ps2_ip = _validate_ipv4("ps2_ip", ps2_ip)
    ps2_netmask = _validate_ipv4("ps2_netmask", ps2_netmask)
    ps2_gateway = _validate_ipv4("ps2_gateway", ps2_gateway)
    dns = ps2_dns if ps2_dns else ps2_gateway
    dns = _validate_ipv4("ps2_dns", dns)

    # Limites alinhados com gPCShareName / gPCUserName / gPCPassword no OPL (32 chars).
    share = (os.environ.get("OPL_SMB_SHARE") or "PS2ISO").strip()[:31]
    user = (os.environ.get("OPL_SMB_USER") or "opl").strip()[:31]
    pwd = os.environ.get("OPL_SMB_PASS")
    if pwd is None:
        pwd = "oplopl"
    pwd = str(pwd)[:31]
    port = opl_smb_env.opl_smb_port_int()

    lines = [
        f"eth_linkmode={int(eth_linkmode)}",
        f"ps2_ip_use_dhcp={1 if dhcp else 0}",
        "smb_share_nb_addr=",
        "smb_share_use_nbns=0",
        f"smb_ip={pc_ip}",
        f"smb_port={port}",
        f"smb_share={share}",
        f"smb_user={user}",
        f"smb_pass={pwd}",
        f"ps2_ip_addr={ps2_ip}",
        f"ps2_netmask={ps2_netmask}",
        f"ps2_gateway={ps2_gateway}",
        f"ps2_dns={dns}",
    ]
    return ("\r\n".join(lines) + "\r\n").encode("utf-8")
