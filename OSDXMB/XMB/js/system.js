//////////////////////////////////////////////////////////////////////////
///*				   			  System						  	  *///
/// 				   		  										   ///
///		 The module where all generic functions and variables are 	   ///
///			   			   generated and stored. 					   ///
/// 				   		  										   ///
//////////////////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////////////////
///*				   			 Explorer							  *///
//////////////////////////////////////////////////////////////////////////

function umountHDD() { if (os.readdir("pfs1:/")[1] === 0) { System.umount("pfs1:"); } }
function mountHDDPartition(partName) {
    if (!UserConfig.HDD) { return "?"; }

	umountHDD();
	const result = System.mount("pfs1:", `hdd0:${partName}`);
	xlog(`Partition "${partName}" Mount process finished with result: ${result}`);

	switch (result) {
        case 0: break; // This partition was mounted correctly.
        case -16: return "pfs0"; // The partition was already mounted on pfs0 probably.
	}

	return "pfs1";
}
function getAvailableDevices() {
    const Elements = [];
    const devices = System.devices();

    Elements.push({
        Name: XMBLANG.WORK_DIR_NAME,
        Description: "",
        Icon: 18,
        Type: "SUBMENU",
        Root: CWD
    });

    for (let i = 0; i < devices.length; i++) {
        let dev = devices[i];

        let count = 0;
        let basepath = "";
        let nameList = [];
        let descList = [];
        let iconList = [];

        switch (dev.name) {
            case "mc":
                count = 0;
                basepath = "mc";
                for (let j = 0; j < 2; j++) {
                    nameList.push(`Memory Card ${(j + 1).toString()}`);
                    iconList.push(16 + j);

                    let mcInfo = System.getMCInfo(j);
                    if (mcInfo) {
                        let used = 8000 - mcInfo.freemem;
                        descList.push(`${used} / 8000 Kb`);
                        count++;
                    }
                }
                break;
            case "mass":
                count = 10;
                basepath = "mass";
                for (let j = 0; j < count; j++) {
                    const info = System.getBDMInfo(`mass${j.toString()}:`);
                    if (!info) { count = j; break; }
                    nameList.push(XMBLANG.MASS_DIR_NAME);
                    iconList.push(21);
                    let bdmName = info.name;
                    switch (info.name) {
                        case "sdc": bdmName = "mx4sio"; break;
                        case "sd": bdmName = "ilink"; break;
                        case "udp": bdmName = "udpbd"; break;
                    }
                    descList.push(`${bdmName.toUpperCase()} ${(info.index + 1).toString()}`);
                }
                break;
            case "hdd":
                count = 1;
                basepath = "hdd";
                nameList.push(XMBLANG.HDD_DIR_NAME);
                descList.push("");
                iconList.push(29);
                break;
            case "mmce":
                count = 2;
                basepath = "mmce";
                for (let j = 0; j < count; j++) {
                    nameList.push("MMCE " + (j + 1).toString());
                    descList.push(XMBLANG.MMCE_DESC);
                    iconList.push(21);
                }
                break;
        }

        for (let j = 0; j < count; j++) {
            const root = `${basepath}${j.toString()}:`;
            if (os.readdir(root)[0].length > 0) {
                Elements.push({
                    Name: nameList[j],
                    Description: descList[j],
                    Icon: iconList[j],
                    Type: "SUBMENU",
                    Root: root
                });
            }
        }
    }

    return Elements;
}
function getDevicesAsItems(params = {}) {
	const Items = [];
	const fileFilters = ('fileFilters' in params) ? params.fileFilters : false;
	const fileoptions = ('fileoptions' in params) ? params.fileoptions : false;

    for (let i = 0; i < gDevices.length; i++) {
        Items.push({ ...gDevices[i] });
        Object.defineProperty(Items[Items.length - 1], "Value", {
            get() { return exploreDir({ dir: this.Root, fileFilters: fileFilters, fileoptions: fileoptions }); },
            enumerable: true,
            configurable: true,
        });
	}
	return Items;
}
function exploreDir(params) {
	const fileFilters = ('fileFilters' in params) ? params.fileFilters : false;
	const fileoptions = ('fileoptions' in params) ? params.fileoptions : false;
	const collection = [];
	const isHdd = (params.dir.substring(0,3) === "hdd");
	const isMc = (params.dir.substring(0,2) === "mc");
	const dirItems = System.listDir(params.dir);

    // Separate directories and files
    let directories = dirItems.filter(item => item.name !== "." && item.name !== ".." && item.dir); // All directories
    let files = dirItems.filter(item => !item.dir); // All files

    // Sort directories and files alphabetically by name
    files.sort((a, b) => {
        const nameA = a.name.toLowerCase();
        const nameB = b.name.toLowerCase();
        return nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
    });

	const defGetter = function() { return exploreDir({ dir: this.FullPath, fileFilters: fileFilters, fileoptions: fileoptions }); };
	const hddGetter = function() { const part = mountHDDPartition(this.Name); return exploreDir({ dir:`${part}:/`, fileFilters: fileFilters, fileoptions: fileoptions}); };
	const getter = (isHdd) ? hddGetter : defGetter;

	for (let i = 0; i < directories.length; i++) {
		let item = directories[i];

		collection.push({
            Name: item.name,
            Description: "",
            Icon: 18,
            Type: "SUBMENU",
            FullPath: `${params.dir}${item.name}/`,
            Device: getDeviceName(params.dir)
        });
        Object.defineProperty(collection[collection.length - 1], "Value", { get: getter });
        Object.defineProperty(collection[collection.length - 1], "FileCount", {
            get() {
                delete this.FileCount;
                let count = 0;
                let files = System.listDir(this.FullPath).filter(item => !item.dir);;
                for (let i = 0; i < files.length; i++) {
                    if (!fileFilters || extensionMatches(files[i].name, fileFilters)) { count++; }
                }
                this.FileCount = count;
                return count;
            },
            enumerable: true,
            configurable: true
        });
	}

    collection.sort((a, b) => {
        const nameA = a.Name.toLowerCase();
        const nameB = b.Name.toLowerCase();
        return nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
    });

	for (let i = 0; i < files.length; i++) {
		let item = files[i];
		if (!fileFilters || extensionMatches(item.name, fileFilters)) {
			const itemParams = {
				path: `${params.dir}${item.name}`,
				size: item.size,
				fileoptions: fileoptions
			}

			collection.push(getFileAsItem(itemParams));
		}
	}

	return { Items: collection, Default: 0 };
}
function getFileAsItem(params) {
    const item = {
        Name: getFileName(params.path),
        Description: formatFileSize(params.size),
        Icon: "FILE",
        FullPath: params.path,
        Device: getDeviceName(params.path)
    }

    switch (getFileExtension(params.path).toLowerCase()) {
        case "vcd": item.Icon = "DISC_PS1"; break;
        case "iso": item.Icon = "DISC_PS2"; break;
        case "elf": item.Icon = "TOOL"; item.Type = "ELF"; item.Value = { Path: params.path, Args: [], }; break;
        case "png":
        case "jpg":
        case "bmp": item.Icon = "CAT_PICTURE"; break;
        case "mp3":
        case "wav":
        case "ogg": item.Icon = "CAT_MUSIC"; break;
        case "mp4":
        case "mkv":
        case "avi": item.Icon = "CAT_VIDEO"; break;
    }

    if (('fileoptions' in params) && params.fileoptions) { item.Option = params.fileoptions; }

    return item;
}
function getDeviceName(path) {
    const root = getRootName(path);
    let name = root;
    if (root.includes("mass")) {
        name = System.getBDMInfo(`${root}:`).name;
        switch (name) {
            case "sdc": name = "mx4sio"; break;
            case "sd": name = "ilink"; break;
            case "udp": name = "udpbd"; break;
        }
    }
    else if (root.includes("pfs")) {
        name = "hdd";
    }

    return name.toUpperCase();
}
function deleteItem(collection, id) {
    const item = collection[id];
    const path = item.FullPath;
    if (path.endsWith("/")) {
        const directory = os.readdir(path)[0];
        while (directory.length > 0) {
            os.remove(`${path}${directory.shift()}`);
        }
        System.removeDirectory(path);
    }
    else { os.remove(path); }
    collection.splice(id, 1);
}

//////////////////////////////////////////////////////////////////////////
///*				   			   Paths							  *///
//////////////////////////////////////////////////////////////////////////

/* Get the root of a path */
function getRootName(path) {
    const colonIndex = path.indexOf(":");
    if (colonIndex === -1) {
        throw new Error("Invalid path format. No ':' found.");
    }
    return path.slice(0, colonIndex);
}

/*	Get the full path without the root	*/
function getPathWithoutRoot(path) {
    const colonIndex = path.indexOf(":");
    if (colonIndex === -1) {
        throw new Error("Invalid path format. No ':' found.");
    }
    return path.slice(colonIndex + 2); // Skip ":/" to get the remaining path
}

/*	Parses a filepath to get its filename or folder name	*/
function getFileName(path) {
    // Strip drive letters like C:\ or prefixes like X:...
    const colonIndex = path.indexOf(":");
    if (colonIndex !== -1) path = path.slice(colonIndex + 1);

    // Remove trailing slash if more than one (normalize double slashes)
    while (path.length > 1 && path.endsWith("/")) {
        path = path.slice(0, -1);
    }

    const lastSlashIndex = path.lastIndexOf('/');
    return lastSlashIndex === -1 ? path : path.substring(lastSlashIndex + 1);
}

/*	Parses a filepath to get its extension if it has one	*/
function getFileExtension(filePath) {
    if (typeof filePath !== 'string') return "";

    // Extract extension after the last dot, if any
    const lastDotIndex = filePath.lastIndexOf('.');
    if (lastDotIndex === -1 || lastDotIndex === filePath.length - 1) {
        return ""; // No extension found or dot is at the end
    }

    return filePath.substring(lastDotIndex + 1);
}

/*	Parses a filepath to search if it matches any extension from a list of extensions	*/
function extensionMatches(filePath, filterExtensions) {
    if (!Array.isArray(filterExtensions) || filterExtensions.length === 0) {
        console.log("At least one filter extension must be provided.");
        return false;
    }

    const fileExtension = getFileExtension(filePath);

    // Compare the extracted extension with any of the filters (case-insensitive)
    return filterExtensions.some(filter =>
        typeof filter === 'string' &&
        fileExtension?.toLowerCase() === filter.toLowerCase()
    );
}

/*	Converts a given integer into a byte formatted string	*/
function formatFileSize(size) {
  if (size < 0) return "";

  const suffixes = ["b", "Kb", "Mb", "Gb", "Tb"];
  let index = 0;

  while (size >= 1024 && index < suffixes.length - 1) {
    size /= 1024;
    index++;
  }

  // Round to nearest whole number or one decimal place if needed
  const rounded = index > 2 ? Number(size.toFixed(1)) : ~~(size);

  return `${rounded} ${suffixes[index]}`;
}

function resolveFilePath(filePath) {
    filePath = filePath.replace("{cwd}", CWD);
    filePath = filePath.replace("{bootpath}", System.boot_path);
    filePath = filePath.replace("//", "/");
    if (!filePath.includes('?')) return filePath; // Literal path, return as is

    const prefixes = {
        'mass': Array.from({ length: 10 }, (_, i) => `mass${i}`),
        'mc': ['mc0', 'mc1'],
        'mmce': ['mmce0', 'mmce1']
    };

    const match = filePath.match(/^(mass|mc|mmce)\?:\/(.*)/);
    if (!match) return '';

    const [, root, subPath] = match;
    for (const variant of prefixes[root])
    {
        const fullPath = `${variant}:/${subPath}`;
        if (std.exists(fullPath))  { return fullPath; }
    }

    return ''; // File not found in any of the checked paths
}

/**
 * Write all text on 'txt' to 'path' file
 * @param {String} path The path to write the text file.
 * @param {String} txt The text to write to the file.
 * @param {String} mode The file mode (w, r, a, etc...).
 */
function ftxtWrite(path, txt, mode = "w+") {
    let file = false;
    try {
        let errObj = {};
        file = std.open(path, mode, errObj);
        if (!file) { throw new Error(`ftxtWrite(): IO ERROR - ${std.strerror(errObj.errno)}`); }
        file.puts(txt);
        file.flush();
    } catch (e) {
        xlog(e);
    } finally {
        if (file) { file.close(); }
    }
}

//////////////////////////////////////////////////////////////////////////
///*				   			    ISO								  *///
//////////////////////////////////////////////////////////////////////////

function getGameName(path) {

    const noExt = path.replace(/\.[^/.]+$/, "");
    const lastDot = noExt.lastIndexOf(".");
    if (lastDot === -1 || lastDot === noExt.length - 1) return noExt.trim();
    return noExt.slice(lastDot + 1);
}
function getGameCodeFromOldFormatName(path) {

    // Check for Pfs BatchKit Manager Pattern (PP.Game-ID..GameName.iso)
    let match = path.match(/[A-Z]{4}-\d{5}/);
    if (match) {
        const parts = match[0].split('-'); // ['SLPS', '12345']
        const gameCode = parts[0] + '_' + parts[1].slice(0, 3) + '.' + parts[1].slice(3);
        return gameCode;
    }

    // Check for old format pattern
    match = path.match(/[A-Z]{4}[-_]\d{3}\.\d{2}/);
    if (match) {
        return match[0].replace('-', '_');
    }

    return "";
}

/** Alinha o gameid do servidor (ex. SCUS-97481) ao formato do ISO/neutrino.cfg (ex. SCUS_974.81) para ART/<id>/. */
function normalizePs2ProductCode(gid) {
    if (!gid || typeof gid !== "string") {
        return "";
    }
    const t = gid.trim();
    if (t.length < 4) {
        return "";
    }
    const up = t.toUpperCase();
    let canon = getGameCodeFromOldFormatName(up + ".iso");
    if (canon) {
        return canon;
    }
    canon = getGameCodeFromOldFormatName(up);
    if (canon) {
        return canon;
    }
    return t;
}

/** Raiz do volume (mass0:/, mmce0:/) a partir de CWD do XMB — conf OPL flat fica aqui. */
function oplConfDeviceRootFromCwd() {
    try {
        const c = String(typeof CWD !== "undefined" ? CWD : "");
        const m = c.match(/^((?:mass|mmce)\d+):\//i);
        if (m) {
            return m[1] + ":/";
        }
    } catch (e) {
        xlog(e);
    }
    return "";
}

/**
 * String de startup OPL (conf_last last_played): igual a game->startup no codigo OPL (SYSTEM.CNF),
 * ate 12 chars (GAME_STARTUP_MAX). Usa gameid da biblioteca ou codigo no nome do ISO.
 */
function oplStartupStringFromListEntry(gameid, isoBaseName) {
    let s = "";
    if (gameid && String(gameid).trim().length > 2) {
        s = normalizePs2ProductCode(String(gameid).trim());
    }
    if (!s && isoBaseName) {
        const base = String(isoBaseName).split("/").pop();
        s = getGameCodeFromOldFormatName(base) || getGameCodeFromOldFormatName(base + ".iso") || "";
    }
    if (!s) {
        return "";
    }
    s = String(s).toUpperCase();
    if (s.length > 12) {
        s = s.substring(0, 12);
    }
    return s;
}

/** Defaults = ficheiro opl_cfg/conf_opl.cfg no repo (default_device=1, tema, cores…). */
function oplDefaultOplCfgMap(autostartSeconds) {
    let n = Number(autostartSeconds);
    if (!isFinite(n) || n < 0) {
        n = 3;
    }
    const ast = Math.max(0, Math.min(9, Math.floor(n)));
    return {
        eth_mode: "2",
        default_device: "1",
        usb_mode: "2",
        hdd_mode: "0",
        app_mode: "0",
        bdm_cache: "16",
        smb_cache: "16",
        scrolling: "1",
        autosort: "1",
        autorefresh: "0",
        remember_last: "1",
        autostart_last: String(ast),
        theme: "<OPL>",
        language_text: "English (internal)",
        bg_color: "#28C5F9",
        text_color: "#FFFFFF",
        ui_text_color: "#5868B4",
        sel_text_color: "#00AEFF",
        enable_notifications: "0",
        enable_coverart: "0",
        wide_screen: "0",
        vmode: "0",
        xoff: "0",
        yoff: "0",
        overscan: "0",
        disable_debug: "0",
        ps2logo: "0",
        hdd_game_list_cache: "0",
        exit_path: "",
        enable_delete_rename: "0",
        hdd_spindown: "20",
        usb_prefix: "",
        eth_prefix: "",
        hdd_cache: "8",
        enable_ilink: "0",
        enable_mx4sio: "0",
        enable_sfx: "0",
        enable_boot_snd: "0",
        enable_bgm: "0",
        sfx_volume: "80",
        boot_snd_volume: "80",
        bgm_volume: "70",
        default_bgm_path: "",
        swap_select_btn: "1",
    };
}

function oplOplCfgKeyOrder() {
    return [
        "eth_mode",
        "default_device",
        "usb_mode",
        "hdd_mode",
        "app_mode",
        "bdm_cache",
        "smb_cache",
        "scrolling",
        "autosort",
        "autorefresh",
        "remember_last",
        "autostart_last",
        "theme",
        "language_text",
        "bg_color",
        "text_color",
        "ui_text_color",
        "sel_text_color",
        "enable_notifications",
        "enable_coverart",
        "wide_screen",
        "vmode",
        "xoff",
        "yoff",
        "overscan",
        "disable_debug",
        "ps2logo",
        "hdd_game_list_cache",
        "exit_path",
        "enable_delete_rename",
        "hdd_spindown",
        "usb_prefix",
        "eth_prefix",
        "hdd_cache",
        "enable_ilink",
        "enable_mx4sio",
        "enable_sfx",
        "enable_boot_snd",
        "enable_bgm",
        "sfx_volume",
        "boot_snd_volume",
        "bgm_volume",
        "default_bgm_path",
        "swap_select_btn",
    ];
}

function oplFormatOplCfgFromMap(map) {
    const order = oplOplCfgKeyOrder();
    const lines = [];
    const seen = {};
    let i;
    for (i = 0; i < order.length; i++) {
        const k = order[i];
        if (map[k] !== undefined) {
            lines.push(k + "=" + map[k]);
            seen[k] = true;
        }
    }
    for (const k2 in map) {
        if (Object.prototype.hasOwnProperty.call(map, k2) && !seen[k2]) {
            lines.push(k2 + "=" + map[k2]);
        }
    }
    return lines.join("\r\n") + "\r\n";
}

/** Cria conf_opl.cfg completo se não existir; senão faz merge das chaves. */
function oplEnsureOplCfgAtPath(path, mergeKv) {
    if (!path) {
        return false;
    }
    try {
        if (std.exists(path)) {
            return oplMergeOplCfgKeys(path, mergeKv);
        }
        const baseMap = oplDefaultOplCfgMap(Number(mergeKv.autostart_last) >= 0 ? mergeKv.autostart_last : 3);
        const m = {};
        let k;
        for (k in baseMap) {
            if (Object.prototype.hasOwnProperty.call(baseMap, k)) {
                m[k] = baseMap[k];
            }
        }
        for (k in mergeKv) {
            if (Object.prototype.hasOwnProperty.call(mergeKv, k)) {
                m[k] = mergeKv[k];
            }
        }
        ftxtWrite(path, oplFormatOplCfgFromMap(m), "w+");
        return true;
    } catch (e) {
        xlog("OPL XMB: oplEnsureOplCfgAtPath falhou");
        xlog(e);
        return false;
    }
}

function oplPcHostFromBaseUrl(baseUrl) {
    try {
        const m = String(baseUrl || "").match(/^https?:\/\/([^/:]+)/i);
        return m ? m[1] : "";
    } catch (e) {
        return "";
    }
}

/** Partilha SMB OPL (netiso.cfg opcional: opl_smb_*). Porta default 4445 (Windows + Impacket). */
function oplNetisoOplSmbSettingsFromCfg() {
    let share = "PS2ISO";
    let user = "opl";
    let passStr = "";
    let portStr = "4445";
    try {
        const c = CfgMan.Get("netiso.cfg");
        if (c) {
            const s = (c.opl_smb_share != null ? String(c.opl_smb_share) : c.OPL_SMB_SHARE != null ? String(c.OPL_SMB_SHARE) : "").trim();
            if (s) {
                share = s.substring(0, 31);
            }
            const u = (c.opl_smb_user != null ? String(c.opl_smb_user) : c.OPL_SMB_USER != null ? String(c.OPL_SMB_USER) : "").trim();
            if (u) {
                user = u.substring(0, 31);
            }
            const p = (c.opl_smb_pass != null ? String(c.opl_smb_pass) : c.OPL_SMB_PASS != null ? String(c.OPL_SMB_PASS) : "").trim();
            if (p) {
                passStr = p.substring(0, 31);
            }
            const prt = (c.opl_smb_port != null ? String(c.opl_smb_port) : c.OPL_SMB_PORT != null ? String(c.OPL_SMB_PORT) : "").trim();
            if (prt && !isNaN(Number(prt))) {
                portStr = String(Math.floor(Number(prt)));
            }
        }
    } catch (eCfg) {
        xlog(eCfg);
    }
    return { share: share, user: user, passStr: passStr, portStr: portStr };
}

/** conf_network.cfg (CRLF) — PS2 em DHCP; smb_ip = PC. */
function oplBuildConfNetworkBody(pcHost, smb) {
    if (!pcHost) {
        return "";
    }
    const lines = [
        "eth_linkmode=0",
        "ps2_ip_use_dhcp=1",
        "smb_share_nb_addr=",
        "smb_share_use_nbns=0",
        "smb_ip=" + pcHost,
        "smb_port=" + smb.portStr,
        "smb_share=" + smb.share,
        "smb_user=" + smb.user,
        "smb_pass=" + smb.passStr,
        "ps2_ip_addr=192.168.0.10",
        "ps2_netmask=255.255.255.0",
        "ps2_gateway=192.168.0.1",
        "ps2_dns=192.168.0.1",
    ];
    return lines.join("\r\n") + "\r\n";
}

/** Atualiza chaves em conf_opl.cfg existente (CRLF). */
function oplMergeOplCfgKeys(path, kv) {
    try {
        if (!path || !std.exists(path)) {
            return false;
        }
        let raw = "";
        try {
            raw = std.loadFile(path);
        } catch (e) {
            xlog(e);
            return false;
        }
        const lines = raw.replace(/\r/g, "").split("\n");
        const keys = Object.keys(kv);
        const seen = {};
        const out = [];
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            const eq = line.indexOf("=");
            if (eq > 0) {
                const k = line.substring(0, eq).trim();
                if (kv[k] !== undefined) {
                    line = k + "=" + kv[k];
                    seen[k] = true;
                }
            }
            out.push(line);
        }
        for (let ki = 0; ki < keys.length; ki++) {
            const k = keys[ki];
            if (!seen[k]) {
                out.push(k + "=" + kv[k]);
            }
        }
        ftxtWrite(path, out.join("\r\n") + "\r\n", "w+");
        return true;
    } catch (eTop) {
        xlog("OPL XMB: oplMergeOplCfgKeys() falhou");
        xlog(eTop);
        return false;
    }
}

/**
 * Antes de loadELF no OPL (SMB): grava conf_last.cfg com last_played=<startup> e,
 * se conf_opl.cfg existir no USB ou MC, liga remember_last e autostart_last (segundos).
 */
function oplPrepareSmbLaunchFromXmb(opts) {
    try {
        const gameid = (opts && opts.gameid) ? String(opts.gameid).trim() : "";
        const bu0 = opts && opts.baseUrl ? String(opts.baseUrl).replace(/\/$/, "") : "";
        const rel0 = opts && opts.isoRelPath ? String(opts.isoRelPath).replace(/\\/g, "/").trim() : "";
        const disp0 = opts && opts.displayName ? String(opts.displayName).trim() : "";
        if (bu0 && rel0 && typeof xmbReportPlayingToPc === "function") {
            xmbReportPlayingToPc(bu0, rel0, disp0, gameid);
        }

        // Segurança: só mexer em conf_last/conf_opl se o utilizador ativar explicitamente.
        let allowWrite = false;
        try {
            const c = CfgMan.Get("netiso.cfg");
            const v = (c && (c.opl_smb_write_cfg ?? c.OPL_SMB_WRITE_CFG)) != null ? String(c.opl_smb_write_cfg ?? c.OPL_SMB_WRITE_CFG) : "";
            allowWrite = (v.trim().toLowerCase() === "1" || v.trim().toLowerCase() === "true" || v.trim().toLowerCase() === "yes");
        } catch (eCfg) {
            xlog(eCfg);
            allowWrite = false;
        }
        if (!allowWrite) {
            xlog("OPL XMB: (opl_smb_write_cfg=0) sem escrita de conf_last/conf_opl.");
            return;
        }

        const isoFile = (opts && opts.isoFileName) ? String(opts.isoFileName).trim() : "";
        let autostartSeconds = (opts && Number(opts.autostartSeconds) >= 0) ? Math.floor(Number(opts.autostartSeconds)) : 3;
        try {
            const nc = CfgMan.Get("netiso.cfg");
            const a = (nc && (nc.opl_autostart_seconds != null || nc.OPL_AUTOSTART_SECONDS != null))
                ? String(nc.opl_autostart_seconds != null ? nc.opl_autostart_seconds : nc.OPL_AUTOSTART_SECONDS).trim()
                : "";
            if (a !== "" && !isNaN(Number(a))) {
                autostartSeconds = Math.max(0, Math.min(9, Math.floor(Number(a))));
            }
        } catch (eAs) {
            xlog(eAs);
        }

        const startup = oplStartupStringFromListEntry(gameid, isoFile);
        if (!startup) {
            xlog("OPL XMB: sem codigo de jogo (gameid na biblioteca ou SLxx_xxx.xx no nome do .iso) — conf_last nao gravado.");
            return;
        }

        const body = "last_played=" + startup + "\r\n";
        const lastPaths = [];
        const root = oplConfDeviceRootFromCwd();
        if (root) {
            lastPaths.push(root + "conf_last.cfg");
        }
        lastPaths.push("mc0:/OPL/conf_last.cfg");
        lastPaths.push("mc1:/OPL/conf_last.cfg");

        for (let i = 0; i < lastPaths.length; i++) {
            try {
                ftxtWrite(lastPaths[i], body, "w+");
                xlog("OPL XMB: " + lastPaths[i] + " -> last_played=" + startup);
            } catch (e1) {
                xlog("OPL XMB: falha a escrever " + lastPaths[i]);
                xlog(e1);
            }
        }

        const mergeKv = {
            remember_last: "1",
            autostart_last: String(autostartSeconds),
        };
        const oplMain = [];
        if (root) {
            oplMain.push(root + "conf_opl.cfg");
        }
        oplMain.push("mc0:/OPL/conf_opl.cfg");
        oplMain.push("mc1:/OPL/conf_opl.cfg");
        for (let j = 0; j < oplMain.length; j++) {
            try {
                if (oplEnsureOplCfgAtPath(oplMain[j], mergeKv)) {
                    xlog(
                        "OPL XMB: " +
                            oplMain[j] +
                            " -> merge remember_last=1 autostart_last=" +
                            autostartSeconds,
                    );
                }
            } catch (e2) {
                xlog("OPL XMB: falha a atualizar " + oplMain[j]);
                xlog(e2);
            }
        }

        const pcHost = oplPcHostFromBaseUrl(bu0);
        const smbSet = oplNetisoOplSmbSettingsFromCfg();
        const netBody = oplBuildConfNetworkBody(pcHost, smbSet);
        if (netBody) {
            const netPaths = [];
            if (root) {
                netPaths.push(root + "conf_network.cfg");
            }
            netPaths.push("mc0:/OPL/conf_network.cfg");
            netPaths.push("mc1:/OPL/conf_network.cfg");
            for (let n = 0; n < netPaths.length; n++) {
                try {
                    ftxtWrite(netPaths[n], netBody, "w+");
                    xlog("OPL XMB: " + netPaths[n] + " -> smb_ip=" + pcHost + " port=" + smbSet.portStr);
                } catch (eNet) {
                    xlog("OPL XMB: falha a escrever " + netPaths[n]);
                    xlog(eNet);
                }
            }
        } else {
            xlog("OPL XMB: sem host no url — conf_network.cfg não gerado");
        }
    } catch (eTop) {
        xlog("OPL XMB: oplPrepareSmbLaunchFromXmb() falhou");
        xlog(eTop);
    }
}

function getISOgameID(isoPath, isoSize) {

    // Check if the Game ID is in the file name
	let ID = getGameCodeFromOldFormatName(isoPath);
    if (ID) return ID;

    const sectorSize = 2048; // Standard ISO sector size
    const PVD_OFFSET = 0x8000;
    const file = std.open(isoPath, "r");
    if (!file) { console.log(`Could not open file: ${isoPath}`); return ID; }

    // Seek to the Primary Volume Descriptor (sector 16 in ISO 9660)
    file.seek(PVD_OFFSET, std.SEEK_SET);
    const pvd = file.readAsString(sectorSize);

    // Check for "CD001" magic string in PVD
    if (!pvd || pvd.substring(1, 6) !== "CD001") {
        console.log(`${getGameName(isoPath)} Primary Volume Descriptor (CD001) not found.`);
        file.close();
        return ID;
    }

    // Extract the root directory offset and size
    file.seek(PVD_OFFSET + 158, std.SEEK_SET);
    const rootDirOffset = sectorSize * (file.getByte() | (file.getByte() << 8) | (file.getByte() << 16) | (file.getByte() << 24));

    file.seek(4, std.SEEK_CUR);
    const rootDirSize = (file.getByte() | (file.getByte() << 8) | (file.getByte() << 16) | (file.getByte() << 24));

    // Read the root directory
    if ((rootDirOffset > isoSize) || (rootDirSize > sectorSize)) {
        console.log(`${getGameName(isoPath)} ISO Read Error: Invalid Root Data.`);
        file.close();
        return ID;
    }

    file.seek(rootDirOffset, std.SEEK_SET);
    const rootDir = file.readAsString(rootDirSize);
    file.close();

    if ((!rootDir) || (rootDir.length === 0)) {
        console.log(`${getGameName(isoPath)} Root directory not found or is empty`);
        return ID;
    }

    // Match file name pattern
    const match = rootDir.match(/[A-Z]{4}[-_][0-9]{3}\.[0-9]{2}/);
    if (match) { ID = match[0]; }

    return ID;
}
function getPS2GameID(game, mutex = false) {
    const NeutrinoCFG = CfgMan.Get("neutrino.cfg");
    if (game.Name in NeutrinoCFG) { game.GameID = NeutrinoCFG[game.Name]; }
    else {
        if (mutex) MainMutex.unlock();
        const gamePath = `${game.Data.path}${game.Data.fname}`;
        const result = getISOgameID(gamePath, game.Data.size);
        if (mutex) MainMutex.lock();
        game.GameID = result;
        if (game.GameID) {
            NeutrinoCFG[game.Name] = game.GameID;
            CfgMan.Push("neutrino.cfg", NeutrinoCFG);
        }
    }

    game.Data.id = game.GameID;
    game.Description = " \u{B7} " + game.Data.dev.toUpperCase();
    game.Description = (game.GameID) ? game.GameID + game.Description : getLocalText(XMBLANG.UNKNOWN) + game.Description;
    game.Icon = (getGameArt(game)) ? "DISC_PS2" : -2;
}

/**
 * Lista NET ISO (net_1): mesmo fluxo visual que getPS2GameID — ID → getGameArt.
 * Com gameid do servidor usa normalizePs2ProductCode (arte/local); senão neutrino.cfg + getISOgameID se o .iso existir.
 */
function getNetIsoServerListGameID(game, mutex = false) {
    if (!game || !game.Data) {
        return false;
    }
    let unlockedForIso = false;
    try {
        const gid = (game.Data && game.Data.gameid) ? String(game.Data.gameid).trim() : "";
        if (gid.length > 3) {
            let id = normalizePs2ProductCode(gid);
            if (!id || id.length < 4) {
                id = gid;
            }
            game.GameID = id;
        } else {
            const NeutrinoCFG = CfgMan.Get("neutrino.cfg");
            if (game.Name in NeutrinoCFG) {
                game.GameID = NeutrinoCFG[game.Name];
            } else {
                const gamePath = (game.Data.path && game.Data.fname)
                    ? `${game.Data.path}${game.Data.fname}`
                    : "";
                if (mutex) {
                    MainMutex.unlock();
                    unlockedForIso = true;
                }
                let result = "";
                try {
                    result = (gamePath && std.exists(gamePath))
                        ? getISOgameID(gamePath, game.Data.size || 0)
                        : "";
                } finally {
                    if (unlockedForIso) {
                        MainMutex.lock();
                        unlockedForIso = false;
                    }
                }
                game.GameID = result;
                if (game.GameID) {
                    NeutrinoCFG[game.Name] = game.GameID;
                    CfgMan.Push("neutrino.cfg", NeutrinoCFG);
                }
            }
        }

        game.Data.id = game.GameID;
        const devLabel = (game.Data && game.Data.dev) ? String(game.Data.dev) : "net";
        game.Description = " \u{B7} " + devLabel.toUpperCase();
        game.Description = (game.GameID) ? game.GameID + game.Description : getLocalText(XMBLANG.UNKNOWN) + game.Description;
        let ga = false;
        try {
            ga = getGameArt(game);
        } catch (eArt) {
            xlog(eArt);
            ga = false;
        }
        game.Icon = ga ? "DISC_PS2" : -2;
        return ga;
    } catch (e) {
        xlog(e);
        if (unlockedForIso) {
            try {
                MainMutex.lock();
            } catch (eLock) {
                xlog(eLock);
            }
        }
        try {
            game.Icon = "DISC_PS2";
            const devLabel = (game.Data && game.Data.dev) ? String(game.Data.dev) : "net";
            const unk = getLocalText(XMBLANG.UNKNOWN);
            game.Description = (game.GameID ? String(game.GameID) : unk) + " · " + devLabel.toUpperCase();
        } catch (e2) {
            xlog(e2);
        }
        return false;
    }
}

function getISOgameArgs(info) {
    let args = [];
    args.push(`-cwd=${PATHS.Neutrino}`);
    /* Rede: PLUS default UDPFS (netiso udpfs_net=1 + PC -d pasta). Bloco: udpfs_net=0 e PC UDPBD_NET_MODE=block. */
    if (info.udpbdNet === true) {
        let nc = {};
        try {
            nc = CfgMan.Get("netiso.cfg");
        } catch (eNc) {
            xlog(eNc);
        }
        const useUdpfs =
            nc &&
            (nc.udpfs_net === "1" ||
                nc.udpfs_net === "true" ||
                nc.udpfs === "1" ||
                nc.udpfs === "true");
        if (useUdpfs) {
            // Permite escolher outro BSD (ex.: bsd-udpfs-debug.toml) via netiso.cfg udpfs_bsd=udpfs-debug
            let bsdName = "udpfs";
            try {
                if (nc && nc.udpfs_bsd != null && String(nc.udpfs_bsd).trim() !== "") {
                    bsdName = String(nc.udpfs_bsd).trim();
                }
            } catch (eBsd) {
                xlog(eBsd);
            }
            args.push("-bsd=" + bsdName);
            let fn = (info.fname && String(info.fname).trim()) ? String(info.fname).trim().replace(/\\/g, "/") : "";
            while (fn.startsWith("/")) {
                fn = fn.slice(1);
            }
            if (!fn) {
                xlog("getISOgameArgs: UDPFS sem fname de ISO");
            }
            args.push("-dvd=udpfs:" + fn);
        } else {
            args.push("-bsd=udpbd");
            args.push("-bsdfs=bd");
            args.push("-dvd=bdfs:udp0p0");
        }
        args.push("-qb");
        const ridNet = info.id;
        const ID =
            ridNet != null &&
            ridNet !== "" &&
            String(ridNet).trim().length > 3
                ? String(ridNet).trim()
                : false;
        args = args.concat(GetNeutrinoArgs(ID));
        if (args.includes("-logo")) {
            args = args.filter((arg) => arg !== "-logo");
        }
        const argStr = args.join(" ");
        if (argStr.length > 230) {
            xlog("AVISO: linha de args Neutrino longa (" + argStr.length + " chars); se voltar ao XMB, renomeie o ISO (nome mais curto).");
        }
        return args;
    }
    /* BDM "udp" → dev udpbd é para bloco em rede; ISO em mass0:/... precisa -bsd=usb (senão Neutrino cai ao browser). */
    let bsdDev = info.dev;
    if (bsdDev === "udpbd") {
        const p = String(info.path || "");
        if (/^mass\d+:/.test(p)) {
            bsdDev = "usb";
            xlog("getISOgameArgs: mass: + BDM udp → -bsd=usb (ISO local)");
        } else if (/^mmce\d+:/.test(p)) {
            bsdDev = "mmce";
            xlog("getISOgameArgs: mmce: + BDM udp → -bsd=mmce (ISO local)");
        }
    }
    args.push(`-bsd=${bsdDev}`);

    switch (info.path.substring(0, 3)) {
        case "hdd":
            args.push(`-bsdfs=hdl`);
            args.push(`-dvd=hdl:${info.fname.slice(0, -4)}`); // Remove .iso extension
            break;
        default: {
            const root = getRootName(info.path);
            const dir = getPathWithoutRoot(info.path);
            args.push(`-dvd=${root}:${dir}${info.fname}`);
            args.push(`-qb`);
            break;
        }
    }

	// UPDATE: it's now a per game compatibility setting
    // Specify media type if available
    //if (info.mt !== "") { args.push(`-mt=${info.mt}`); }

	// Additional Main/Per-Game Settings.
    const rid = info.id;
    const ID =
        rid != null &&
        rid !== "" &&
        String(rid).trim().length > 3
            ? String(rid).trim()
            : false;
    args = args.concat(GetNeutrinoArgs(ID));

    if (bsdDev === "ata" && args.includes("-logo")) {
        // Remove -logo if using ata device
        args = args.filter(arg => arg !== "-logo");
    }

	return args;
}

//////////////////////////////////////////////////////////////////////////
///*				   			   POPS								  *///
//////////////////////////////////////////////////////////////////////////

function getVCDGameID(path, size) {

    let id = false;
    let file = false;

	try {
		if (size <= 0x10d900) { throw new Error(`File is too small: ${path}`); }

		file = std.open(path, "r");
		if (!file) { throw new Error(`Failed to open file: ${path}`); }

		// Seek to the desired position
        file.seek(0x10c900, std.SEEK_SET);

        // Read 4096 bytes
        const buffer = file.readAsString(4096);
        // Match the pattern
        const match = buffer.match(/[A-Z]{4}[-_][0-9]{3}\.[0-9]{2}/);

        if (match) { id = match[0]; }

	} catch (e) {
		xlog(e);
	} finally {
		if (file) { file.close(); }
	}

    return id;
}
function getPS1GameID(game, mutex = false) {
    const PopsCFG = CfgMan.Get("pops.cfg");
    if (game.Name in PopsCFG) { game.GameID = PopsCFG[game.Name]; }
    else {
        if (mutex) MainMutex.unlock();
        let path = game.Data.path;
        if (game.Data.dev === "hdd") { path = mountHDDPartition("__.POPS") + ":/"; }
        path = `${path}${game.Data.fname}`;
        const result = getVCDGameID(path, game.Data.size);
        if (mutex) MainMutex.lock();
        game.GameID = result;
        if (game.GameID) {
            PopsCFG[game.Name] = game.GameID;
            CfgMan.Push("pops.cfg", PopsCFG);
        }
    }

    game.Description = " \u{B7} " + game.Data.fdev;
    game.Description = (game.GameID) ? game.GameID + game.Description : getLocalText(XMBLANG.UNKNOWN) + game.Description;
    game.Icon = (getGameArt(game, "PS1")) ? "DISC_PS1" : -2;
}

/*	Info:

    Function to get if cheats on the 'cheats' array are enabled in the CHEATS.TXT file.
    Will return a Bool Array corresponding to each cheat on the 'cheats' array.
    'game' variable can be specified to get a game's CHEATS.TXT and must be the game's title.
	'device' variable can be specified to get a specific device CHEATS.TXT.

*/
function getPOPSCheat(params) {
	const cheats = params.cheats;
	const game = ('game' in params) ? `${params.game}/` : "";
	const device = ('device' in params) ? params.device : "mass";

    // Create an array to store whether each cheat is enabled
    const enabledCheats = new Array(cheats.length).fill(false);
    let path = "";

    switch (device) {
        case "hdd":
            if (os.readdir("hdd0:")[0].length === 0) { return enabledCheats; }
            const part = mountHDDPartition("__common");
            if (!os.readdir(`${part}:/`)[0].includes("POPS")) { return enabledCheats; }
            path = `${part}:/POPS/${game}`;
            break;
        case "mass": path = `mass:/POPS/${game}`; break;
        case "host": path = `${CWD}/POPS/${game}`; break;
    }

	const dirFiles = os.readdir(path)[0];
	if (!dirFiles.includes("CHEATS.TXT")) { return enabledCheats; }

	let errObj = {};
	let file = false;

	try {
		file = std.open(`${path}CHEATS.TXT`, "r", errObj);
		if (!file) { throw new Error(`getPOPSCheat(): I/O Error - ${std.strerror(errObj.errno)}`); }

		const content = file.readAsString();
		const lines = content.split(/\r?\n/);    // Split the content into lines

		// Iterate over the lines in the content
		for (const line of lines) {
			for (let i = 0; i < cheats.length; i++) {
				const cheatString = cheats[i];

				// Check if the line matches the enabled cheat format
				if (line === `$${cheatString}`) { enabledCheats[i] = true; }
			}
		}
	} catch (e) {
		xlog(e);
	} finally {
		if (file) { file.close(); }
	}

    return enabledCheats;
}

/*	Info:

    Function to set cheats on the 'cheats' array to a CHEATS.TXT file.
    'game' variable can be specified to set a game's CHEATS.TXT.
    'game' must be the game's title followed by a '/'.

*/
function setPOPSCheat(params) {
	let cheats = params.cheats;
	let game = ('game' in params) ? `${params.game}/` : "";
	let device = ('device' in params) ? params.device : "mass";
    let path = "";

    switch (device) {
        case "hdd":
            if (os.readdir("hdd0:")[0].length === 0) { return; }
            const part = mountHDDPartition("__common");
            if (!os.readdir(`${part}:/`)[0].includes("POPS")) { return; }
            path = `${part}:/POPS/${game}`;
            break;
        case "mass": path = `mass:/POPS/${game}`; break;
        case "host": path = `${CWD}/POPS/${game}`; break;
    }

    const dirFiles = os.readdir(path)[0];

    if (dirFiles.includes("CHEATS.TXT")) {
        let errObj = {};
        const file = std.open(`${path}CHEATS.TXT`, "r", errObj);
        if (!file) { xlog(`setPOPSCheat(): I/O ERROR - ${std.strerror(errObj.errno)}`); return; }
        const content = file.readAsString();
        file.close();

        const lines = content.split(/\r?\n/);    // Split the content into lines
        const resultLines = []; // To store the processed lines

        // Iterate over the lines in the content
        for (const line of lines) {
            let found = false;

            // Check if the line matches any cheat code
            for (let i = 0; i < cheats.length; i++) {
                const cheat = cheats[i];

                if (line === cheat.code || line === `$${cheat.code}`) {
                    found = true;

                    // If cheat is enabled, add it with `$`
                    if (cheat.enabled) { resultLines.push(`$${cheat.code}`); }
                    // Remove the cheat from the array
                    cheats.splice(i, 1);
                    break;
                }
            }

            // If the line wasn't related to a cheat, keep it unchanged
            if (!found) { resultLines.push(line); }
        }

        // Add remaining enabled cheats to the end
        for (const cheat of cheats) { if (cheat.enabled) { resultLines.push(`$${cheat.code}`); } }

        // Combine all lines into a single string
        ftxtWrite(`${path}CHEATS.TXT`, resultLines.join('\n'));
    }
    else {
        let lines = [];
        lines.push("$SAFEMODE");

        for (let i = 0; i < cheats.length; i++) {
            if (cheats[i].enabled) { lines.push(`$${cheats[i].code}`); }
        }

        if (lines.length > 0) { ftxtWrite(`${path}CHEATS.TXT`, lines.join('\n')); }
    }
}

function getPOPSElfPath(data) {
    const prefix = (data.dev === "mass") ? "XX." : "";
    let path = "mass:/POPS/";
    if (data.dev === "hdd") {
        const part = mountHDDPartition("__common");
        path = `${part}:/POPS/`;
    }

    const elfPath = `${path}${prefix}${data.fname.substring(0, data.fname.length - 3)}ELF`;

    if (!std.exists(elfPath)) { System.copyFile(`${path}POPSTARTER.ELF`, elfPath); }

    return elfPath;
}

//////////////////////////////////////////////////////////////////////////
///*				   			    ART								  *///
//////////////////////////////////////////////////////////////////////////

/*  Get Available Art Paths  */
function getArtPaths() {
    const IDs = System.listDir(PATHS.Art);
    if (IDs.length === 0) { return []; }
    return IDs.map(id => (id.dir && id.name !== "." && id.name !== "..") ? id.name : "").filter(name => name !== "");
}

function findArt(baseFilename, namePattern) {
    if (!baseFilename || !gArt.includes(baseFilename)) { return ""; }
    const artPath = `${PATHS.Art}/${baseFilename}/`;
    const files = os.readdir(artPath)[0];

    // Search for the file in the ART Folder case-insensitively
    for (let i = 0; i < files.length; i++) {
        let item = files[i];
        if (item.length === namePattern.length && item.toLowerCase() === namePattern) {
            return `${artPath}${item}`;
        }
    }

    // No Art was found.
    return "";
}

/*	Searchs for a matching ICO file in the ART folder for a specified string	*/
/*	Returns empty string if not found.											*/
function findICO(baseFilename) { return findArt(baseFilename, "icon0.png"); }

/*	Searchs for a matching BG file in the ART folder for a specified string	*/
/*	Returns empty string if not found.											*/
function findBG(baseFilename) { return findArt(baseFilename, "pic1.png"); }

/**
 * Nome da pasta em ART/ que existe no pendrive para este GameID.
 * Tenta o ID exacto, o formato canónico (SCUS_974.81) e a variante com hífen (SCUS-97481).
 * Sem isto, arte copiada à mão não aparece se o nome da pasta não bater com gArt ou com o ID.
 */
function resolveArtFolderNameForGameId(id) {
    if (!id || typeof id !== "string") {
        return "";
    }
    const t = id.trim();
    if (!t) {
        return "";
    }
    if (!std.exists(PATHS.Art)) {
        return "";
    }
    const candidates = [t];
    const n = normalizePs2ProductCode(t);
    if (n && candidates.indexOf(n) < 0) {
        candidates.push(n);
    }
    const m = t.match(/^([A-Z]{4})_(\d{3})\.(\d{2})$/i);
    if (m) {
        const hyp = m[1].toUpperCase() + "-" + m[2] + m[3];
        if (candidates.indexOf(hyp) < 0) {
            candidates.push(hyp);
        }
    }
    for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        if (std.exists(`${PATHS.Art}${c}/`)) {
            return c;
        }
    }
    return "";
}

function tryDownloadGameArt(gameID, dir) {
    const requests = [];
    const baseUrl = `https://raw.githubusercontent.com/HiroTex/OSD-XMB-ARTDB/refs/heads/main/${dir}/`;
    const gameDir = `${PATHS.Art}${gameID}`;
    const paths = [
        "ICON0.PNG",
        "PIC1.PNG"
    ];

    if (std.exists(gameDir)) { return true; }
    os.mkdir(gameDir);
    for (let i = 0; i < paths.length; i++) {
        let path = paths[i];
        if (std.exists(`${gameDir}/${path}`)) { continue; }
        requests.push(() => {
            let req = new Request();
            MainMutex.unlock();
            req.download(`${baseUrl}${gameID}/${path}`, `${gameDir}/${path}`);
            MainMutex.lock();
            req = null;
        });
    }

    if (requests.length === 0) { return false; }
    requests.forEach((task) => { Tasks.Push(task); });
    Tasks.Push(() => {
        try {
            const dirList = System.listDir(gameDir);
            for (let i = 0; i < dirList.length; i++) {
                const item = dirList[i];
                if (item.size < 32) { os.remove(`${gameDir}/${item.name}`); }
            }

            const rd = os.readdir(gameDir);
            const files = (rd && rd[0]) ? rd[0] : [];
            if (files.length === 0) { System.removeDirectory(gameDir); }
            else { gArt.push(gameID); }
        } catch (eCl) {
            xlog(eCl);
        }
    });

    return true;
}

/**
 * Mesma ideia que tryDownloadGameArt: Tasks + Request + mutex; grava em ART/<localId>/.
 * URL: baseUrl/art/<gameidServidor>/icon0.png|pic1.png (servidor Flask).
 * localId = normalizePs2ProductCode(serverGameId) para bater com GameID / pasta do jogo.
 */
function tryDownloadServerGameArt(baseUrl, serverGameId) {
    if (!baseUrl || !serverGameId) {
        return false;
    }
    const gidRaw = String(serverGameId).trim();
    if (gidRaw.length < 4) {
        return false;
    }
    let localId = normalizePs2ProductCode(gidRaw);
    if (!localId || localId.length < 4) {
        localId = gidRaw;
    }
    const base = baseUrl.replace(/\/$/, "");
    const gameDir = `${PATHS.Art}${localId}`;
    const paths = [
        "icon0.png",
        "pic1.png"
    ];

    if (!std.exists(PATHS.Art)) {
        try {
            os.mkdir(PATHS.Art);
        } catch (e0) {
            xlog(e0);
            return false;
        }
    }
    if (!std.exists(gameDir)) {
        try {
            os.mkdir(gameDir);
        } catch (e1) {
            xlog(e1);
            return false;
        }
    }

    const requests = [];
    for (let i = 0; i < paths.length; i++) {
        const path = paths[i];
        if (std.exists(`${gameDir}/${path}`)) {
            continue;
        }
        const url = `${base}/art/${encodeURIComponent(gidRaw)}/${path}`;
        requests.push(() => {
            let req = new Request();
            MainMutex.unlock();
            req.download(url, `${gameDir}/${path}`);
            MainMutex.lock();
            req = null;
        });
    }

    if (requests.length === 0) {
        registerArtFolder(localId);
        return false;
    }
    requests.forEach((task) => { Tasks.Push(task); });
    Tasks.Push(() => {
        try {
            const dirList = System.listDir(gameDir);
            for (let j = 0; j < dirList.length; j++) {
                const item = dirList[j];
                if (item.size < 32) {
                    os.remove(`${gameDir}/${item.name}`);
                }
            }
            const rd = os.readdir(gameDir);
            const files = (rd && rd[0]) ? rd[0] : [];
            if (files.length === 0) {
                System.removeDirectory(gameDir);
            } else if (!gArt.includes(localId)) {
                gArt.push(localId);
            }
        } catch (eClean) {
            xlog(eClean);
        }
    });

    return true;
}

/** Chamado pelo plugin NET após ISO (mesmo fluxo mental que tryDownloadGameArt). */
function netIsoFetchServerArt(baseUrl, serverGameId) {
    tryDownloadServerGameArt(baseUrl, serverGameId);
}

/** Pedido HTTP ao Flask para o PC passar a servir este .iso no UDPBD (porta UDP 62966). */
function netUdpbdPrepareIso(baseUrl, isoFilename) {
    const tmp = PATHS.XMB + "temp/udpbd_prepare.json";
    const base = baseUrl.replace(/\/$/, "");
    const url = `${base}/udpbd/prepare?file=${encodeURIComponent(isoFilename)}`;
    try {
        if (!std.exists(PATHS.XMB + "temp")) {
            os.mkdir(PATHS.XMB + "temp");
        }
        MainMutex.unlock();
        const req = new Request();
        req.download(url, tmp);
        MainMutex.lock();
        if (!std.exists(tmp)) {
            return false;
        }
        const raw = std.loadFile(tmp);
        os.remove(tmp);
        const j = JSON.parse(raw);
        if (j && j.ok === true) {
            if (j.neutrino_pack_version) {
                xlog(
                    "UDPBD: prepare OK; Neutrino no PC (pack) " +
                        j.neutrino_pack_version +
                        " — confira APPS/neutrino/version.txt e modules no USB."
                );
            }
        } else if (j && j.error) {
            xlog("UDPBD prepare: " + j.error);
        }
        return !!(j && j.ok === true);
    } catch (e) {
        MainMutex.lock();
        xlog(e);
        return false;
    }
}

/**
 * Agenda GET /api/play/report?clear=1 fora do UIHandler (Tasks.Process), para não fazer
 * MainMutex.unlock durante o redraw — isso causava crashes intermitentes na consola.
 * Throttle ~4s evita rajadas ao mudar de submenu.
 * Na primeira vez que o XMB principal fica activo (arranque), não pedir clear: o unlock+HTTP
 * no boot gerava tela preta; voltando de submenu o painel PC ainda é actualizado.
 */
var _xmbPcClearLastScheduleMs = 0;
var _xmbPcClearSkipFirstMainUi = true;
function xmbScheduleClearPlayingOnPcFromMainUi() {
    try {
        if (_xmbPcClearSkipFirstMainUi) {
            _xmbPcClearSkipFirstMainUi = false;
            return;
        }
        var now = Date.now();
        if (_xmbPcClearLastScheduleMs && (now - _xmbPcClearLastScheduleMs) < 4000) {
            return;
        }
        _xmbPcClearLastScheduleMs = now;
        Tasks.Push(function () {
            xmbReportClearPlayingOnPc();
        });
    } catch (e) {
        xlog(e);
    }
}

/**
 * Indica ao PC que o XMB está no ecrã principal — termina "jogo atual" no painel (/api/play/status).
 * Deve correr dentro de Tasks.Push (mutex gerido pelo worker) ou com mutex já desbloqueado como o resto da rede.
 * Usa netiso.cfg url + report_key opcional. Ficheiro temp único por pedido.
 */
function xmbReportClearPlayingOnPc() {
    try {
        let base = "";
        try {
            const c = CfgMan.Get("netiso.cfg");
            let u = c.url || c.URL;
            if (!u || typeof u !== "string") {
                u = "http://192.168.0.140:5000";
            }
            base = String(u).replace(/\/$/, "");
        } catch (eCfg) {
            xlog(eCfg);
            return;
        }
        if (!base) {
            return;
        }
        let keyQs = "";
        try {
            const c = CfgMan.Get("netiso.cfg");
            const k = c && (c.report_key != null || c.REPORT_KEY != null) ? String(c.report_key != null ? c.report_key : c.REPORT_KEY).trim() : "";
            if (k) {
                keyQs = "&key=" + encodeURIComponent(k);
            }
        } catch (eK) {
            xlog(eK);
        }
        const url = base + "/api/play/report?clear=1" + keyQs;
        const tmp = PATHS.XMB + "temp/play_report_clr_" + String(Date.now()) + ".json";
        if (!std.exists(PATHS.XMB + "temp")) {
            try {
                os.mkdir(PATHS.XMB + "temp");
            } catch (eMk) {
                xlog(eMk);
            }
        }
        MainMutex.unlock();
        try {
            const req = new Request();
            req.download(url, tmp);
        } catch (e1) {
            xlog(e1);
        } finally {
            MainMutex.lock();
        }
        try {
            if (std.exists(tmp)) {
                os.remove(tmp);
            }
        } catch (e2) {
            xlog(e2);
        }
    } catch (eTop) {
        xlog(eTop);
    }
}

/**
 * Avisar o PC qual ISO está a ser lançado (/api/play/report) — desligado: o GET síncrono com
 * MainMutex.unlock() antes do Request().download travava ao confirmar jogo (OPL SMB / UDPBD).
 * O painel "a jogar" no cliente deixa de ser actualizado pelo XMB; leitura SMB do ISO continua possível.
 */
function xmbReportPlayingToPc(baseUrl, isoRelPath, displayName, gameId) {
}

function neutrinoSaveLastPlayedEntry() {
    const ncfg = CfgMan.Get("neutrino.cfg");
    ncfg["last"] = DashUI.SelectedItem.Name;
    CfgMan.Set("neutrino.cfg", ncfg);
    if (DashUI.SelectedItem.GameID) {
        setHistoryEntry(DashUI.SelectedItem.GameID.toUpperCase());
    }
}

/**
 * O neutrino.elf não aceita ip= na linha de comandos (só flags -bsd/-dvd/...).
 * Atualiza args ip= em bsd-udpbd*.toml e bsd-udpfs.toml (ministack) antes de lançar.
 * @param {string} ip IPv4
 * @returns {boolean} true se pelo menos um ficheiro foi atualizado
 */
function udpbdSyncTomlPs2Ip(ip) {
    const v = ip ? String(ip).trim() : "";
    if (!v || v === "-" || !/^\d{1,3}(\.\d{1,3}){3}$/.test(v)) {
        xlog("udpbdSyncTomlPs2Ip: IP invalido");
        return false;
    }
    const names = ["bsd-udpbd.toml", "bsd-udpbd-hdd.toml", "bsd-udpfs.toml"];
    let ok = false;
    for (let i = 0; i < names.length; i++) {
        const fp = PATHS.Neutrino + "config/" + names[i];
        if (!std.exists(fp)) {
            xlog("udpbdSyncTomlPs2Ip: falta " + fp);
            continue;
        }
        let txt;
        try {
            txt = std.loadFile(fp);
        } catch (e) {
            xlog(e);
            continue;
        }
        if (!/"ip=[0-9.]+"/.test(txt)) {
            xlog("udpbdSyncTomlPs2Ip: sem ip= em " + fp);
            continue;
        }
        try {
            const out = txt.replace(/"ip=[0-9.]+"/g, '"ip=' + v + '"');
            ftxtWrite(fp, out);
            // Lê de volta e loga o valor final (pra eliminar “editei mas era outro ficheiro”).
            try {
                const rb = std.loadFile(fp);
                const m = rb.match(/"ip=([0-9.]+)"/);
                xlog("udpbdSyncTomlPs2Ip: " + fp + " => ip=" + (m ? m[1] : "?"));
            } catch (eRb) {
                xlog("udpbdSyncTomlPs2Ip: falha readback " + fp);
                xlog(eRb);
            }
            ok = true;
        } catch (e2) {
            xlog(e2);
        }
    }
    return ok;
}

/**
 * Confirma que os módulos/config de rede do Neutrino existem no dispositivo.
 * Se faltar algo, loga o que falta e retorna false (para evitar cair no browser "sem UDP").
 * @param {string} mode "udpfs" | "udpbd"
 * @returns {boolean}
 */
function neutrinoCheckNetStackFiles(mode) {
    const root = PATHS.Neutrino;
    const cfg = root + "config/";
    const mod = root + "modules/";
    const miss = [];

    // Base (sempre)
    const baseMods = ["smap.irx", "ministack.irx"];
    for (let i = 0; i < baseMods.length; i++) {
        const fp = mod + baseMods[i];
        if (!std.exists(fp)) { miss.push(fp); }
    }

    if (String(mode).toLowerCase() === "udpfs") {
        const udpfsMods = ["iomanX.irx", "fileXio.irx", "udpfs_ioman.irx", "udpfs_fhi.irx"];
        for (let j = 0; j < udpfsMods.length; j++) {
            const fp2 = mod + udpfsMods[j];
            if (!std.exists(fp2)) { miss.push(fp2); }
        }
        if (!std.exists(cfg + "bsd-udpfs.toml")) { miss.push(cfg + "bsd-udpfs.toml"); }
    } else {
        if (!std.exists(mod + "udpbd.irx") && !std.exists(mod + "udpfs_bd.irx")) {
            miss.push(mod + "udpbd.irx (ou udpfs_bd.irx)");
        }
        if (!std.exists(cfg + "bsd-udpbd.toml")) { miss.push(cfg + "bsd-udpbd.toml"); }
    }

    // TOML depende de i_dev9_hidden
    if (!std.exists(cfg + "i_dev9_hidden.toml")) {
        miss.push(cfg + "i_dev9_hidden.toml");
    }

    if (miss.length > 0) {
        xlog("Neutrino rede: FALTANDO ficheiros (sem isto não sai UDP):");
        for (let k = 0; k < miss.length; k++) { xlog(" - " + miss[k]); }
        return false;
    }
    xlog("Neutrino rede: módulos/config OK (" + mode + ")");
    return true;
}

function getGameArt(game, dir = "PS2") {
    try {
        if (!game.GameID || game.GameID === getLocalText(XMBLANG.UNKNOWN)) { return true; }

        const id = game.GameID;

        /* ISOs do servidor (net_1): arte não está no manifest gNetArt — mesmo fluxo que tryDownloadGameArt + Tasks */
        if (game.Data && game.Data.baseUrl && game.Data.gameid && UserConfig.Network === 1) {
            const gid = String(game.Data.gameid).trim();
            if (gid.length > 3) {
                if (tryDownloadServerGameArt(game.Data.baseUrl, gid)) {
                    Tasks.Push(() => {
                        try {
                            getGameArt(game, dir);
                        } catch (eRe) {
                            xlog(eRe);
                        }
                    });
                    return false;
                }
            }
        }

        const localFolder = resolveArtFolderNameForGameId(id);
        if (localFolder) {
            if (!gArt.includes(localFolder)) {
                gArt.push(localFolder);
            }
            const ico0 = findICO(localFolder);
            const pic1 = findBG(localFolder);
            if (ico0) { game.CustomIcon = ico0; }
            if (pic1) { game.CustomBG = pic1; }
            return true;
        }

        if (!gArt.includes(id)) {
            if ((UserConfig.Network !== 1) || !gNetArt.includes(id)) { return true; }
            if (tryDownloadGameArt(id, dir)) {
                Tasks.Push(() => {
                    try {
                        getGameArt(game, dir);
                    } catch (eRe2) {
                        xlog(eRe2);
                    }
                });
                return false;
            }
            return true;
        }

        const ico0   = findICO(id);
        const pic1   = findBG(id);

        if (ico0)   { game.CustomIcon = ico0; }
        if (pic1)   { game.CustomBG   = pic1; }

        return true;
    } catch (e) {
        xlog(e);
        return true;
    }
}

/** Regista pasta ART/<gameId> em gArt para findICO/findBG funcionarem (após arte vinda do servidor local). */
function registerArtFolder(gameId) {
    if (!gameId || typeof gameId !== "string") {
        return;
    }
    const id = gameId.trim();
    if (id.length < 4) {
        return;
    }
    const dir = `${PATHS.Art}${id}/`;
    if (!std.exists(dir)) {
        return;
    }
    if (!gArt.includes(id)) {
        gArt.push(id);
    }
}

//////////////////////////////////////////////////////////////////////////
///*				   		   Plugin System						  *///
//////////////////////////////////////////////////////////////////////////

function validatePlugin(plg) {
  return (
    (("Name" in plg) && (typeof plg.Name === "string") || (Array.isArray(plg.Name))) &&
    (("Icon" in plg) && ((typeof plg.Icon === "number") || (typeof plg.Icon === "string"))) &&
    (("Category" in plg) && (typeof plg.Category === "number")) &&
    (("Type" in plg) && (["ELF", "CODE", "SUBMENU", "DIALOG"].includes(plg.Type)))
  );
}
function AddNewPlugin(Plugin) {
    if (!validatePlugin(Plugin)) { return false; }
    const item = DashCatItems[Plugin.Category].Items.length;
    DashCatItems[Plugin.Category].Items[item] = Plugin;
}
function FindDashIcon(targetName) {
    for (let i = 0; i < DashIconsInfo.length; i++) {
        if (DashIconsInfo[i].name === targetName) { return i; }
    }

    return -1;
}
function ExecuteItem(Item) {
	if (!Item) { return; }
	if (DashUI.SubMenu.Level < 0) {
		const safe = ((UserConfig.ParentalSet === 0) || (('Safe' in Item) && (Item.Safe === "true")));
		if (!safe) { OpenDialogParentalCheck(Item); return; }
	}
	DashUIObjectHandler(Item);
}
function ExecuteSpecial() {
	switch(gExit.Type) {
        case 0: System.exitToBrowser(); break;
        case 1: gExit.To = "main.js"; break;
	}
}
/** ms a dormir na PS2 após prepare+args e antes de loadELF (Neutrino UDPFS/UDPBD). netiso udpbd_launch_delay_ms; 0=off. */
function getNetIsoUdpbdLaunchDelayMs() {
    let ms = 450;
    try {
        const nc = CfgMan.Get("netiso.cfg");
        const d = nc.udpbd_launch_delay_ms;
        if (d != null && String(d).trim() !== "") {
            const n = parseInt(String(d).trim(), 10);
            if (!isNaN(n) && n >= 0 && n <= 8000) {
                ms = n;
            }
        }
    } catch (e) {
        xlog(e);
    }
    return ms;
}

function ExecuteELF() {
    let skipLoad = false;
    if ('Code' in gExit.Elf) {
        try {
            gExit.Elf.Code();
        } catch (e) {
            xlog(e);
        }
        skipLoad = !!(gExit.Elf && gExit.Elf.__skipLoad);
    }
    if (skipLoad) {
        if (gExit.Elf) {
            delete gExit.Elf.__skipLoad;
        }
        DashUI.ExitState = 5;
        return;
    }
    const forceNetPause = !!(gExit && gExit.Elf && gExit.Elf.__udpbdNet === true);
    if (neutrinoElfUsesUdpNet() || forceNetPause) {
        const delayMs = getNetIsoUdpbdLaunchDelayMs();
        if (delayMs > 0) {
            xlog("UDP: pausa antes do loadELF " + delayMs + " ms (netiso udpbd_launch_delay_ms)");
            try {
                MainMutex.unlock();
                os.sleep(delayMs);
                MainMutex.lock();
            } catch (eS) {
                try {
                    MainMutex.lock();
                } catch (eL) {}
                xlog(eS);
            }
        }
    }
    if (Array.isArray(gExit.Elf.Path)) {
        let pick = "";
        for (let i = 0; i < gExit.Elf.Path.length; i++) {
            const p = resolveFilePath(gExit.Elf.Path[i]);
            if (std.exists(p)) {
                pick = p;
                break;
            }
        }
        gExit.Elf.Path = pick || (gExit.Elf.Path[0] ? resolveFilePath(gExit.Elf.Path[0]) : "");
    }
    if (!gExit.Elf.Path || typeof gExit.Elf.Path !== "string") {
        xlog("ExecuteELF: Path invalido");
        DashUI.ExitState = 5;
        return;
    }
    const keepNetForOplSmb = gExit.Elf && gExit.Elf.__keepNetForSmb === true;
    if (!keepNetForOplSmb && gExit.Elf.Path.substring(0, 3) !== "pfs") {
        umountHDD();
    }
    iopResNet(gExit.Elf.Path);
    if (gExit.Elf.Path && gExit.Elf.Path.indexOf("neutrino.elf") >= 0) {
        const a = gExit.Elf.Args;
        const argLine = Array.isArray(a) ? a.join(" ") : String(a);
        xlog("Neutrino loadELF: " + gExit.Elf.Path + " | " + argLine);
    }
	console.log( `Executing Elf: ${gExit.Elf.Path}\n With Args: [ ${gExit.Elf.Args} ]`);
	System.loadELF(gExit.Elf.Path, gExit.Elf.Args, gExit.Elf.RebootIOP);
}
function ResetIOP(path) {
    let dev = getDeviceName(path);
    IOP.reset();
    switch (dev) {
        case "CDFS":
        case "CDFS0": IOP.loadModule("cdfs"); break;
        case "ATA": IOP.loadModule("ata_bd"); break;
        case "MX4SIO": IOP.loadModule("mx4sio_bd"); break;
        case "USB": IOP.loadModule("usbmass_bd"); break;
        case "UDPBD": IOP.loadModule("smap_udpbd"); break;
        case "HDD": IOP.loadModule("ps2fs"); break;
        case "MC":
        case "MC0":
        case "MC1": IOP.loadModule("mcman"); break;
        case "MMCE":
        case "MMCE0":
        case "MMCE1": IOP.loadModule("mmceman"); break;
    }

    os.sleep(1000);
}

/** Args finais do Neutrino em modo PC (UDPBD bloco ou UDPFS pasta). */
function neutrinoElfUsesUdpNet() {
    const e = typeof gExit !== "undefined" && gExit && gExit.Elf ? gExit.Elf : null;
    if (!e || !Array.isArray(e.Args)) {
        return false;
    }
    const s = e.Args.join(" ");
    return (
        s.indexOf("-bsd=udpbd") >= 0 ||
        s.indexOf("-bsd=udpfs") >= 0 ||
        s.indexOf("bdfs:udp0p0") >= 0 ||
        s.indexOf("-dvd=udpfs:") >= 0
    );
}

/**
 * Sem rede no XMB: não resetar IOP (USB local estável).
 * Com rede + Neutrino UDPBD/UDPFS: não ResetIOP — senão IOP.reset()+só usbmass_bd mata Dev9/SMAP antes do neutrino carregar smap/ministack.
 * Com rede + Neutrino USB local: NetDeinit + ResetIOP como antes.
 */
function iopResNet(path) {
    if (neutrinoElfUsesUdpNet()) {
        // Neutrino (UDPFS/UDPBD) inicializa a própria stack. Mexer no DEV9 aqui pode matar o arranque
        // (sintoma típico: não sai nenhum UDP no PC, cai no browser).
        xlog("iopResNet: Neutrino rede — sem NetDeinit/IOP.reset antes do loadELF");
        return;
    }
    const e = typeof gExit !== "undefined" && gExit && gExit.Elf ? gExit.Elf : null;
    if (e && e.__keepNetForSmb === true) {
        // OPL via SMB precisa da stack de rede ainda viva; NetDeinit/ResetIOP aqui costuma crashar ou matar o jogo SMB.
        xlog("iopResNet: OPL SMB — sem NetDeinit antes do loadELF");
        return;
    }
    if (NetInfo.IP === "-") { return; }
    NetDeinit();
    ResetIOP(path);
}

//////////////////////////////////////////////////////////////////////////
///*				   			 ICON.SYS							  *///
//////////////////////////////////////////////////////////////////////////

const IconSysMap81 = {
    0x40: ' ', 0x46: ':', 0x5E: '/',
    0x69: '(', 0x6A: ')',
    0x6D: '[', 0x6E: ']',
    0x6F: '{', 0x70: '}',
    0x7C: '-'
};

function parseIconSysTitle(path, name) {
    let ret = name;
    const syspath = `${path}${name}`;
    const files = os.readdir(syspath)[0];
    let fileExist = files.includes("icon.sys");
    if (!fileExist) { return ret; }

    let file = false;
    try {
        file = os.open(`${syspath}/icon.sys`, os.O_RDONLY);
        if (file < 0) { throw new Error(`Could not open ${syspath}/icon.sys.`); }

        const magic = new Uint8Array(4);
        let match = true;
        os.seek(file, 0, std.SEEK_SET);
        os.read(file, magic.buffer, 0, 4);

        // check magic
        if (
            magic[0] !== 0x50 || // 'P'
            magic[1] !== 0x53 || // 'S'
            magic[2] !== 0x32 || // '2'
            magic[3] !== 0x44    // 'D'
        ) {
            throw new Error(`${syspath}/icon.sys is not a valid icon.sys file.`);
        }


        if (!match) { throw new Error(`${syspath}/icon.sys is not a valid icon.sys file.`); }

        const linebreak = new Uint8Array(2);
        os.seek(file, 6, std.SEEK_SET);
        os.read(file, linebreak.buffer, 0, 2);
        const linepos = linebreak[0] >> 1;
        const title = new Uint8Array(68);
        os.seek(file, 192, std.SEEK_SET);
        os.read(file, title.buffer, 0, 68);

        let decoded = IconSysDecodeTitle(title);// check if title is only question marks
        if (decoded.replace(/\?/g, '').length === 0) {
            ret = name;
        } else {
            ret = decoded.slice(0, linepos) + " " + decoded.slice(linepos);
        }

    } catch (e) {
        xlog(e);
    } finally {
        if (file) { os.close(file); }
    }

    return ret;
}

// This will retrieve a UTF-8 string from the icon.sys S-JIS encoded Title
function IconSysDecodeTitle(strIn) {
    const out = [];

    for (let i = 0; i < 68; i += 2) {
        const t1 = strIn[i];
        const t2 = strIn[i + 1];

        if (t1 === 0x00) {
            if (t2 === 0x00) break;
            out.push('?');
            continue;
        }

        if (t1 === 0x81) {
            out.push(IconSysMap81[t2] || '?');
            continue;
        }

        if (t1 === 0x82) {
            if (t2 >= 0x4F && t2 <= 0x7A) {
                out.push(String.fromCharCode(t2 - 31));
            } else if (t2 >= 0x81 && t2 <= 0x9B) {
                out.push(String.fromCharCode(t2 - 32));
            } else if (t2 === 0x3F) {
                out.push(' ');
            } else {
                out.push('?');
            }
            continue;
        }

        out.push('?');
    }

    return out.join('');
}

//////////////////////////////////////////////////////////////////////////
///*				   			 HISTORY							  *///
//////////////////////////////////////////////////////////////////////////

// Functions to manage the history file on the memory card
function getSystemDataPath() {
    const tmp = std.open("rom0:ROMVER", "r");
    const ROMVER = tmp.readAsString();
    tmp.close();

    switch (ROMVER[4]) {
        case 'X':
        case 'H':
        case 'A': return "BADATA-SYSTEM";
        case 'C': return "BCDATA-SYSTEM";
        case 'E': return "BEDATA-SYSTEM";
        case 'T':
        case 'J': return "BIDATA-SYSTEM";
    }
}
function getCurrentDOSDate() {
    const year = gTime.year - 1980; // DOS date starts at 1980
    const month = gTime.month; // JS months are 0-based
    const day = gTime.day;
    return (year << 9) | (month << 5) | day;
}
function getMcHistoryFilePath() {
	const systemPath = getSystemDataPath();
	let path = `mc0:/${systemPath}/history`;
    if (!std.exists(path)) {
		// try memory card 2
		path = `mc1:/${systemPath}/history`;
		if (!std.exists(path)) { path = ""; }
    }
	return path;
}
function getMcHistory() {
    let data = [];
    const historyPath = getMcHistoryFilePath();
    if (historyPath === "") {
        console.log(`ERROR: Could not find history file`);
        return data;
    }

    const file = os.open(`mc0:/${getSystemDataPath()}/history`, os.O_RDONLY);
    if (file < 0) {
        console.log(`ERROR: Could not open history file`);
        return data;
    }

    const entrySize = 0x16;
    const buffer = new Uint8Array(entrySize);

    while (os.read(file, buffer.buffer, 0, entrySize) === entrySize) {
        const name = String.fromCharCode(...buffer.subarray(0, 0x10)).replace(/\x00+$/, '');
        const playCount = buffer[0x10];
        const bitmask = buffer[0x11];
        const bitshift = buffer[0x12];
        const dosDate = (buffer[0x14] | (buffer[0x15] << 8)); // Little-endian

        data.push({ name, playCount, bitmask, bitshift, dosDate });
    }

    os.close(file);

	return data;
}
function setMcHistory(entries) {
    const path = getSystemDataPath();
    let historyPath = getMcHistoryFilePath();
    let flags = os.O_RDWR;
    if (historyPath === "") { // file must be created
        // Make memory card path on slot 1
        os.mkdir(`mc0:/${path}`);
        historyPath = `mc0:/${path}/history`;
        flags = flags | os.O_CREAT;
    }
    const file = os.open(historyPath, flags);
    if (file < 0) {
        console.log(`ERROR: Could not open history file on ${historyPath}`);
        return false;
    }

    const entrySize = 0x16;
    const buffer = new Uint8Array(entrySize);
    for (const obj of entries) {
        buffer.fill(0);
        for (let i = 0; i < obj.name.length; i++) {
            buffer[i] = obj.name.charCodeAt(i);
        }
        buffer[0x10] = obj.playCount;
        buffer[0x11] = obj.bitmask;
        buffer[0x12] = obj.bitshift;
        buffer[0x13] = 0x00; // Padding zero
        buffer[0x14] = obj.dosDate & 0xFF;
        buffer[0x15] = (obj.dosDate >> 8) & 0xFF;

        os.write(file, buffer.buffer, 0, entrySize);
    }

    os.close(file);
    return true;
}
function setHistoryEntry(name) {
    const objects 	  = getMcHistory();
    const currentDate = getCurrentDOSDate();
    let found = false;
    let emptySlot = false;

    for (const obj of objects) {
        if (obj.name === name) {
            // If name exists, update play count and date
            obj.playCount = Math.min(obj.playCount + 1, 0x3F);
            obj.dosDate = currentDate;
            found = true;
            break;
        } else if (!emptySlot && obj.name === "") {
            // Store the first empty slot found
            emptySlot = obj;
        }
    }

    if (!found) {
        if (emptySlot) {
            // Reuse an empty slot
            emptySlot.name = name;
            emptySlot.playCount = 0x01;
            emptySlot.bitmask = 0x01;
            emptySlot.bitshift = 0x00;
            emptySlot.dosDate = currentDate;
        }
        else if (objects.length < 21) {
            // Append a new entry if the list is not full
            objects.push({
                name: name,
                playCount: 0x01,
                bitmask: 0x01,
                bitshift: 0x00,
                dosDate: currentDate
            });
        }
        else {
            xlog("ERROR: No space left to add a new entry.");
			return;
        }
    }

    return setMcHistory(objects);
}

//////////////////////////////////////////////////////////////////////////
///*				   			 Helpers							  *///
//////////////////////////////////////////////////////////////////////////

function cubicEaseOut(t) { return 1 - Math.pow(1 - t, 3); }
function cubicEaseIn(t) { return Math.pow(1 - t, 3); }
function createFade() {	return { In: false,	Progress: 0.0, Running: false }; }
function alphaCap(a) {	if (a < 0) { a = 0; } if (a > 128) { a = 128; }	return a; }
function getTimerSec(t) { return ~~(Timer.getTime(t) / 100000) }
function getLocalText(t) { return ((Array.isArray(t)) ? t[UserConfig.Language] : t); }
function getFadeProgress(fade) { return fade.Running ? (fade.In ? cubicEaseOut(fade.Progress) : cubicEaseIn(fade.Progress)) : 1; }
function interpolateColorObj(color1, color2, t) {
    return {
        R: Math.fround(color1.R + (color2.R - color1.R) * t),
        G: Math.fround(color1.G + (color2.G - color1.G) * t),
        B: Math.fround(color1.B + (color2.B - color1.B) * t),
    };
}

//////////////////////////////////////////////////////////////////////////
///*				   			   DEBUG							  *///
//////////////////////////////////////////////////////////////////////////

function DbgHandler() {
	if (!gDebug) { return; }

    const DebugInfo = [];
    const mem = System.getMemoryStats();
	DebugInfo.push(`${Screen.getFPS(360)}  FPS`);
	DebugInfo.push(`RAM USAGE: ${Math.floor(mem.used / 1024)}KB / ${Math.floor(ee_info.RAMSize / 1024)}KB`);
	DebugInfo.push(`WIDTH: ${ScrCanvas.width} HEIGHT: ${ScrCanvas.height}`);
    DebugInfo.push(`DATE: ${gTime.day}/${gTime.month}/${gTime.year} ${gTime.hour}:${gTime.minute}:${gTime.second}`);

    TxtPrint({ Text: DebugInfo, Position: { X: 5, Y: ScrCanvas.height - ((DebugInfo.length + 1) * 16)}});
    xlogProcess();
}

/** Grava gDbgTxt em XMB/log.txt (append). Não usa ftxtWrite para evitar reentrada xlog↔erro I/O. */
function xlogFlushLogs() {
    if (gDbgTxt.length < 1) {
        return;
    }
    const chunk = gDbgTxt.join("\n") + "\n";
    const path = `${PATHS.XMB}log.txt`;
    let file = false;
    try {
        const errObj = {};
        file = std.open(path, "a", errObj);
        if (!file) {
            console.log("xlogFlushLogs: std.open a falhou errno=" + errObj.errno);
            return;
        }
        file.puts(chunk);
        file.flush();
        gDbgTxt.length = 0;
    } catch (e) {
        console.log("xlogFlushLogs:", e);
    } finally {
        if (file) {
            file.close();
        }
    }
}

function xlog(l) {
    let msg = l;
    if (l instanceof Error) {
        msg = l.message || String(l);
    } else if (typeof l !== "string") {
        msg = String(l);
    }
    const hours = String(gTime.hour).padStart(2, "0");
    const minutes = String(gTime.minute).padStart(2, "0");
    const seconds = String(gTime.second).padStart(2, "0");
    const milliseconds = String(gTime.millisecond).padStart(3, "0");
    const line = `[ ${hours}:${minutes}:${seconds}:${milliseconds} ] ${msg}`;
    console.log(line);

    gDbgTxt.push(line);
    /* Sempre escrever em log.txt (antes só com gDebug; na PS2 o console é inútil). */
    xlogFlushLogs();
}

function xlogProcess() {
    xlogFlushLogs();
}

//////////////////////////////////////////////////////////////////////////
///*				   			 Init Work							  *///
//////////////////////////////////////////////////////////////////////////

let gExit 		= {};
let gDebug      = false;
let gDbgTxt     = [];
let gArt     	= getArtPaths();
let gDevices    = getAvailableDevices();
let ScrCanvas 	= Screen.getMode();
const ee_info   = System.getCPUInfo();

/* GS mode per entry (some modes repeat NTSC/PAL — use GetCurrentVmodeIndex for selection). */
const vmodes = [
    Screen.NTSC, Screen.PAL, Screen.DTV_480p, Screen.DTV_720p, Screen.DTV_1080i,
    Screen.NTSC, Screen.PAL
];

function GetCurrentVmodeIndex() {
    if (ScrCanvas.mode === Screen.NTSC) {
        return ScrCanvas.interlace === Screen.PROGRESSIVE ? 5 : 0;
    }
    if (ScrCanvas.mode === Screen.PAL) {
        return ScrCanvas.interlace === Screen.PROGRESSIVE ? 6 : 1;
    }
    if (ScrCanvas.mode === Screen.DTV_480p) { return 2; }
    if (ScrCanvas.mode === Screen.DTV_720p) { return 3; }
    if (ScrCanvas.mode === Screen.DTV_1080i) { return 4; }
    return 0;
}

function ApplyVmodeFromIndex(index) {
    const wSd = (UserConfig.Aspect === 0) ? 640 : 704;
    ScrCanvas.mode = vmodes[index];
    switch (index) {
        case 0:
            ScrCanvas.width = wSd;
            ScrCanvas.height = 480;
            ScrCanvas.interlace = Screen.INTERLACED;
            ScrCanvas.field = Screen.FIELD;
            break;
        case 1:
            ScrCanvas.width = wSd;
            ScrCanvas.height = 512;
            ScrCanvas.interlace = Screen.INTERLACED;
            ScrCanvas.field = Screen.FIELD;
            break;
        case 2:
            ScrCanvas.width = wSd;
            ScrCanvas.height = 480;
            ScrCanvas.interlace = Screen.PROGRESSIVE;
            ScrCanvas.field = Screen.FRAME;
            break;
        case 3:
            /* DTV_720p output: keep SD framebuffer (same VRAM as 480p). Full 1280x720 would OOM PS2 VRAM. */
            ScrCanvas.width = wSd;
            ScrCanvas.height = 480;
            ScrCanvas.interlace = Screen.PROGRESSIVE;
            ScrCanvas.field = Screen.FRAME;
            break;
        case 4:
            /* DTV_1080i output: same — internal buffer stays SD-sized. */
            ScrCanvas.width = wSd;
            ScrCanvas.height = 480;
            ScrCanvas.interlace = Screen.INTERLACED;
            ScrCanvas.field = Screen.FIELD;
            break;
        case 5:
            /* NTSC 240p-style (progressive): same idea as OPL menu option — menos flicker em CRT. */
            ScrCanvas.width = wSd;
            ScrCanvas.height = 480;
            ScrCanvas.interlace = Screen.PROGRESSIVE;
            ScrCanvas.field = Screen.FIELD;
            break;
        case 6:
            /* PAL 288p-style (progressive). */
            ScrCanvas.width = wSd;
            ScrCanvas.height = 512;
            ScrCanvas.interlace = Screen.PROGRESSIVE;
            ScrCanvas.field = Screen.FIELD;
            break;
        default:
            ScrCanvas.width = wSd;
            ScrCanvas.height = 480;
            ScrCanvas.interlace = Screen.INTERLACED;
            ScrCanvas.field = Screen.FIELD;
            ScrCanvas.mode = vmodes[0];
            break;
    }
}

ScrCanvas.width = (UserConfig.Aspect === 0) ? 640 : 704;
if ('Vmode' in UserConfig) {
    let vi = UserConfig.Vmode | 0;
    if (vi < 0 || vi >= vmodes.length) { vi = 0; }
    ApplyVmodeFromIndex(vi);
}
Screen.setMode(ScrCanvas);
let TmpCanvas = Screen.getMode();

ftxtWrite(`${PATHS.XMB}log.txt`, ""); // Init Log File.
console.log("INIT LIB: SYSTEM COMPLETE");
