"""
Monta a raiz do pendrive PS2: pastas “flat” do OPL + pasta OSDXMB/ completa (dash).

Layout na raiz do USB (mass0:/) — sem pasta OPL/:
  ART/ CFG/ CHT/ LNG/ THM/ VMC/   ← OPL usa isto na raiz do volume
  DVD/ CD/                         ← ISOs
  OSDXMB/                          ← cópia inteira do projeto (XMB, PLG, CFG do dash, APPS…)

O CWD do XMB fica mass0:/OSDXMB/ (InitCWD no main.js).

Uso (pasta server):
  python setup_opl_usb_pack.py --out E:\\
  python setup_opl_usb_pack.py --out D:\\PS2_USB --pc-ip 192.168.1.50
  OPL_SMB_* / OPL_CONF_PC_IP definem partilha e IP default do PC.
"""

from __future__ import annotations

import argparse
import os
import shutil
import sys

import opl_conf_network
import opl_conf_opl

_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# Fonte única do dash XMB (PLG, js, CFG…): pasta OSDXMB/ na raiz do repo — NÃO editar cópias em server/opl_usb_pack/.
_OSDXMB_SRC = os.path.join(_REPO_ROOT, "OSDXMB")
_ELF_SRC = os.path.join(_OSDXMB_SRC, "APPS", "OPL", "OPNPS2LD.ELF")

# Pastas do OPL na raiz do volume (não dentro de OPL/)
_OPL_FLAT_DIRS = ("ART", "CFG", "CHT", "LNG", "THM", "VMC")


def _mkdir(p: str) -> None:
    os.makedirs(p, exist_ok=True)


def _ignore_osdxmb_junk(_dir: str, names: list[str]) -> list[str]:
    skip = {"__pycache__", ".git"}
    return [n for n in names if n in skip or n.endswith(".pyc")]


def _write_opl_cfgs_at_usb_root(
    root: str,
    *,
    pc_ip: str,
    dhcp: bool,
    ps2_ip: str,
    ps2_mask: str,
    ps2_gw: str,
    ps2_dns: str | None,
    opl_autostart_seconds: int = 5,
    opl_remember_last: bool = True,
) -> None:
    """conf_opl.cfg + conf_network.cfg na raiz do volume (layout flat)."""
    try:
        net = opl_conf_network.build_conf_network_crlf(
            pc_ip,
            dhcp=dhcp,
            ps2_ip=ps2_ip,
            ps2_netmask=ps2_mask,
            ps2_gateway=ps2_gw,
            ps2_dns=ps2_dns,
        )
    except ValueError as e:
        print(f"Erro ao gerar conf_network.cfg: {e}", file=sys.stderr)
        sys.exit(1)
    ast = max(0, min(9, int(opl_autostart_seconds)))
    opl = opl_conf_opl.build_conf_opl_crlf(
        remember_last=1 if opl_remember_last else 0,
        autostart_last=ast if opl_remember_last else 0,
    )
    with open(os.path.join(root, "conf_opl.cfg"), "wb") as f:
        f.write(opl)
    with open(os.path.join(root, "conf_network.cfg"), "wb") as f:
        f.write(net)
    print(f"Gerados: {os.path.join(root, 'conf_opl.cfg')}")
    print(f"Gerados: {os.path.join(root, 'conf_network.cfg')}")


def build_ps2_usb_root(
    out_root: str,
    *,
    copy_osdxmb: bool,
    copy_elf_if_missing: bool,
    pc_ip: str,
    dhcp: bool,
    ps2_ip: str,
    ps2_mask: str,
    ps2_gw: str,
    ps2_dns: str | None,
    opl_autostart_seconds: int = 5,
    opl_remember_last: bool = True,
) -> None:
    root = os.path.abspath(out_root)

    for d in _OPL_FLAT_DIRS:
        _mkdir(os.path.join(root, d))
    _mkdir(os.path.join(root, "DVD"))
    _mkdir(os.path.join(root, "CD"))

    _write_opl_cfgs_at_usb_root(
        root,
        pc_ip=pc_ip,
        dhcp=dhcp,
        ps2_ip=ps2_ip,
        ps2_mask=ps2_mask,
        ps2_gw=ps2_gw,
        ps2_dns=ps2_dns,
        opl_autostart_seconds=opl_autostart_seconds,
        opl_remember_last=opl_remember_last,
    )

    if copy_osdxmb:
        if not os.path.isdir(_OSDXMB_SRC):
            print(f"Erro: pasta OSDXMB não encontrada: {_OSDXMB_SRC}", file=sys.stderr)
            sys.exit(1)
        dst_osdxmb = os.path.join(root, "OSDXMB")
        shutil.copytree(_OSDXMB_SRC, dst_osdxmb, dirs_exist_ok=True, ignore=_ignore_osdxmb_junk)
        print(f"Copiado: {_OSDXMB_SRC} -> {dst_osdxmb}")
    elif copy_elf_if_missing:
        opl_apps = os.path.join(root, "OSDXMB", "APPS", "OPL")
        _mkdir(opl_apps)
        dst_elf = os.path.join(opl_apps, "OPNPS2LD.ELF")
        if not os.path.isfile(dst_elf) and os.path.isfile(_ELF_SRC):
            shutil.copy2(_ELF_SRC, dst_elf)
            print(f"Copiado: {dst_elf}")

    marker = os.path.join(root, "LEIA-ME_USB.txt")
    with open(marker, "w", encoding="utf-8") as f:
        f.write(
            "Raiz do USB (FAT32):\n"
            "  conf_opl.cfg — ETH+USB em modo Auto, menu inicial = Jogos em rede (SMB),\n"
            "    remember_last + autostart_last (último jogo com contagem regressiva).\n"
            "  conf_network.cfg — smb_ip, partilha OPL_SMB_*, PS2 em DHCP por defeito.\n"
            "  ART CFG CHT LNG THM VMC  — OPL na raiz\n"
            "  DVD CD                  — ISOs\n"
            "  OSDXMB                  — dashboard XMB\n\n"
            "Ajuste o IP do PC em conf_network (smb_ip) se mudar a rede.\n"
            "Partilha/porta/user: alinhados a OPL_SMB_* ao correr o script.\n"
        )


def build_opl_only_flat(
    out_root: str,
    *,
    copy_elf: bool,
    pc_ip: str,
    dhcp: bool,
    ps2_ip: str,
    ps2_mask: str,
    ps2_gw: str,
    ps2_dns: str | None,
    opl_autostart_seconds: int = 5,
    opl_remember_last: bool = True,
) -> None:
    """Só raiz “OPL flat” + DVD/CD + APPS/OPL (sem OSDXMB)."""
    root = os.path.abspath(out_root)
    for d in _OPL_FLAT_DIRS:
        _mkdir(os.path.join(root, d))
    _mkdir(os.path.join(root, "DVD"))
    _mkdir(os.path.join(root, "CD"))
    _write_opl_cfgs_at_usb_root(
        root,
        pc_ip=pc_ip,
        dhcp=dhcp,
        ps2_ip=ps2_ip,
        ps2_mask=ps2_mask,
        ps2_gw=ps2_gw,
        ps2_dns=ps2_dns,
        opl_autostart_seconds=opl_autostart_seconds,
        opl_remember_last=opl_remember_last,
    )
    apps_opl = os.path.join(root, "APPS", "OPL")
    _mkdir(apps_opl)
    if copy_elf and os.path.isfile(_ELF_SRC):
        shutil.copy2(_ELF_SRC, os.path.join(apps_opl, "OPNPS2LD.ELF"))
        print(f"Copiado: {apps_opl}\\OPNPS2LD.ELF")
    elif copy_elf:
        print(f"Aviso: ELF não encontrado: {_ELF_SRC}", file=sys.stderr)


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Raiz USB: pastas OPL (flat) + OSDXMB/ completa.",
    )
    ap.add_argument(
        "--out",
        default=os.path.join(os.path.dirname(__file__), "opl_usb_pack"),
        help="Destino = raiz simulada do pendrive (default: server/opl_usb_pack)",
    )
    ap.add_argument(
        "--layout",
        choices=("ps2-usb", "opl-only"),
        default="ps2-usb",
        help="ps2-usb = flat OPL + OSDXMB inteiro. opl-only = flat + APPS/OPL sem copiar dash.",
    )
    ap.add_argument(
        "--skip-osdxmb",
        action="store_true",
        help="Não copiar OSDXMB/ (só ART…VMC, DVD, CD). Útil para atualizar só pastas OPL.",
    )
    ap.add_argument(
        "--copy-elf",
        action="store_true",
        help="Com --skip-osdxmb: cria OSDXMB/APPS/OPL e copia OPNPS2LD.ELF.",
    )
    ap.add_argument(
        "--pc-ip",
        default=os.environ.get("OPL_CONF_PC_IP") or "192.168.0.140",
        help="IPv4 do PC (servidor SMB) em conf_network.cfg (ou env OPL_CONF_PC_IP)",
    )
    ap.add_argument(
        "--static-ps2",
        action="store_true",
        help="PS2 com IP estático nos .cfg (default: DHCP)",
    )
    ap.add_argument("--ps2-ip", default="192.168.0.10")
    ap.add_argument("--ps2-mask", default="255.255.255.0")
    ap.add_argument("--ps2-gw", default="192.168.0.1")
    ap.add_argument("--ps2-dns", default="", help="Vazio = igual ao gateway")
    ap.add_argument(
        "--opl-autostart-seconds",
        type=int,
        default=5,
        help="autostart_last no conf_opl (0–9 segundos; 0 = desliga contagem). Default: 5",
    )
    ap.add_argument(
        "--opl-no-remember",
        action="store_true",
        help="Desliga remember_last/autostart_last no conf_opl gerado.",
    )
    args = ap.parse_args()

    dhcp = not args.static_ps2
    ps2_dns = args.ps2_dns.strip() or None
    opl_remember = not args.opl_no_remember

    if args.layout == "opl-only":
        build_opl_only_flat(
            args.out,
            copy_elf=args.copy_elf,
            pc_ip=args.pc_ip,
            dhcp=dhcp,
            ps2_ip=args.ps2_ip,
            ps2_mask=args.ps2_mask,
            ps2_gw=args.ps2_gw,
            ps2_dns=ps2_dns,
            opl_autostart_seconds=args.opl_autostart_seconds,
            opl_remember_last=opl_remember,
        )
    else:
        build_ps2_usb_root(
            args.out,
            copy_osdxmb=not args.skip_osdxmb,
            copy_elf_if_missing=args.skip_osdxmb and args.copy_elf,
            pc_ip=args.pc_ip,
            dhcp=dhcp,
            ps2_ip=args.ps2_ip,
            ps2_mask=args.ps2_mask,
            ps2_gw=args.ps2_gw,
            ps2_dns=ps2_dns,
            opl_autostart_seconds=args.opl_autostart_seconds,
            opl_remember_last=opl_remember,
        )

    print(f"Pronto: {os.path.abspath(args.out)}")


if __name__ == "__main__":
    main()
