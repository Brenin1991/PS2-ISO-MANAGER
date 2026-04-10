"""
Anfitrião OPL + SMB + Flask (uma janela de terminal).

- Sobe o mesmo Flask que server.py (lista /list, admin, /udpbd/prepare, …).
- Arranca SMB via Impacket SimpleSMBServer na pasta PS2_ISO_DIR (Impacket ≥0.11;
  o script examples/smbserver.py foi removido no 0.13 — usamos a API em thread).
- O wheel PyPI do impacket 0.13.x por vezes não inclui impacket/krb5/crypto.py;
  este script descarrega-o automaticamente (tag impacket_0_13_0) se faltar.

Requisitos:
  python -m pip install -r requirements-opl-smb.txt

conf OPL sem menu: python write_opl_conf_network.py --pc-ip <IP_DO_PC>
  ou no browser: http://<PC>:5000/opl/conf_network.cfg?pc_ip=<IP_DO_PC>

Windows: a porta TCP 445 costuma dar WinError 10013 (reservada ao SMB do sistema).
  Sem OPL_SMB_PORT definida, o default neste projeto é 4445 no Windows; no OPL
  indique a mesma porta. Para usar 445: PowerShell como Administrador e/ou
  desative "Partilha de ficheiros" ou defina OPL_SMB_PORT=445 explicitamente.

Variáveis de ambiente (opcional):
  OPL_SMB_SHARE   — nome da partilha (default PS2ISO)
  OPL_SMB_USER    — utilizador (default opl)
  OPL_SMB_PASS    — password (default oplopl); vazio = sem credencial (acesso anónimo)
  OPL_SMB_PORT    — porta TCP (default 445 Linux/macOS; 4445 Windows se não definido)
  OPL_SMB_BIND    — IP a escutar (default 0.0.0.0)
  OPL_SMB2        — 1/true para SMB2 (OPL recente); por defeito só SMB1 (melhor em SCPH-30xxx / OPL antigo)
  PS2_ISO_DIR     — pasta dos ISOs (igual ao Flask)
"""

from __future__ import annotations

import atexit
import os
import sys
import threading
import time

import opl_smb_env

_BASE = os.path.dirname(os.path.abspath(__file__))
if _BASE not in sys.path:
    sys.path.insert(0, _BASE)

# Mesmo default que server.py
_ISO_DIR = os.environ.get("PS2_ISO_DIR", os.path.join(_BASE, "isos"))
os.makedirs(_ISO_DIR, exist_ok=True)
os.environ.setdefault("PS2_ISO_DIR", _ISO_DIR)

_smb_server_holder: dict = {}
_smb_thread_started = False
_smb_atexit_registered = False
_start_smb_lock = threading.Lock()

# Wheel impacket==0.13.0 no PyPI pode vir sem krb5/crypto.py (import smb falha).
_IMPACKET_KRB5_CRYPTO_URL = (
    "https://raw.githubusercontent.com/fortra/impacket/impacket_0_13_0/impacket/krb5/crypto.py"
)
_MIN_KRB5_CRYPTO_BYTES = 800


def _ensure_impacket_krb5_crypto() -> None:
    try:
        import impacket.krb5 as krb5_pkg
    except ImportError:
        return
    crypto_path = os.path.join(os.path.dirname(krb5_pkg.__file__), "crypto.py")
    if os.path.isfile(crypto_path) and os.path.getsize(crypto_path) >= _MIN_KRB5_CRYPTO_BYTES:
        return
    try:
        from urllib.request import urlopen
    except ImportError:
        return
    try:
        with urlopen(_IMPACKET_KRB5_CRYPTO_URL, timeout=30) as r:
            data = r.read()
    except Exception as e:
        print(
            f"[OPL-SMB] impacket.krb5.crypto em falta e download falhou: {e}",
            file=sys.stderr,
            flush=True,
        )
        return
    if len(data) < _MIN_KRB5_CRYPTO_BYTES:
        print("[OPL-SMB] Download de crypto.py inválido (ficheiro pequeno demais).", file=sys.stderr, flush=True)
        return
    try:
        with open(crypto_path, "wb") as f:
            f.write(data)
        print("[OPL-SMB] Corrigido wheel Impacket: escrito impacket/krb5/crypto.py", flush=True)
    except OSError as e:
        print(f"[OPL-SMB] Não foi possível escrever crypto.py: {e}", file=sys.stderr, flush=True)


def _stop_smb() -> None:
    srv = _smb_server_holder.get("srv")
    if srv is None:
        return
    try:
        srv.stop()
    except Exception:
        pass


def _smb_thread_main() -> None:
    try:
        from binascii import hexlify

        from impacket.ntlm import compute_lmhash, compute_nthash
        from impacket.smbserver import SimpleSMBServer
    except ImportError as e:
        print(
            f"[OPL-SMB] Impacket incompleto ({e}). Instale: python -m pip install impacket",
            file=sys.stderr,
            flush=True,
        )
        return

    share = (os.environ.get("OPL_SMB_SHARE") or "PS2ISO").strip()
    user = (os.environ.get("OPL_SMB_USER") or "opl").strip()
    pwd = os.environ.get("OPL_SMB_PASS")
    if pwd is None:
        pwd = "oplopl"
    bind = (os.environ.get("OPL_SMB_BIND") or "0.0.0.0").strip()
    smb2 = opl_smb_env.opl_smb2_enabled()

    port = opl_smb_env.opl_smb_port_int()

    iso_path = os.path.abspath(_ISO_DIR)

    try:
        import play_time_tracker
        import smb_iso_hooks

        play_time_tracker.configure(iso_path, os.path.join(_BASE, "iso_library.db"))
        smb_iso_hooks.install_smb_iso_read_hooks()
    except Exception as e:
        print(f"[OPL-SMB] Hooks tempo de jogo (SMB): {e}", file=sys.stderr, flush=True)

    # Impacket copia referências aos handlers no __init__ do SimpleSMBServer;
    # patches às classes têm de existir *antes* de instanciar o servidor.
    try:
        import impacket_opl_smb_patch

        impacket_opl_smb_patch.apply_trans2_find_next2_opl_fix()
        print(
            "[OPL-SMB] Patch Impacket: TRANS2 FIND_NEXT2 (listagem SMB1; corrige OPL preso a carregar).",
            flush=True,
        )
    except Exception as e:
        print(f"[OPL-SMB] Patch FIND_NEXT2: {e}", file=sys.stderr, flush=True)
    if smb2:
        try:
            import impacket_opl_smb_patch

            impacket_opl_smb_patch.apply_smb2_negotiate_opl_fix()
            print(
                "[OPL-SMB] Patch Impacket: NEGOTIATE SMB2 compatível com OPL (dialectos SMB1).",
                flush=True,
            )
        except Exception as e:
            print(f"[OPL-SMB] Patch OPL negotiate: {e}", file=sys.stderr, flush=True)

    try:
        srv = SimpleSMBServer(listenAddress=bind, listenPort=port)
    except OSError as e:
        win10013 = sys.platform == "win32" and getattr(e, "winerror", None) == 10013
        print(f"[OPL-SMB] SMB não iniciou: {e}", file=sys.stderr, flush=True)
        if win10013 or port == 445:
            print(
                "[OPL-SMB] Dica: em Windows a porta 445 é bloqueada na maioria dos PCs. "
                "Não defina OPL_SMB_PORT (usa 4445 por defeito) ou use: $env:OPL_SMB_PORT='4445'",
                file=sys.stderr,
                flush=True,
            )
        return
    except Exception as e:
        print(f"[OPL-SMB] SMB não iniciou: {e}", file=sys.stderr, flush=True)
        return

    try:
        srv.addShare(share, iso_path, shareComment="PS2 ISOs", readOnly="yes")
        if pwd:
            lm = hexlify(compute_lmhash(pwd)).decode()
            nt = hexlify(compute_nthash(pwd)).decode()
            srv.addCredential(user, 0, lm, nt)
        srv.setSMB2Support(smb2)
    except Exception as e:
        print(f"[OPL-SMB] SMB config falhou: {e}", file=sys.stderr, flush=True)
        try:
            srv.stop()
        except Exception:
            pass
        return

    _smb_server_holder["srv"] = srv
    print(
        f"[OPL-SMB] SMB Impacket: share={share!r} path={iso_path!r} bind={bind!r} port={port} smb2={smb2}",
        flush=True,
    )
    if smb2:
        print(
            "[OPL-SMB] SMB2 ativo. Sem login na PS2 antiga? Defina OPL_SMB2=0 (só SMB1) ou desative SMB2 no cliente.",
            flush=True,
        )
    else:
        print(
            "[OPL-SMB] SMB1 apenas. OPL recente a precisar de SMB2: OPL_SMB2=1 ou ative SMB2 no cliente.",
            flush=True,
        )
    try:
        n_root = sum(
            1
            for n in os.listdir(iso_path)
            if n.lower().endswith(".iso") and os.path.isfile(os.path.join(iso_path, n))
        )
        dvd_p = os.path.join(iso_path, "DVD")
        n_dvd = 0
        if os.path.isdir(dvd_p):
            n_dvd = sum(
                1
                for n in os.listdir(dvd_p)
                if n.lower().endswith(".iso") and os.path.isfile(os.path.join(dvd_p, n))
            )
        print(
            f"[OPL-SMB] ISOs na partilha: {n_root} na raiz, {n_dvd} em DVD/. "
            "No OPL: Games > SMB > (partilha) > pasta DVD.",
            flush=True,
        )
        if n_root == 0 and n_dvd == 0:
            print("[OPL-SMB] Aviso: nenhum .iso — lista vazia. Mete ficheiros .iso em server/isos/DVD/ (ou na raiz).", flush=True)
    except OSError as e:
        print(f"[OPL-SMB] Aviso: não foi possível listar ISOs: {e}", flush=True)
    try:
        import opl_smb_activity

        opl_smb_activity.attach_smb_activity_logging()
    except Exception as e:
        print(f"[OPL-SMB] SMB activity tracking: {e}", file=sys.stderr, flush=True)
    try:
        srv.start()
    except Exception as e:
        print(f"[OPL-SMB] SMB terminou: {e}", file=sys.stderr, flush=True)


def _start_smb_thread() -> None:
    global _smb_thread_started, _smb_atexit_registered
    with _start_smb_lock:
        if _smb_thread_started:
            return
        _smb_thread_started = True
        th = threading.Thread(target=_smb_thread_main, name="impacket-smb", daemon=True)
        th.start()
        if not _smb_atexit_registered:
            atexit.register(_stop_smb)
            _smb_atexit_registered = True
    time.sleep(0.4)


def main() -> None:
    _ensure_impacket_krb5_crypto()
    _start_smb_thread()

    try:
        from waitress import serve
    except ImportError:
        print("Instale: python -m pip install waitress", file=sys.stderr)
        sys.exit(1)

    import server

    threads = int(os.environ.get("WAITRESS_THREADS", "16"))
    body_limit = int(
        os.environ.get(
            "WAITRESS_MAX_REQUEST_BODY_SIZE",
            os.environ.get("MAX_UPLOAD_BYTES", str(10 * 1024 * 1024 * 1024)),
        )
    )
    host = os.environ.get("FLASK_HOST", "0.0.0.0")
    port = int(os.environ.get("FLASK_PORT", "5000"))
    print(
        f"[OPL-SMB] Flask: http://{host}:{port}/  |  OPL: SMB //<IP_PC>/{os.environ.get('OPL_SMB_SHARE', 'PS2ISO')}",
        flush=True,
    )
    serve(server.app, host=host, port=port, threads=threads, max_request_body_size=body_limit)


if __name__ == "__main__":
    main()
