from __future__ import annotations

import os
import re
import shutil
import tempfile

# Por defeito o Flask só serve HTTP (lista, arte, prepare=validação). udpfs_server corre à parte.
# Para o Flask voltar a subir/matar o processo UDP: UDPBD_MANAGED=1
os.environ.setdefault("UDPBD_MANAGED", "0")

from flask import (
    Flask,
    Response,
    abort,
    jsonify,
    redirect,
    render_template,
    request,
    send_file,
    url_for,
)
from flask_cors import CORS

import iso_library_db
import play_time_tracker
import opl_conf_network
import opl_smb_env
import ps2_iso_gameid
import ps2online_scrape
import udpbd_service

# Caminho absoluto: com `python server.py`, __name__ é __main__ e o Flask pode não achar templates/.
_BASE = os.path.dirname(os.path.abspath(__file__))
# UDPBD: mesmo efeito que UDPBD_VERBOSE=1 no ambiente (ficheiro vazio opcional nesta pasta).
if os.path.isfile(os.path.join(_BASE, "UDPBD_VERBOSE")):
    os.environ.setdefault("UDPBD_VERBOSE", "1")
app = Flask(__name__, template_folder=os.path.join(_BASE, "templates"))
# Upload ISO grande: até 10 GiB (pode ser ajustado por env).
_MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_BYTES", str(10 * 1024 * 1024 * 1024)))
app.config["MAX_CONTENT_LENGTH"] = _MAX_UPLOAD_BYTES
CORS(
    app,
    resources={
        r"/api/*": {"origins": "*"},
        r"/list": {"origins": "*"},
        r"/opl/*": {"origins": "*"},
        r"/art/*": {"origins": "*"},
    },
)

# Atualiza cache ps2online.com a cada 5 minutos (thread em background).
ps2online_scrape.start_ps2online_refresh_thread(300)

# Pasta dos ISOs: variável de ambiente PS2_ISO_DIR ou pasta "isos" ao lado deste ficheiro
ISO_DIR = os.environ.get("PS2_ISO_DIR", os.path.join(_BASE, "isos"))
os.makedirs(ISO_DIR, exist_ok=True)
os.environ.setdefault("PS2_ISO_DIR", ISO_DIR)
# Layout OPL USB: ISOs em DVD/ ou CD/ dentro da mesma pasta (ou na raiz).
for _opl_sub in ("DVD", "CD"):
    try:
        os.makedirs(os.path.join(ISO_DIR, _opl_sub), exist_ok=True)
    except OSError:
        pass
# Com UDPBD_MANAGED=1: AUTOSTART pode arrancar udpfs_server -d (ver udpbd_service).
udpbd_service.maybe_autostart_with_iso_dir(ISO_DIR)

LIBRARY_JSON_LEGACY = os.path.join(_BASE, "iso_library.json")
LIBRARY_DB_PATH = os.path.join(_BASE, "iso_library.db")
COVERS_DIR = os.path.join(_BASE, "iso_covers")
os.makedirs(COVERS_DIR, exist_ok=True)
ART_DATA_DIR = os.path.join(_BASE, "iso_art")
os.makedirs(ART_DATA_DIR, exist_ok=True)
iso_library_db.ensure_db(LIBRARY_DB_PATH, LIBRARY_JSON_LEGACY)
play_time_tracker.configure(ISO_DIR, LIBRARY_DB_PATH)

_ART_NAMES = ("icon0.png", "pic1.png", "pic2.png")
_PNG_DPI = (72, 72)

try:
    from PIL import Image

    _HAS_PIL = True
except ImportError:
    Image = None  # type: ignore[misc, assignment]
    _HAS_PIL = False


def _pil_resample():
    if not _HAS_PIL:
        return 1
    if hasattr(Image, "Resampling"):
        return Image.Resampling.LANCZOS
    return Image.LANCZOS


def _convert_icon0_png(src: str, dest: str) -> None:
    """ICON0: 128x128, 72 dpi, 32-bit RGBA PNG."""
    im = Image.open(src)
    im = im.convert("RGBA")
    im = im.resize((128, 128), _pil_resample())
    im.save(dest, "PNG", dpi=_PNG_DPI)


def _convert_pic1_png(src: str, dest: str) -> None:
    """PIC1: 640x480, 72 dpi, 8-bit (paleta indexada) PNG."""
    filt = _pil_resample()
    im = Image.open(src).convert("RGB")
    im = im.resize((640, 480), filt)
    try:
        im = im.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
    except (AttributeError, TypeError, ValueError):
        im = im.quantize(colors=256)
    im.save(dest, "PNG", dpi=_PNG_DPI)


def _convert_pic2_png(src: str, dest: str) -> None:
    """PIC2: 310x250, 72 dpi, 32-bit RGBA PNG."""
    im = Image.open(src).convert("RGBA")
    im = im.resize((310, 250), _pil_resample())
    im.save(dest, "PNG", dpi=_PNG_DPI)


def _convert_cover_ui_png(src: str, dest: str) -> None:
    """Capa para a UI do cliente: até 480×360, proporção preservada, PNG."""
    if not _HAS_PIL:
        shutil.copy2(src, dest)
        return
    im = Image.open(src).convert("RGBA")
    im.thumbnail((480, 360), _pil_resample())
    im.save(dest, "PNG", dpi=_PNG_DPI)


def _convert_art_upload_to_dest(src: str, dest: str, kind: str) -> None:
    """
    kind: icon0 | pic1 | pic2
    Sem Pillow: copia o ficheiro original (instala: pip install Pillow).
    """
    if not _HAS_PIL:
        shutil.copy2(src, dest)
        return
    if kind == "icon0":
        _convert_icon0_png(src, dest)
    elif kind == "pic1":
        _convert_pic1_png(src, dest)
    elif kind == "pic2":
        _convert_pic2_png(src, dest)
    else:
        shutil.copy2(src, dest)


def load_library() -> dict:
    """Metadados da biblioteca (SQLite). Formato compatível com o antigo JSON por chave."""
    return iso_library_db.load_all_as_dict(LIBRARY_DB_PATH)


def _safe_gameid(gid: str) -> str | None:
    if not gid or ".." in gid:
        return None
    gid = gid.strip()
    if len(gid) < 4 or len(gid) > 40:
        return None
    if not re.match(r"^[A-Za-z0-9._\-]+$", gid):
        return None
    return gid


def _guess_display_name_from_iso_filename(filename: str) -> str:
    base = os.path.splitext(os.path.basename(filename or ""))[0]
    # Remove prefixo de código no início (ex: SLUS_203.12_...)
    base = re.sub(r"^[A-Za-z]{4}[-_]\d{3}\.\d{2}[_\-. ]*", "", base)
    base = base.replace("_", " ").replace(".", " ")
    base = re.sub(r"\s+", " ", base).strip(" -_")
    return base or "Jogo"


def _find_display_name_by_gameid(gid: str) -> str | None:
    return iso_library_db.find_display_name_by_gameid(LIBRARY_DB_PATH, gid)


def _cover_png_path(gameid: str) -> str | None:
    gid = _safe_gameid(gameid)
    if not gid:
        return None
    p = os.path.join(COVERS_DIR, gid, "cover.png")
    return p if os.path.isfile(p) else None


def _art_folder_has_files(gameid: str) -> bool:
    if not gameid:
        return False
    root = os.path.join(ART_DATA_DIR, gameid)
    if not os.path.isdir(root):
        return False
    for n in _ART_NAMES:
        p = os.path.join(root, n)
        if os.path.isfile(p):
            return True
    return False


def _slug_for_iso_filename(display_name: str, max_len: int = 96) -> str:
    """Parte do nome do ficheiro a partir do nome de exibição (sem path, seguro no Windows)."""
    s = (display_name or "").strip()
    if not s:
        return "game"
    s = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", s)
    s = re.sub(r"\s+", "_", s)
    s = re.sub(r"_+", "_", s).strip("._-")
    if not s:
        return "game"
    return s[:max_len]


def _iso_filename_from_gameid_and_name(gameid: str, display_name: str) -> str:
    """Nome guardado na pasta isos/: codigo_nome.iso (alinhado ao uso no XMB)."""
    slug = _slug_for_iso_filename(display_name)
    base = f"{gameid}_{slug}.iso"
    if len(base) > 220:
        room = max(1, 220 - len(gameid) - 6)
        slug = _slug_for_iso_filename(display_name, max_len=room)
        base = f"{gameid}_{slug}.iso"
    if ".." in base or os.path.sep in base or (os.path.altsep and os.path.altsep in base):
        return ""
    return base


def _library_row(f: str, lib: dict, play_totals: dict[str, float] | None = None) -> dict:
    fp = os.path.join(ISO_DIR, *f.replace("\\", "/").split("/"))
    try:
        sz = os.path.getsize(fp)
    except OSError:
        sz = 0
    raw = lib.get(f)
    meta = raw if isinstance(raw, dict) else {}
    name = meta.get("name") or os.path.splitext(os.path.basename(f))[0]
    gameid = meta.get("gameid") or ""
    desc = (meta.get("description") or "").strip()
    has_art = _art_folder_has_files(gameid)
    cpath = _cover_png_path(gameid)
    has_cover = cpath is not None
    cover_url = f"/api/library/cover/{gameid}" if has_cover else ""
    fnorm = f.replace("\\", "/")
    play_sec = 0.0
    if play_totals:
        play_sec = float(play_totals.get(fnorm, 0) or 0)
    return {
        "name": name,
        "file": fnorm,
        "size": sz,
        "gameid": gameid,
        "has_art": has_art,
        "description": desc,
        "has_cover": has_cover,
        "cover_url": cover_url,
        "play_seconds_total": round(play_sec, 1),
    }


def _iter_iso_relpaths() -> list[str]:
    """Caminhos relativos a ISO_DIR: ficheiro.iso, DVD/x.iso, CD/x.iso (layout OPL)."""
    out: list[str] = []
    real_root = os.path.realpath(ISO_DIR)

    def scan_dir(rel_prefix: str, abs_dir: str) -> None:
        try:
            names = os.listdir(abs_dir)
        except OSError:
            return
        for f in names:
            if not f.lower().endswith(".iso"):
                continue
            fp = os.path.join(abs_dir, f)
            if not os.path.isfile(fp):
                continue
            try:
                real_fp = os.path.realpath(fp)
            except OSError:
                continue
            if not (real_fp.startswith(real_root + os.sep) and real_fp != real_root):
                continue
            rel = f"{rel_prefix}{f}".replace("\\", "/") if rel_prefix else f.replace("\\", "/")
            out.append(rel)

    scan_dir("", ISO_DIR)
    scan_dir("DVD/", os.path.join(ISO_DIR, "DVD"))
    scan_dir("CD/", os.path.join(ISO_DIR, "CD"))
    return out


def _resolve_iso_path(filename: str) -> str | None:
    """
    Caminho seguro para um .iso dentro de ISO_DIR (raiz, DVD/… ou CD/…).
    `file` na lista JSON usa barras normais (ex.: DVD/Jogo.iso).
    """
    if not filename:
        return None
    rel = filename.replace("\\", "/").strip().lstrip("/")
    if not rel or ".." in rel:
        return None
    parts = [p for p in rel.split("/") if p and p != "."]
    if not parts:
        return None
    if not parts[-1].lower().endswith(".iso"):
        return None
    for p in parts:
        if p == "..":
            return None
    fp = os.path.join(ISO_DIR, *parts)
    real_root = os.path.realpath(ISO_DIR)
    try:
        real_fp = os.path.realpath(fp)
    except OSError:
        return None
    if not (real_fp.startswith(real_root + os.sep) and real_fp != real_root):
        return None
    if os.path.isfile(real_fp):
        return real_fp
    parent = os.path.dirname(fp)
    base_want = parts[-1]
    try:
        for f in os.listdir(parent):
            if f.lower() == base_want.lower() and f.lower().endswith(".iso"):
                cand = os.path.join(parent, f)
                if os.path.isfile(cand):
                    return os.path.realpath(cand)
    except OSError:
        pass
    return None

@app.route("/")
def root_redirect():
    return redirect(url_for("iso_admin_page"))


@app.route("/list")
def list_isos():
    lib = load_library()
    totals = iso_library_db.play_time_totals_map(LIBRARY_DB_PATH)
    files = sorted(_iter_iso_relpaths())
    out = [_library_row(f, lib, totals) for f in files]
    return jsonify(out)


def _process_iso_admin_save(req) -> tuple[str | None, str | None, str | None]:
    """Multipart igual a iso_admin_save. Devolve (erro, iso_name, gameid_final)."""
    gameid_raw = (req.form.get("gameid") or "").strip()
    gameid = _safe_gameid(gameid_raw) if gameid_raw else None
    display_name = (req.form.get("display_name") or "").strip()
    description = (req.form.get("description") or "").strip()[:8000]
    existing = (req.form.get("existing_iso") or "").strip()
    iso_up = req.files.get("iso")

    if not display_name:
        return "nome obrigatório", None, None

    iso_name: str | None = None
    iso_src_path: str | None = None
    tmp_upload_path: str | None = None
    if existing:
        existing_n = existing.replace("\\", "/").strip()
        iso_src_path = _resolve_iso_path(existing_n)
        if not existing_n.lower().endswith(".iso") or not iso_src_path:
            return "ISO inválida", None, None
        iso_name = existing_n
    elif iso_up and iso_up.filename:
        fd, tmp_upload_path = tempfile.mkstemp(suffix=".iso", dir=ISO_DIR)
        os.close(fd)
        iso_up.save(tmp_upload_path)
        iso_src_path = tmp_upload_path
    else:
        return "envie um ISO novo ou escolha um já na pasta", None, None

    if not gameid and iso_src_path:
        extracted = ps2_iso_gameid.extract_ps2_product_code_from_iso(iso_src_path)
        if extracted:
            gameid = _safe_gameid(extracted)
    if not gameid:
        if tmp_upload_path and os.path.isfile(tmp_upload_path):
            try:
                os.remove(tmp_upload_path)
            except OSError:
                pass
        return "gameid em falta e não foi possível detetar no ISO", None, None

    if tmp_upload_path:
        iso_name = _iso_filename_from_gameid_and_name(gameid, display_name)
        if not iso_name or not iso_name.lower().endswith(".iso"):
            return "nome de ficheiro ISO inválido", None, None
        dest = os.path.join(ISO_DIR, iso_name)
        if os.path.exists(dest):
            try:
                os.remove(tmp_upload_path)
            except OSError:
                pass
            return "já existe uma ISO com esse nome (código + nome)", None, None
        os.replace(tmp_upload_path, dest)

    iso_library_db.upsert_entry(
        LIBRARY_DB_PATH,
        iso_name,
        name=display_name,
        gameid=gameid,
        description=description,
    )

    cover_up = req.files.get("cover")
    if cover_up and cover_up.filename and gameid:
        ext = os.path.splitext(cover_up.filename)[1] or ".png"
        fd, tmp_cov = tempfile.mkstemp(suffix=ext)
        os.close(fd)
        try:
            cover_up.save(tmp_cov)
            croot = os.path.join(COVERS_DIR, gameid)
            os.makedirs(croot, exist_ok=True)
            _convert_cover_ui_png(tmp_cov, os.path.join(croot, "cover.png"))
        finally:
            try:
                os.remove(tmp_cov)
            except OSError:
                pass

    art_root = os.path.join(ART_DATA_DIR, gameid)
    os.makedirs(art_root, exist_ok=True)
    for field, destname, kind in (
        ("icon0", "icon0.png", "icon0"),
        ("pic1", "pic1.png", "pic1"),
        ("pic2", "pic2.png", "pic2"),
    ):
        up = req.files.get(field)
        if not up or not up.filename:
            continue
        ext = os.path.splitext(up.filename)[1] or ".png"
        fd, tmp = tempfile.mkstemp(suffix=ext)
        os.close(fd)
        try:
            up.save(tmp)
            dest = os.path.join(art_root, destname)
            _convert_art_upload_to_dest(tmp, dest, kind)
        finally:
            try:
                os.remove(tmp)
            except OSError:
                pass

    return None, iso_name, gameid


@app.get("/api/health")
def api_health():
    return jsonify(ok=True, iso_dir=ISO_DIR)


@app.get("/api/paths")
def api_paths():
    return jsonify(
        iso_dir=ISO_DIR,
        art_dir=ART_DATA_DIR,
        library_db=LIBRARY_DB_PATH,
        covers_dir=COVERS_DIR,
        templates_admin=url_for("iso_admin_page", _external=False),
    )


@app.get("/api/library")
def api_library():
    lib = load_library()
    totals = iso_library_db.play_time_totals_map(LIBRARY_DB_PATH)
    files = sorted(_iter_iso_relpaths())
    out = [_library_row(f, lib, totals) for f in files]
    return jsonify(out)


@app.get("/api/play/status")
def api_play_status():
    return jsonify(play_time_tracker.get_snapshot())


def _play_report_key_ok() -> bool:
    want = (os.environ.get("OSDXMB_REPORT_KEY") or "").strip()
    if not want:
        return True
    got = (request.args.get("key") or request.headers.get("X-Osdxmb-Key") or "").strip()
    if not got and request.is_json:
        j = request.get_json(silent=True) or {}
        if isinstance(j, dict):
            got = str(j.get("key") or "").strip()
    return got == want


@app.route("/api/play/report", methods=["GET", "POST", "OPTIONS"])
def api_play_report():
    """XMB/OSDXMB: GET com ?iso=DVD/jogo.iso&name=&gameid= (ou POST JSON). Opcional ?key= se OSDXMB_REPORT_KEY."""
    if request.method == "OPTIONS":
        return Response(status=204)
    if not _play_report_key_ok():
        return jsonify(ok=False, error="chave inválida"), 403

    clear_v = request.args.get("state") or request.args.get("clear")
    if request.method == "POST":
        j = request.get_json(silent=True)
        if isinstance(j, dict):
            clear_v = clear_v or j.get("state") or j.get("clear")
    clear = str(clear_v or "").lower() in ("1", "true", "yes", "clear", "idle", "stop")
    if clear:
        ok, err = play_time_tracker.report_from_xmb("", clear=True)
        if not ok:
            return jsonify(ok=False, error=err), 400
        return jsonify(ok=True)

    iso = (request.args.get("iso") or request.form.get("iso") or "").strip()
    name = (request.args.get("name") or request.form.get("name") or "").strip()
    gameid = (request.args.get("gameid") or request.form.get("gameid") or "").strip()
    if request.method == "POST":
        j = request.get_json(silent=True)
        if isinstance(j, dict):
            iso = iso or str(j.get("iso") or "").strip()
            name = name or str(j.get("name") or "").strip()
            gameid = gameid or str(j.get("gameid") or "").strip()

    ok, err = play_time_tracker.report_from_xmb(iso, name=name, gameid=gameid, clear=False)
    if not ok:
        return jsonify(ok=False, error=err or "erro"), 400
    return jsonify(ok=True, iso=iso)


@app.post("/api/library/save")
def api_library_save():
    err, iso_name, gid_out = _process_iso_admin_save(request)
    if err:
        return jsonify(error=err), 400
    return jsonify(ok=True, file=iso_name, gameid=gid_out or "")


@app.get("/api/library/cover/<gameid>")
def api_library_cover(gameid: str):
    gid = _safe_gameid(gameid)
    if not gid:
        abort(400)
    fp = _cover_png_path(gid)
    if not fp:
        abort(404)
    real_root = os.path.realpath(COVERS_DIR)
    try:
        real_fp = os.path.realpath(fp)
    except OSError:
        abort(404)
    if not real_fp.startswith(real_root + os.sep) and real_fp != real_root:
        abort(404)
    return send_file(real_fp, max_age=0, mimetype="image/png")


@app.post("/api/library/inspect")
def api_library_inspect():
    iso_up = request.files.get("iso")
    if not iso_up or not iso_up.filename:
        return jsonify(error="envie o ficheiro iso"), 400
    if not iso_up.filename.lower().endswith(".iso"):
        return jsonify(error="ficheiro tem de ser .iso"), 400
    fd, tmp_path = tempfile.mkstemp(suffix=".iso", dir=ISO_DIR)
    os.close(fd)
    try:
        iso_up.save(tmp_path)
        ext = ps2_iso_gameid.extract_ps2_product_code_from_iso(tmp_path)
        gid = _safe_gameid(ext) if ext else None
        disp = ""
        if gid:
            disp = _find_display_name_by_gameid(gid) or ""
        if not disp:
            disp = _guess_display_name_from_iso_filename(iso_up.filename or "")
        return jsonify(gameid=gid or "", display_name=disp)
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass


@app.route("/opl/smb")
def opl_smb_info():
    """Credenciais e nome da partilha para configurar OPL (SMB). O mesmo ISO_DIR do /list."""
    port = opl_smb_env.opl_smb_port_int()
    if "OPL_SMB_PASS" in os.environ:
        smb_pass = os.environ["OPL_SMB_PASS"]
    else:
        smb_pass = "oplopl"
    return jsonify(
        {
            "share": (os.environ.get("OPL_SMB_SHARE") or "PS2ISO").strip(),
            "username": (os.environ.get("OPL_SMB_USER") or "opl").strip(),
            "password": smb_pass,
            "port": port,
            "iso_dir": ISO_DIR,
            "smb2": opl_smb_env.opl_smb2_enabled(),
            "hint": "No OPL: New SMB share — Address = IP deste PC; Share name = share; user/pass acima; porta = campo acima (Windows default aqui costuma ser 4445).",
            "opl_paths": "ISOs na raiz da partilha ou em DVD/ e CD/ (mesma pasta que PS2_ISO_DIR — layout OPL USB).",
            "checklist": (
                "1) smb_port no conf_network.cfg do OPL = este servidor (ex. 4445 no Windows). "
                "2) SMB1 por defeito no servidor; SMB2 só se OPL_SMB2=1 (consolas antigas: SMB1). "
                "3) Jogos em PS2ISO/DVD/*.iso (ou raiz). No menu: Games > SMB > PS2ISO > DVD. "
                "4) Firewall: TCP porta SMB aberta. "
                "5) Lista a carregar para sempre: confirme pasta DVD no OPL; use opl_smb_host com patch FIND_NEXT2; "
                "ISO com nome simples (ASCII), .iso minúsculas. "
                "6) O XMB não abre o ISO direto: o OPL não usa argv SMB. Rede ao abrir OPL: eth_mode=2 no conf_opl (defeito do setup_opl_usb_pack) "
                "ou ETH Automatic nas definições. Arranque automático só do último jogo: remember_last + autostart_last no OPL."
            ),
            "activity_url": "/opl/smb/activity",
        }
    )


@app.get("/opl/smb/activity")
def opl_smb_activity():
    """
    Ligações ao SMB Impacket (opl_smb_host.py): contadores e último IP.
    Só é populado quando o servidor SMB está a correr com attach_smb_activity_logging().
    """
    import opl_smb_activity as smb_act

    return jsonify(smb_act.get_snapshot())


@app.route("/opl/conf_network.cfg")
def opl_conf_network_download():
    """Gera conf_network.cfg (OPL) sem abrir o menu — gravar em mass0:/OPL/ ou mc0:/OPL/."""
    pc_ip = (request.args.get("pc_ip") or os.environ.get("OPL_CONF_PC_IP") or "").strip()
    if not pc_ip:
        return jsonify(
            {
                "error": "pc_ip obrigatório (query ?pc_ip=192.168.x.x ou env OPL_CONF_PC_IP).",
                "example": "/opl/conf_network.cfg?pc_ip=192.168.0.140",
            }
        ), 400
    dhcp = request.args.get("ps2_dhcp", "1").strip().lower() not in ("0", "false", "no", "off")
    ps2_ip = (request.args.get("ps2_ip") or "192.168.0.10").strip()
    ps2_mask = (request.args.get("ps2_mask") or "255.255.255.0").strip()
    ps2_gw = (request.args.get("ps2_gw") or "192.168.0.1").strip()
    ps2_dns = (request.args.get("ps2_dns") or "").strip() or None
    try:
        body = opl_conf_network.build_conf_network_crlf(
            pc_ip,
            dhcp=dhcp,
            ps2_ip=ps2_ip,
            ps2_netmask=ps2_mask,
            ps2_gateway=ps2_gw,
            ps2_dns=ps2_dns,
        )
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    return Response(
        body,
        mimetype="text/plain; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="conf_network.cfg"'},
    )


@app.route("/admin", strict_slashes=False)
def iso_admin_page():
    lib = load_library()
    totals = iso_library_db.play_time_totals_map(LIBRARY_DB_PATH)
    files = sorted(_iter_iso_relpaths())
    rows = [_library_row(f, lib, totals) for f in files]
    return render_template("iso_admin.html", rows=rows, existing_files=sorted(files))


@app.route("/admin/save", methods=["POST"])
def iso_admin_save():
    err, _iso_name, _gid = _process_iso_admin_save(request)
    if err:
        return err, 400
    return redirect(url_for("iso_admin_page"))


@app.route("/art/<gameid>/<path:filename>")
def serve_net_art(gameid, filename):
    gid = _safe_gameid(gameid)
    if not gid:
        abort(400)
    fn = os.path.basename(filename).lower()
    if fn not in _ART_NAMES:
        abort(404)
    fp = os.path.join(ART_DATA_DIR, gid, fn)
    real_root = os.path.realpath(ART_DATA_DIR)
    try:
        real_fp = os.path.realpath(fp)
    except OSError:
        abort(404)
    if not real_fp.startswith(real_root + os.sep) and real_fp != real_root:
        abort(404)
    if not os.path.isfile(real_fp):
        abort(404)
    return send_file(real_fp, max_age=0, mimetype="image/png")

@app.route("/download/<path:filename>")
def download_iso(filename):
    """Envio com suporte a Range (HTTP 206) para downloads por segmentos no cliente (NET_ISO_HTTP_CHUNK_BYTES)."""
    fp = _resolve_iso_path(filename)
    if not fp:
        abort(404)
    try:
        play_time_tracker.touch_iso_relpath(filename.replace("\\", "/"), 0)
    except Exception:
        pass
    dl_name = os.path.basename(fp)
    try:
        return send_file(
            fp,
            mimetype="application/octet-stream",
            as_attachment=True,
            download_name=dl_name,
            max_age=0,
            chunk_size=1024 * 1024,
            conditional=True,
        )
    except TypeError:
        return send_file(
            fp,
            mimetype="application/octet-stream",
            as_attachment=True,
            download_name=dl_name,
            max_age=0,
            conditional=True,
        )


# Leituras em blocos (streaming); 1 MiB reduz syscalls e acelera em PC/emulador vs 256 KiB.
_SEGMENT_READ_CHUNK = 1024 * 1024


@app.route("/size/<path:filename>")
def iso_file_size(filename):
    """Tamanho real no disco (corrige lista JSON desatualizada — evita último segmento curto à toa)."""
    fp = _resolve_iso_path(filename)
    if not fp:
        abort(404)
    try:
        sz = os.path.getsize(fp)
    except OSError:
        abort(404)
    return jsonify({"size": int(sz)})


@app.route("/download_segment/<path:filename>")
def download_segment(filename):
    """Envia só um intervalo de bytes (vários pedidos curtos — a PS2 costuma parar ~50–60 MB num único GET)."""
    fp = _resolve_iso_path(filename)
    if not fp:
        abort(404)
    offset = request.args.get("offset", default=0, type=int)
    length = request.args.get("length", type=int)
    if length is None or length < 1:
        abort(400)
    try:
        sz = os.path.getsize(fp)
    except OSError:
        abort(404)
    if offset < 0 or offset >= sz:
        abort(416)
    end = min(offset + length, sz)
    to_read = end - offset
    try:
        play_time_tracker.touch_iso_relpath(filename.replace("\\", "/"), to_read)
    except Exception:
        pass

    def generate():
        remaining = to_read
        with open(fp, "rb") as f:
            f.seek(offset)
            while remaining > 0:
                n = min(_SEGMENT_READ_CHUNK, remaining)
                chunk = f.read(n)
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    return Response(
        generate(),
        mimetype="application/octet-stream",
        headers={
            "Content-Length": str(to_read),
            "Cache-Control": "no-store",
        },
    )


@app.route("/ps2online/games")
def ps2online_games():
    games, updated, err = ps2online_scrape.get_cached_games()
    return jsonify(
        {
            "games": games,
            "updated": int(updated) if updated else 0,
            "error": err,
        }
    )


@app.route("/ps2online/logs")
def ps2online_logs():
    lines, updated, err = ps2online_scrape.get_cached_logs()
    return jsonify(
        {
            "lines": lines,
            "updated": int(updated) if updated else 0,
            "error": err,
        }
    )


@app.route("/udpbd/prepare")
def udpbd_prepare():
    """
    Garante o udpfs_server: por defeito UDPFS (-d pasta, AUTOSTART no arranque do Flask).
    Bloco: UDPBD_NET_MODE=block (-b ISO); na PS2 netiso sem udpfs_net / udpfs_net=0.
    """
    fname = request.args.get("file", "")
    who = request.remote_addr or "?"
    print(f"[UDPBD] HTTP /udpbd/prepare client={who} file={fname!r}", flush=True)
    meta = udpbd_service.prepare_response_meta()
    fp = _resolve_iso_path(fname)
    if not fp:
        print(f"[UDPBD] HTTP → 404 ISO não resolvida ({fname!r})", flush=True)
        return jsonify({"ok": False, "error": "iso invalida ou inexistente", **meta}), 404
    ok, msg = udpbd_service.prepare_iso(fp)
    if not ok:
        print(f"[UDPBD] HTTP → 500 {msg!r}", flush=True)
        return jsonify({"ok": False, "error": msg, **meta}), 500
    st = udpbd_service.status()
    print(
        f"[UDPBD] HTTP → 200 OK iso={msg!r} mode={st.get('net_mode')} "
        f"pid={st.get('pid')} root={st.get('served_root')!r}",
        flush=True,
    )
    return jsonify({"ok": True, "file": os.path.basename(fp), "detail": msg, **meta})


@app.route("/udpbd/status")
def udpbd_status():
    st = udpbd_service.status()
    st["enable_env"] = os.environ.get("ENABLE_UDPBD", "1")
    if request.args.get("log") == "1":
        print(
            f"[UDPBD] HTTP /udpbd/status running={st.get('running')} pid={st.get('pid')} "
            f"mode={st.get('net_mode')} root={st.get('served_root')!r}",
            flush=True,
        )
    return jsonify(st)


if __name__ == "__main__":
    print(f"OSD-XMB: templates em {os.path.join(_BASE, 'templates')}")
    print("Abrir: http://127.0.0.1:5000/admin  (ou o IP da máquina na rede)")
    if os.environ.get("UDPBD_VERBOSE", "").strip().lower() in ("1", "true", "yes", "on"):
        print(
            "UDPBD: verbose ativo — saída do udpfs_server (-v) na consola; "
            "ou defina UDPBD_LOG=caminho\\udpbd.log para gravar em ficheiro."
        )
    print(
        "UDPBD: por defeito só HTTP (lista/prepare); corre udpfs_server -d à parte (UDP 62966). "
        "Subprocesso no Flask: UDPBD_MANAGED=1. Bloco: UDPBD_NET_MODE=block. Firewall UDP 62966."
    )
    print(
        "OPL+SMB: python opl_smb_host.py (pip install impacket) — partilha SMB + Flask; XMB: Jogos no PC (OPL + SMB)."
    )
    # Werkzeug (app.run) é leve mas fraco com vários downloads em paralelo; Waitress aguenta melhor I/O.
    try:
        from waitress import serve

        threads = int(os.environ.get("WAITRESS_THREADS", "16"))
        body_limit = int(os.environ.get("WAITRESS_MAX_REQUEST_BODY_SIZE", str(_MAX_UPLOAD_BYTES)))
        serve(app, host="0.0.0.0", port=5000, threads=threads, max_request_body_size=body_limit)
    except ImportError:
        app.run(host="0.0.0.0", port=5000, threaded=True)