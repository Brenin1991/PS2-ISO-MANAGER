//////////////////////////////////////////////////////////////////////////
///*				   			  AUDIO								  *///
/// 				   		  										   ///
///		  This handles all audio related functions and systems.		   ///
/// 				   		  										   ///
//////////////////////////////////////////////////////////////////////////

const _snd = `${PATHS.Theme}Original/sound/`;

/** Só ADP para SFX: Sound.Sfx carrega para RAM (sem fseek contínuo). Sound.Stream+rewind causava TLB em _fseeko_r. */
function _audioPathOk(p) {
    return (typeof std !== "undefined" && std.exists && std.exists(p));
}

function _loadSfxAdp(name) {
    const a = `${_snd}${name}.adp`;
    if (!_audioPathOk(a)) { return false; }
    try {
        return Sound.Sfx(a);
    } catch (e) {
        if (typeof xlog === "function") { xlog(`audio: Sfx ${a}`); }
    }
    return false;
}

const Sounds = {
    BOOT: `${_snd}snd_boot.wav`,
    CURSOR: _loadSfxAdp("cursor"),
    CONFIRM: _loadSfxAdp("confirm"),
    CANCEL: _loadSfxAdp("cancel")
};

let CurrentBGM = false;

function SoundHandler() {
    if (CurrentBGM && !CurrentBGM.playing()) {
        CurrentBGM.free();
        CurrentBGM = false;
    }
}

function playSfx(sfx) {
    if (!sfx) { return; }
    if (CWD.substring(0, 4) === "mmce") { return; }
    try {
        sfx.play();
    } catch (e) {}
}

function playBgm(soundPath) {
    if (!soundPath) { return; }
    if (CWD.substring(0, 4) === "mmce") { return; }
    if (!_audioPathOk(soundPath)) { return; }
    try {
        const bgm = Sound.Stream(soundPath);
        bgm.play();
        CurrentBGM = bgm;
    } catch (e) {}
}

const PlayBootSfx    = () => playBgm(Sounds.BOOT);
const PlayCursorSfx  = () => playSfx(Sounds.CURSOR);
const PlayConfirmSfx = () => playSfx(Sounds.CONFIRM);
const PlayCancelSfx  = () => playSfx(Sounds.CANCEL);

//////////////////////////////////////////////////////////////////////////
///*				   			 Init Work							  *///
//////////////////////////////////////////////////////////////////////////

Sound.setVolume(100);
console.log("INIT LIB: AUDIO COMPLETE");
