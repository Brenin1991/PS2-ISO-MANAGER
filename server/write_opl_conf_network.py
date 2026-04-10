"""
Escreve conf_network.cfg para pasta OPL na USB/MC (ou ficheiro à escolha).

Uso (na pasta server, com venv ativo):
  python write_opl_conf_network.py --pc-ip 192.168.0.140
  python write_opl_conf_network.py --pc-ip 192.168.0.140 --out D:\\OPL\\conf_network.cfg
  python write_opl_conf_network.py --pc-ip 192.168.0.140 --static --ps2-ip 192.168.0.20

SMB (share, user, pass, porta): mesmas variáveis que opl_smb_host.py (OPL_SMB_*).
"""

from __future__ import annotations

import argparse
import os
import sys

_BASE = os.path.dirname(os.path.abspath(__file__))
if _BASE not in sys.path:
    sys.path.insert(0, _BASE)

from opl_conf_network import build_conf_network_crlf


def main() -> None:
    p = argparse.ArgumentParser(description="Gera conf_network.cfg para OPL (SMB).")
    p.add_argument("--pc-ip", required=True, help="IPv4 do PC (servidor SMB), visto da PS2")
    p.add_argument(
        "--out",
        default=os.path.join(_BASE, "conf_network.cfg"),
        help="Caminho de saída (default: ./conf_network.cfg)",
    )
    p.add_argument("--static", action="store_true", help="IP estático na PS2 (sem DHCP; default é DHCP)")
    p.add_argument("--ps2-ip", default="192.168.0.10")
    p.add_argument("--ps2-mask", default="255.255.255.0")
    p.add_argument("--ps2-gw", default="192.168.0.1")
    p.add_argument("--ps2-dns", default=None, help="Default: igual ao gateway")
    args = p.parse_args()

    dhcp = not args.static
    data = build_conf_network_crlf(
        args.pc_ip,
        dhcp=dhcp,
        ps2_ip=args.ps2_ip,
        ps2_netmask=args.ps2_mask,
        ps2_gateway=args.ps2_gw,
        ps2_dns=args.ps2_dns,
    )
    out = os.path.abspath(args.out)
    out_dir = os.path.dirname(out)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    with open(out, "wb") as f:
        f.write(data)
    print(f"Escrito: {out}")
    print("Copie para a raiz do USB (mass0:/) ou para mass0:/OPL/ — o mesmo sítio que o conf_opl.cfg.")


if __name__ == "__main__":
    main()
