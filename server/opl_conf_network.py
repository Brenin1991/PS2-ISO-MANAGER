"""
Gera `conf_network.cfg` a partir de `opl_cfg/conf_network.cfg` (mesma ordem e chaves).

Substitui smb_ip, porta, partilha, user, pass e endereços PS2; o resto vem do template.
"""

from __future__ import annotations

from opl_cfg_defaults import build_conf_network_from_template_crlf


def build_conf_network_crlf(
    pc_ip: str,
    *,
    dhcp: bool = True,
    ps2_ip: str = "192.168.0.10",
    ps2_netmask: str = "255.255.255.0",
    ps2_gateway: str = "192.168.0.1",
    ps2_dns: str | None = None,
    eth_linkmode: int = 0,
) -> bytes:
    return build_conf_network_from_template_crlf(
        pc_ip,
        dhcp=dhcp,
        ps2_ip=ps2_ip,
        ps2_netmask=ps2_netmask,
        ps2_gateway=ps2_gateway,
        ps2_dns=ps2_dns,
        eth_linkmode=eth_linkmode,
    )
