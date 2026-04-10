"""
Defaults OPL = ficheiros em `opl_cfg/` na raiz do repo (conf_opl, conf_network, conf_game, conf_last).

Formato CRLF ao gravar; o conteúdo base copia-se do template e só se substituem chaves dinâmicas.
"""

from __future__ import annotations

import os

_SERVER_DIR = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.normpath(os.path.join(_SERVER_DIR, ".."))
OPL_CFG_DIR = os.path.join(_REPO_ROOT, "opl_cfg")


def opl_cfg_template_path(name: str) -> str:
    return os.path.join(OPL_CFG_DIR, name)


def read_template_text(name: str) -> str:
    path = opl_cfg_template_path(name)
    if not os.path.isfile(path):
        raise FileNotFoundError(
            f"Template OPL em falta: {path} (esperada pasta opl_cfg/ na raiz do repo)."
        )
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        return f.read()


def _lines_to_crlf_bytes(lines: list[str]) -> bytes:
    return ("\r\n".join(lines) + "\r\n").encode("utf-8")


def parse_cfg_keyed_lines(text: str) -> tuple[list[str], dict[str, str]]:
    """Ordem das chaves como no ficheiro; valores sem strip à direita do '=' (preserva vazio)."""
    order: list[str] = []
    d: dict[str, str] = {}
    for raw in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, sep, v = line.partition("=")
        k = k.strip()
        if not k:
            continue
        order.append(k)
        d[k] = v
    return order, d


def build_conf_opl_from_template_crlf(
    *,
    remember_last: int = 1,
    autostart_last: int = 3,
) -> bytes:
    """Base: opl_cfg/conf_opl.cfg; ajusta remember_last e autostart_last (0–9)."""
    text = read_template_text("conf_opl.cfg")
    order, d = parse_cfg_keyed_lines(text)
    ast = max(0, min(9, int(autostart_last)))
    rem = 1 if int(remember_last) else 0
    d["remember_last"] = str(rem)
    d["autostart_last"] = str(ast if rem else 0)
    lines_out = [f"{k}={d[k]}" for k in order if k in d]
    return _lines_to_crlf_bytes(lines_out)


def build_conf_network_from_template_crlf(
    pc_ip: str,
    *,
    dhcp: bool = True,
    ps2_ip: str = "192.168.0.10",
    ps2_netmask: str = "255.255.255.0",
    ps2_gateway: str = "192.168.0.1",
    ps2_dns: str | None = None,
    eth_linkmode: int | None = None,
    smb_port: int | None = None,
    smb_share: str | None = None,
    smb_user: str | None = None,
    smb_pass: str | None = None,
) -> bytes:
    """Base: opl_cfg/conf_network.cfg; substitui IP/credenciais."""
    import re

    import opl_smb_env

    def _v4(label: str, s: str) -> str:
        s = s.strip()
        if not re.fullmatch(r"(\d{1,3}\.){3}\d{1,3}", s):
            raise ValueError(f"{label} inválido: {s!r} (esperado IPv4)")
        parts = [int(x) for x in s.split(".")]
        if any(p < 0 or p > 255 for p in parts):
            raise ValueError(f"{label} fora do intervalo: {s!r}")
        return s

    pc_ip = _v4("pc_ip", pc_ip)
    ps2_ip = _v4("ps2_ip", ps2_ip)
    ps2_netmask = _v4("ps2_netmask", ps2_netmask)
    ps2_gateway = _v4("ps2_gateway", ps2_gateway)
    dns = ps2_dns if ps2_dns else ps2_gateway
    dns = _v4("ps2_dns", dns)

    text = read_template_text("conf_network.cfg")
    order, d = parse_cfg_keyed_lines(text)

    port = smb_port if smb_port is not None else opl_smb_env.opl_smb_port_int()
    share = (smb_share if smb_share is not None else os.environ.get("OPL_SMB_SHARE") or "PS2ISO").strip()[:31]
    user = (smb_user if smb_user is not None else os.environ.get("OPL_SMB_USER") or "opl").strip()[:31]
    if smb_pass is not None:
        pwd = str(smb_pass)[:31]
    else:
        ev = os.environ.get("OPL_SMB_PASS")
        pwd = "" if ev is None else str(ev)[:31]

    d["smb_ip"] = pc_ip
    d["smb_port"] = str(int(port))
    d["smb_share"] = share
    d["smb_user"] = user
    d["smb_pass"] = pwd
    d["ps2_ip_use_dhcp"] = "1" if dhcp else "0"
    d["ps2_ip_addr"] = ps2_ip
    d["ps2_netmask"] = ps2_netmask
    d["ps2_gateway"] = ps2_gateway
    d["ps2_dns"] = dns
    if eth_linkmode is not None:
        d["eth_linkmode"] = str(int(eth_linkmode))

    lines_out = [f"{k}={d[k]}" for k in order if k in d]
    return _lines_to_crlf_bytes(lines_out)
