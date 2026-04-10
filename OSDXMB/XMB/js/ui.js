//////////////////////////////////////////////////////////////////////////
///*				   			    UI								  *///
/// 				   		  										   ///
///		  The Main User Interface Module, with all the Graphical	   ///
///					Interface objects and animations.				   ///
/// 				   		  										   ///
//////////////////////////////////////////////////////////////////////////

const UICONST 		 = {};
const DashUI 		 = {};
const DashElements 	 = {};
const DashIcons 	 = [];
const DashCatItems 	 = [];
const DashPluginData = [];
const DashIconsInfo  = JSON.parse(std.loadFile(`${PATHS.XMB}dash/dash_icons.json`));

//////////////////////////////////////////////////////////////////////////
///*				   			 Handlers							  *///
//////////////////////////////////////////////////////////////////////////

function UIHandler() {
    DashUIStateHandler();

	switch(DashUI.State.Current) {
		case 0: // Boot Sequence
			BootSequenceHandler();
			break;
		case 1: // Main User Interface
		case 2: // Sub Menu Interface
		case 3: // Context Interface
        case 4: // Message Interface
            DrawLayersBg();
            DrawUIObjectBg();
            DiscTray.Process();
			break;
		case 5: // Exit Interface
			ExitSequenceHandler();
			break;
	}

	DashUIAnimationHandler();
	DrawUICategoryItems();
	DrawUICategories();
    DrawUISubMenu();
    DrawUIPIC2();
    DrawUIClock();
    DrawUIOptionBox();
	DrawUIContext();
	UpdateIconSpinning();
    FontGlowUpdate();
    OvHandler();
}
function OvHandler() {
    DashUI.Overlay.Alpha = alphaCap(DashUI.Overlay.Alpha);
    if (DashUI.Overlay.Alpha < 1) { return; }
    const ovColor = Color.setA(DashUI.Overlay.Color, DashUI.Overlay.Alpha);
    Draw.rect(0, 0, ScrCanvas.width, ScrCanvas.height, ovColor);

    switch (DashUI.OverlayState) {
        case 1: // Show Boot Warning Text
            UICONST.BootWarningText.Position = { X: 0, Y: 0 };
            UICONST.BootWarningText.Alpha = alphaCap(DashUI.BootWarningAlpha);
            TxtPrint(UICONST.BootWarningText);
            break;
        case 2: // Show Dialog
            DrawUIDialog();
            break;
    }

    DrawLayersFg();

}
function BootSequenceHandler() {
	const StateDuration = UICONST.BootInfo.StateDurations[DashUI.BootState];

	switch (DashUI.BootState) {
		case 0: // Fade In Screen
			DashUI.Overlay.Alpha--;
			if (DashUI.BootFrame === UICONST.BootInfo.SfxFrame) { PlayBootSfx(); }
			if (DashUI.BootFrame > StateDuration) { DashUI.BootState++; DashUI.BootFrame = 0; }
			break;
		case 1: // Fade In Screen + Boot Logo
			DashUI.Overlay.Alpha--;
			UIAnimateBootLogo_Work(DashUI.BootFrame);
			if (DashUI.BootFrame > StateDuration) { DashUI.BootState++; DashUI.BootFrame = 0; }
			break;
		case 2: // Show Boot Logo
			UIAnimateBootLogo_Work(128);
            if (DashUI.BootFrame > StateDuration && (DashUI.LoadedPlugins)) { DashUI.BootState++; DashUI.BootFrame = 0; }
			break;
		case 3: // Fade Out Boot Logo
			UIAnimateBootLogo_Work(128 - DashUI.BootFrame);
            if (DashUI.BootFrame > StateDuration) {
                if (UserConfig.Warning === 1) {
                    DashUI.OverlayState = 1;
                    DashUI.BootState++;
                }
                else {
                    DashUI.BootState = 7;
                }
                DashUI.BootFrame = 0;
            }
			break;
		case 4: // Fade In Epilepsy Warning Message
			DashUI.Overlay.Alpha++;
			DashUI.BootWarningAlpha+=2;
            if (DashUI.BootFrame > StateDuration) { DashUI.BootState++; DashUI.BootFrame = 0; }
			break;
		case 5: // Show Epilepsy Warning Message
            if (DashUI.BootFrame > StateDuration) { DashUI.BootState++; DashUI.BootFrame = 0; }
			break;
		case 6: // Fade Out Epilepsy Warning Message
			DashUI.Overlay.Alpha--;
			DashUI.BootWarningAlpha-=2;
			if (DashUI.BootFrame > StateDuration) { DashUI.OverlayState = 0; DashUI.BootState++; DashUI.BootFrame = 0; }
			break;
		case 7: // Fade In Main UI
			if (std.exists(`${PATHS.Theme}${UserConfig.Theme}/thm.js`))	{ std.loadScript(`${PATHS.Theme}${UserConfig.Theme}/thm.js`); }

			UIAnimationCommonFade_Start(DashUI.Clock, () => UIAnimationCommon_Work(DashUI.Clock.Fade, 0.04f), true);
			UIAnimationCommonFade_Start(DashUI.Category, () => UIAnimationCommon_Work(DashUI.Category.Fade, 0.04f), true);
			UIAnimationCommonFade_Start(DashUI.Items, () => UIAnimationCommon_Work(DashUI.Items.Fade, 0.04f), true);
			DashUI.BootState++;
			break;
		case 8: //
			if (DashUI.AnimationQueue.length < 1) {
				DashUI.BootState++;
				DashUI.State.Next = 1;
			}
			break;
	}

	DashUI.BootFrame++;
}
function ExitSequenceHandler() {
	switch (DashUI.ExitState) {
		case 0: // Fade Out Main UI
			DashUI.Overlay.Alpha = 0;
			DashUI.Overlay.Color = { R: 0, G: 0, B: 0 };
			UIAnimationCommonFade_Start(DashUI.Clock, () => UIAnimationCommon_Work(DashUI.Clock.Fade, 0.075f), false);
			UIAnimationCommonFade_Start(DashUI.Category, () => UIAnimationCommon_Work(DashUI.Category.Fade, 0.04f), false);
			UIAnimationCommonFade_Start(DashUI.Items, () => UIAnimationCommon_Work(DashUI.Items.Fade, 0.04f), false);
			if (DashUI.SubMenu.Level > -1) {
				UIAnimationCommonFade_Start(DashUI.SubMenu.Animation, () => UIAnimationCommon_Work(DashUI.SubMenu.Animation.Fade, 0.04f), false);
			}
			if (DashUI.SubMenu.Level > 0) {
				UIAnimationCommonFade_Start(DashUI.SubMenu.PrevAnimation, () => UIAnimationCommon_Work(DashUI.SubMenu.PrevAnimation.Fade, 0.04f), false);
			}
			DashUI.ExitState++;
			break;
		case 1: // Wait for Interface Fade Out Animation to Complete
			if (DashUI.AnimationQueue.length < 1) {	DashUI.ExitState++; }
			break;
		case 2: // Error Handler
			ExitErrorHandler();
			break;
		case 3: // Screen Fade Out
			DashUI.Overlay.Alpha+=4;
			if (DashUI.Overlay.Alpha === 128) {	DashUI.ExitState++;	}
			break;
		case 4: // Execute
			CfgMan.Process();
			if ('Elf' in gExit)	{ ExecuteELF(); }
			else { ExecuteSpecial() }
			break;
		case 5: // Fade Back In
			if (!DashUI.Dialog.Display) {
				UIAnimationCommonFade_Start(DashUI.Clock, () => UIAnimationCommon_Work(DashUI.Clock.Fade, 0.075f), true);
				UIAnimationCommonFade_Start(DashUI.Category, () => UIAnimationCommon_Work(DashUI.Category.Fade, 0.04f), true);
				UIAnimationCommonFade_Start(DashUI.Items, () => UIAnimationCommon_Work(DashUI.Items.Fade, 0.04f), true);
				if (DashUI.SubMenu.Level > -1) {
					UIAnimationCommonFade_Start(DashUI.SubMenu.Animation, () => UIAnimationCommon_Work(DashUI.SubMenu.Animation.Fade, 0.04f), true);
				}
				if (DashUI.SubMenu.Level > 0) {
					UIAnimationCommonFade_Start(DashUI.SubMenu.PrevAnimation, () => UIAnimationCommon_Work(DashUI.SubMenu.PrevAnimation.Fade, 0.04f), true);
				}
				DashUI.ExitState++;
			}
			break;
		case 6: // Wait for Interface Fade In Animation to Complete
			if (DashUI.AnimationQueue.length < 1) {	DashUI.ExitState++; }
			break;
		case 7: // Wait for Interface Fade In Animation to Complete
			DashUI.State.Next = DashUI.State.Previous;
			DashUI.ExitState = 0;
			break;
	}
}
function ExitErrorHandler() {
	let result = true; // No problems found

	if ('Elf' in gExit)	{
        if (gExit.Elf.__skipElfCheck === true) {
            result = true;
        } else if (Array.isArray(gExit.Elf.Path)) {
        // Check if File Exists.
            result = false;
            for (let i = 0; i < gExit.Elf.Path.length; i++) {
                gExit.Elf.Path[i] = resolveFilePath(gExit.Elf.Path[i]);
                if (std.exists(gExit.Elf.Path[i])) {
                    gExit.Elf.Path = gExit.Elf.Path[i];
                    result = true; // File Found
                    break;
                }
            }
            if (!result) {
                // Show new Error Message
                OpenDialogErrorMsg(XMBLANG.ERROR.ELF_NOT_FOUND);
            }
        }
        else {
            gExit.Elf.Path = resolveFilePath(gExit.Elf.Path);
            const elfExists = std.exists(gExit.Elf.Path);
            if (!elfExists) {
                result = false; // An Error has been encountered

                // Show new Error Message
                OpenDialogErrorMsg(XMBLANG.ERROR.ELF_NOT_FOUND);
            }
        }
	}

	if (result) { DashUI.ExitState++; } // Continue
	else { DashUI.ExitState = 5; } 		// Fade Back In
}
function DashUIAnimationHandler() {
    let length = DashUI.AnimationQueue.length;
    for (let i = 0; i < length; i++) {
        const f = DashUI.AnimationQueue.shift();
        if (!f()) { DashUI.AnimationQueue.push(f); }
    }
}
function DashUIObjectHandler(Item) {
    DashUI.SelectedItem = Item;

    switch (Item.Type) {
        case "ELF": DashUISetElfExecution(Item.Value); return;
        case "SUBMENU": DashUISetNewSubMenu(Item.Value); return;
        case "CONTEXT": DashUISetNewContextMenu(Item.Value); return;
        case "CODE": DashUISetSpecialExit(Item.Value); return;
        case "DIALOG": DashUISetDialog(Item.Value); return;
    }

    let script = false;
    const mainItem = DashUI.ItemCollection.Current[DashUI.Items.Current];
    for (let key in mainItem) {
        let obj = mainItem[key];
        if (obj && obj.Type === "OptionValue" && 'Code' in obj) {
            if ('Condition' in obj) {
                if (eval(obj.Condition)) {
                    script = obj.Code;
                }
            }
            else { script = obj.Code; }
        }
    }

    if (script && typeof script === "function") { script(); }
}
function DashUIStateHandler() {
	// Only handle State changes after animations are finished.

    if (DashUI.AnimationQueue.length > 0) { SetDashPadEvents(0); return; }
    const states = DashUI.State;

	// Check if there is a state change and handle it accordingly.
    if (states.Next !== states.Current) {
        const fix = (states.Next === 3 && DashUI.Context.Level < 0) || (states.Next === 4 && DashUI.Dialog.Level < 0);
        if (fix) { states.Next = (DashUI.SubMenu.Level > -1) ? 2 : 1; }

        states.Previous = states.Current;
        states.Current = states.Next;

        /* XMB principal visível: PC deixa de mostrar jogo atual (pedido HTTP fora do UIHandler). */
        if (states.Current === 1 && typeof xmbScheduleClearPlayingOnPcFromMainUi === "function") {
            xmbScheduleClearPlayingOnPcFromMainUi();
        }
	}

	// Update Pad Mode if there is a state change.
    if (PadSettings.Mode !== states.Current) { SetDashPadEvents(states.Current); }
}

//////////////////////////////////////////////////////////////////////////
///*				   		   Image Cache							  *///
//////////////////////////////////////////////////////////////////////////

const ImageCache = (() => {
    const MAX_CACHE_SIZE = 20;

    const cache = []; // { Path, Image }
    const queue = [];
    let isLoading = false;

    function findInCache(path) {
        return cache.find(entry => entry.Path === path);
    }
    function evictIfNeeded() {
        if (cache.length >= MAX_CACHE_SIZE) {
            const removed = cache.shift();
            if (removed.Image && removed.Image.ready()) {
                removed.Image.free();
            }
        }
    }
    function enqueue(path) {
        if (queue.includes(path)) return;
        if (!findInCache(path)) {
            evictIfNeeded();
            cache.push({ Path: path, Image: false });
        }
        queue.push(path);
    }
	function loadImages(itemsToLoad) {
		try {
			for (let i = 0; i < itemsToLoad.length; i++) {
                const Path = itemsToLoad[i];
                if (!std.exists(Path)) { continue; }
				const image = new Image(Path);
				image.optimize();
                image.filter = LINEAR;

				// Update cache entry with loaded image
				const cached = findInCache(Path);

				if (cached) { cached.Image = image; }
			}
		} catch (e) {
			xlog(e);
		} finally {
			isLoading = false;
		}
	}

    return {
        Get(path) {
            const entry = findInCache(path);
            if (entry && entry.Image) return entry.Image;
            enqueue(path);
            return false;
        },
        Process: function() {
            if (isLoading || queue.length === 0) return;
			const itemsToLoad = queue.splice(0, queue.length); // Shallow copy
			isLoading = true;
            loadImages(itemsToLoad);
        },
    };
})();

//////////////////////////////////////////////////////////////////////////
///*				   		  Initialization						  *///
//////////////////////////////////////////////////////////////////////////

function DashCustomizableElementsInit() {
    const elements = [
        "dash_logo.png",
        "dash_load.png",
        "dash_submenu.png",
        "dash_pbar.png",
        "dash_clock.png",
        "dash_clock_outline.png"
    ];

    const objects = [
        "BootLogo",
        "LoadIco",
        "Arrow",
        "Pbar",
        "ClockIco",
        "ClockOutline"
    ]

    for (let i = 0; i < elements.length; i++) {
        let path = `${PATHS.XMB}dash/${elements[i]}`;
        let customPath = `${PATHS.Theme}${UserConfig.Theme}/dash/${elements[i]}`;

        if (std.exists(customPath)) {
            path = customPath;
        }

        DashElements[objects[i]] = new Image(path);
        DashElements[objects[i]].optimize();
        DashElements[objects[i]].filter = LINEAR;
    }

    DashElements.ClockOutline.height = DashElements.ClockOutline.height >> 1;
}
function DashElementsInit() {

    DashCustomizableElementsInit();

    // Context
	DashElements.Context = new Image(`${PATHS.XMB}dash/dash_context.png`);
	DashElements.Context.width = 275;
	DashElements.Context.startx = 4;
	DashElements.Context.starty = 2;
	DashElements.CtxIco = new Image(`${PATHS.XMB}color/ctx.png`);
	DashElements.CtxIco.width = 26;
    DashElements.CtxIco.height = 26;

    // Option Box
	DashElements.OptionBox = new Image(`${PATHS.XMB}dash/dash_option_box.png`);
	DashElements.OptionBox.height = 79;
	DashElements.OptionIco = new Image(`${PATHS.XMB}dash/triangle.png`);
	DashElements.OptionIco.width = 14;
	DashElements.OptionIco.height = 14;

	Object.values(DashElements).forEach((dashElem) => {
		dashElem.optimize();
		dashElem.filter = LINEAR;
	});

    DashElements.ClockIco.filter = NEAREST;
    DashElements.ItemFocus = false;

    while (DashIconsInfo.length > DashIcons.length) {
        const path = `${PATHS.Theme}${UserConfig.Theme}/icons/${DashIconsInfo[DashIcons.length].path}`;
        const icn = std.exists(path) ? new Image(path) : new Image(`${PATHS.Theme}Original/icons/${DashIconsInfo[DashIcons.length].path}`);
        icn.optimize();
        icn.filter = LINEAR;
        DashIcons.push(icn);
    }
}
function DashUIConstantsInit() {
    UICONST.LayersBg = [];
    UICONST.LayersFg = [];
    UICONST.StextLine = 17;
    UICONST.IcoSelSize = 72;
    UICONST.IcoUnselSize = 48;
    UICONST.IcoUnselMod = 24;
    UICONST.SubItemSlotSize = 52;
    UICONST.ScreenDrawLimit = 64;
    UICONST.PIC2X = (ScrCanvas.width >> 1) - 90;
    UICONST.PIC2Y = (ScrCanvas.height >> 1) - 30;
    UICONST.PbarBaseX = 60;
    UICONST.PbarCenterWidth = ScrCanvas.width - 120;
    UICONST.ContextPreviewOptionX = ScrCanvas.width - 75;
    UICONST.ScrLowerLimit = ScrCanvas.height + UICONST.ScreenDrawLimit;
    UICONST.ScrRightLimit = ScrCanvas.width + UICONST.ScreenDrawLimit;
    UICONST.ClockX = ScrCanvas.width - 194;
    UICONST.ClockY = 35;
    UICONST.ClockIcoX = ScrCanvas.width - 24;
    UICONST.ClockTextObj.Scale = FontObj.SizeM;
    UICONST.BootInfo.SfxFrame = 12;
    UICONST.BootInfo.StateDurations = [63, 127, 29, 127, 63, 119, 127];
    UICONST.BootWarningText = {
        Text: PreprocessText(getLocalText(XMBLANG.BOOT_WARNING)),
		Alignment: "CENTER",
        Scale: FontObj.SizeM
	};
    UICONST.BootLogoY = ~~(ScrCanvas.height / 3) + 20;
    UICONST.BootLogoX = ScrCanvas.width - DashElements.BootLogo.width;
    UICONST.Category.IconX = (ScrCanvas.width >> 1) - 178;
    UICONST.Category.IconY = (ScrCanvas.height >> 1) - 120;
    UICONST.Category.SubX = 110;
    UICONST.CatItems.IconX = (ScrCanvas.width >> 1) - 178;
    UICONST.CatItems.IconY = (ScrCanvas.height >> 1) - 32;
    UICONST.CatItems.TextX = (ScrCanvas.width >> 1) - 80;
    UICONST.CatItems.TextY = (ScrCanvas.height >> 1) - 16;
    UICONST.CatItems.SubNoSelX = 46;
    UICONST.SubItems.ArrowX = (ScrCanvas.width >> 1) - 204;
    UICONST.SubItems.ArrowY = (ScrCanvas.height >> 1) - 6;
    UICONST.SubItems.IconX = (ScrCanvas.width >> 1) - 174;
    UICONST.SubItems.IconY = (ScrCanvas.height >> 1) - 32;
    UICONST.SubItems.TextX = (ScrCanvas.width >> 1) - 90;
    UICONST.SubItems.TextY = (ScrCanvas.height >> 1) - 16;
    UICONST.SubItems.PrevSelX = 116;
    UICONST.SubItems.PrevUnselX = 70;
    UICONST.OptionBox.XBOX = ScrCanvas.width - 100;
    UICONST.OptionBox.YBOX = ScrCanvas.height - 70;
    UICONST.OptionBox.XICO = ScrCanvas.width - 93;
    UICONST.OptionBox.YICO = ScrCanvas.height - 34;
    UICONST.OptionBox.XTXT = ScrCanvas.width - 73;
    UICONST.OptionBox.YTXT = ScrCanvas.height - 42;
    UICONST.Context.BoxX = 180;
    UICONST.Context.BoxA = 116;
    UICONST.Context.BaseX = ScrCanvas.width - 164;
    UICONST.Context.BaseY = (ScrCanvas.height >> 1) - 15;
    UICONST.Context.PreviewImgX = ScrCanvas.width - 450;
    UICONST.Context.PreviewImgY = (ScrCanvas.height >> 1) + 60;
    UICONST.DialogInfo.LineYTop = (ScrCanvas.height >> 1) - 160;
    UICONST.DialogInfo.LineYBottom = (ScrCanvas.height >> 1) + 170;
    UICONST.DialogInfo.IconX = (ScrCanvas.width >> 1) - 280;
    UICONST.DialogInfo.NameX = - (ScrCanvas.width >> 1) - 15;
    UICONST.DialogInfo.NameY = (ScrCanvas.height >> 1);
    UICONST.DialogInfo.DescX = (ScrCanvas.width >> 1);
    UICONST.Fun = {
        SubMenuFade: () => UIAnimationCommon_Work(DashUI.SubMenu.Animation.Fade, 0.04f),
        SubMenuPrevFade: () => UIAnimationCommon_Work(DashUI.SubMenu.PrevAnimation.Fade, 0.04f),
        DialogContentFade: () => UIAnimationCommon_Work(DashUI.Dialog.ContentFade, 0.04f),
        DialogAnimation: () => UIAnimationCommon_Work(DashUI.Dialog.Animation, 0.15f)
    };
}
function DashUICustomizationInit() {
    UICONST.ClockTextColor = {};
    UICONST.PBarPlateColor = Color.new(128, 128, 128, 128);
    UICONST.DefaultIconColor = Color.new(128, 128, 128, 128);
    UICONST.TextSelectedColor = { R: 128, G: 128, B: 128 };
    UICONST.TextUnselectedColor = { R: 128, G: 128, B: 128 };
    UICONST.Category.IconSelectedColor = { R: 128, G: 128, B: 128 };
    UICONST.Category.IconUnselectedColor = { R: 128, G: 128, B: 128 };
    UICONST.Context.Tint = false;
    UICONST.DialogInfo.LineCol = Color.new(196, 196, 196, 128);
}
function DashUInit() {
    // Constant Objects
    UICONST.ClockTextObj = {};
    UICONST.BootInfo = {};
    UICONST.BootWarningText = {};
    UICONST.Category = {};
    UICONST.CatItems = {};
    UICONST.Context = {};
    UICONST.SubItems = {};
    UICONST.OptionBox = {};
    UICONST.DialogInfo = {};
    UICONST.Fun = {};

    // Common Parameters
    DashUI.LoadedPlugins = false;
    DashUI.LoadSpinning = 0.0f;
    DashUI.BootWarningAlpha = 0;
    DashUI.State = {
        Current: 0,
        Previous: 0,
        Next: 0
    };
    DashUI.ExitState = 0;
    DashUI.BootState = 0;
    DashUI.BootFrame = 0;
    DashUI.OverlayState = 0;
    DashUI.PbarAlpha = 0;
    DashUI.AnimationQueue = [];

    // Overlay Object
    DashUI.Overlay = {
        Alpha: 128,
        Color: { R: 0, G: 0, B: 0 }
    };

    // Init Clock Object
    DashUI.Clock = {
        Display: false,
        Fade: createFade()
    };

    // Init Item Backgroud Object
    DashUI.ItemBG = {};

    // PIC2 Item
    DashUI.PIC2 = {
        Display: false,
        Fade: createFade(),
        A: 0
    };

    // Init Categories Object
    DashUI.Category = {
        Display: false,
        Next: 5,
        Current: 5,
        Fade: createFade(),
        Animation: { Running: false, Progress: 0.0f }
    };

    // Init Items Object
    DashUI.ItemCollection = {
        Current: DashCatItems[DashUI.Category.Current].Items,
        Next: DashCatItems[DashUI.Category.Next].Items
    };
    DashUI.ItemCollection.Swipe = {
        Dir: 0,
        Progress: 0.0f,
        Running: false
    };

    DashUI.Items = {
        Display: false,
        Current: 0,
        Next: 0,
        Fade: createFade(),
        Animation: { Running: false, Progress: 0.0f }
    };

    // Init Sub Menu Object
    DashUI.SubMenu = {
        Display: false,
        Level: -1,
        ItemCollection: [],
        Items: { Current: 0, Next: 0 },
        PrevAnimation: { Fade: createFade() },
        Fade: createFade(),
        Animation: {
            Running: false,
            Progress: 0.0f,
            Fade: createFade()
        }
    };

    Object.defineProperty(DashUI.SubMenu, "HighlightedItem", {
        get() {
            if (this.Level < 0) { return {}; }
            const items = this.ItemCollection[this.Level].Items;
            const cur = this.Items.Current;
            if (cur < 0 || cur >= items.length) { return {}; }
            return items[cur];
        }
    });

	// Init Context Object
    DashUI.Context = {
        Display: false,
        Level: -1,
        PreviewA: 0,
        ItemCollection: [],
        Items: { Current: 0, Next: 0, UpperLimit: 0, LowerLimit: 0 },
        Animation: { Running: false, Progress: 0.0f },
        Fade: createFade()
    };

    Object.defineProperty(DashUI.Context, "Active", {
        get() {
            if (this.Level < 0) { return []; }
            return this.ItemCollection[this.Level];
        }
    })

	DashUI.OptionBox = { Progress: 0.0f };

	// Init Dialog Object
    DashUI.Dialog = {
        Display: false,
        Level: -1,
        Data: [],
        Fade: createFade(),
        ContentFade: createFade(),
        Animation: { Running: false, Progress: 0.0f }
    };
}
function DashCatInit() {
	for (let i = 0; i < CATNAME.length; i++) { DashCatItems.push({ Items: [], Default: 0 }); }
}
function DashPluginsInit() {
    const plugins = System.listDir(PATHS.Plugins).sort((a, b) => a.name.localeCompare(b.name));

    for (let i = 0; i < plugins.length; i++) {
        if ((plugins[i].dir) || (!extensionMatches(plugins[i].name, ["json", "xml"]))) { continue; }

        xlog(`DashPluginsInit(): Loading Plugin: ${plugins[i].name}`);
        const fname = plugins[i].name.toLowerCase();
        const path = `${PATHS.Plugins}${plugins[i].name}`;
        let plg = false;
        try {
            plg = std.open(path, "r");
            if (!plg) { throw new Error(`DashPluginsInit(): Error opening plugin ${plugins[i].name}`); }
            let data = "";
            const type = getFileExtension(fname).toUpperCase();
            switch (type) {
                case "JSON": data = plg.readAsString(); break;
                case "XML": data = xmlParseElement(plg.readAsString()); break;
            }
            DashPluginData.push({ Name: plugins[i].name, Data: data, Type: type });
        } catch (e) {
            xlog(e);
            continue;
        } finally {
            if (plg) { plg.close(); }
        }

        xlog(`DashPluginsInit(): Loaded Plugin: ${plugins[i].name}`);
    }
}
function DashPluginsProcess() {
    while (DashPluginData.length > 0) {
        const plg = DashPluginData.shift();
        let Plugin = false;
        xlog(`DashPluginsProcess(): Processing Plugin: ${plg.Name}.`);

        switch (plg.Type) {
            case "JSON": Plugin = JSON.parse(plg.Data); break;
            case "XML": Plugin = parseXmlPlugin(plg.Data); break;
        }

        if (Plugin) {
            xlog(`DashPluginsProcess(): Plugin ${plg.Name} Succesfully processed.`);
            AddNewPlugin(Plugin);
        }
    }

    DashUI.LoadedPlugins = true;
}
function DashBackgroundLoad() {
    DashPluginsInit();
    DashPluginsProcess();
}

//////////////////////////////////////////////////////////////////////////
///*				   			Boot Logo							  *///
//////////////////////////////////////////////////////////////////////////

function UIAnimateBootLogo_Work(Alpha) {
    Alpha = alphaCap(Alpha);
    if (Alpha < 1) { return; }
    const logo = DashElements.BootLogo;
    logo.color = Color.setA(logo.color, Alpha);
    logo.draw(UICONST.BootLogoX, UICONST.BootLogoY);
}

//////////////////////////////////////////////////////////////////////////
///*				   			  Clock							      *///
//////////////////////////////////////////////////////////////////////////

function UIClockText(a) {
    const obj  = UICONST.ClockTextObj;
    const MM   = String(gTime.month).padStart(2, '0');
    const DD   = String(gTime.day).padStart(2, '0');
    const mm   = String(gTime.minute).padStart(2, '0');
    const H24  = gTime.hour;
    const H12  = (H24 % 12) || 12;
    const amPm = H24 >= 12 ? 'PM' : 'AM';
    const Hstr = (UserConfig.HourFormat === 0) ? String(H12).padStart(2, '0') : String(H24).padStart(2, '0');

    const date = (UserConfig.DateFormat === 0) ? `${DD}/${MM}` : `${MM}/${DD}`;
    const time = (UserConfig.HourFormat === 0) ? `${Hstr}:${mm} ${amPm}` : `${Hstr}:${mm}`;

    obj.Text = [`${date}  ${time}`];
    obj.Position = { X: UICONST.ClockX + 12, Y: UICONST.ClockY - 1 };
    obj.Alpha = a;
    if ('R' in UICONST.ClockTextColor) { obj.Color = UICONST.ClockTextColor; }

    TxtPrint(obj);
}
function DrawUIClock() {
	if (DashUI.Clock.Display === false) { return; }
	const p = getFadeProgress(DashUI.Clock.Fade);
	const a   = ~~(128 * p);
	const box = DashElements.ClockOutline;
    const ico = DashElements.ClockIco;
    const col = Color.setA(box.color, a);
    const y   = UICONST.ClockY;
    const x   = UICONST.ClockX;

    // Draw Start of Clock Outline
    box.width = 8;
    box.startx = 2;
    box.endx = 20;
    box.color = col;
    box.draw(x, y);

    // Draw End of Clock Outline
    box.width = 196;
    box.startx = 34;
    box.endx = 60;
    box.color = col;
    box.draw(x + 8, y);

    if (Tasks.isRunning) {
        DrawDashLoadIcon({
            Width: 48,
            Height: 48,
            X: UICONST.ClockIcoX - 16,
            Y: y - 8,
            Alpha: a
        });
    }
    else {
        ico.color = col;
        ico.draw(UICONST.ClockIcoX, y + 7);
    }

	UIClockText(a);
}

//////////////////////////////////////////////////////////////////////////
///*				   			   BG 							      *///
//////////////////////////////////////////////////////////////////////////

function DashUIResetBg() {
    Timer.reset(DashUI.ItemBG.Timer);
    Timer.resume(DashUI.ItemBG.Timer);
    if ('Image' in DashUI.ItemBG) { delete DashUI.ItemBG.Image; }
}
function DrawUIObjectBg() {
    const obj = DashUI.ItemBG;
    if (!('Timer' in obj)) { obj.Timer = Timer.new(); }
    let time = getTimerSec(obj.Timer);
    if (time < 8) { obj.A = 0; return; }

    if (!('Image' in obj)) { obj.A = 0; return; }

    const customBg = ImageCache.Get(obj.Image);
    const Ready = customBg && customBg.ready();
    if (!Ready) { obj.A = 0; return; }

    if (obj.A === 0) {
        let ival = os.setInterval(() => {
            obj.A += 8;
            if (obj.A > 120) { os.clearInterval(ival); }
        }, 0);
    }

    customBg.width = ScrCanvas.width;
    customBg.height = ScrCanvas.height;
    customBg.color = Color.setA(customBg.color, obj.A);
    customBg.draw(0, 0);
}

//////////////////////////////////////////////////////////////////////////
///*				   			 Layers							      *///
//////////////////////////////////////////////////////////////////////////
function DrawLayersBg() {
    for (let i = 0; i < UICONST.LayersBg.length; i++) {
        if (typeof UICONST.LayersBg[i] === "function") {
            UICONST.LayersBg[i]();
        }
    }
}
function DrawLayersFg() {
    for (let i = 0; i < UICONST.LayersFg.length; i++) {
        if (typeof UICONST.LayersFg[i] === "function") {
            UICONST.LayersFg[i]();
        }
    }
}
function PushThemeBgLayer(fn) {
    fn.__Id = "THM"; // tag the function
    UICONST.LayersBg.push(fn);
}
function PushThemeFgLayer(fn) {
    fn.__Id = "THM"; // tag the function
    UICONST.LayersFg.push(fn);
}
function CleanThemeLayers() {
    UICONST.LayersBg = UICONST.LayersBg.filter(fn => fn.__Id !== "THM");
    UICONST.LayersFg = UICONST.LayersFg.filter(fn => fn.__Id !== "THM");
}

//////////////////////////////////////////////////////////////////////////
///*				   			 Generic							  *///
//////////////////////////////////////////////////////////////////////////

function DrawDashLoadIcon(Properties) {
	Properties.Alpha = alphaCap(Properties.Alpha);
    if (Properties.Alpha < 1) { return; }

	DashElements.LoadIco.width = Properties.Width;
	DashElements.LoadIco.height = Properties.Height;
    DashElements.LoadIco.color = Color.setA(DashElements.LoadIco.color, Properties.Alpha);
	DashElements.LoadIco.angle = DashUI.LoadSpinning;
	DashElements.LoadIco.draw(Properties.X, Properties.Y);
}
function DrawDashIcon(Properties) {
	let Image = false;
	let Ready = false;
	Properties.Alpha = alphaCap(Properties.Alpha);
	if (Properties.Alpha < 1) { return; }

    if (('CustomIcon' in Properties) && (typeof Properties.CustomIcon === "string")) {
        Properties.CustomIcon = resolveFilePath(Properties.CustomIcon);
        const customImg = ImageCache.Get(Properties.CustomIcon);
        Ready = customImg && customImg.ready();
        if (Ready) { Image = customImg; }
    }
    else if (Properties.ID >= 0) {
        Ready = DashIcons[Properties.ID] && DashIcons[Properties.ID].ready();
        if (Ready) { Image = DashIcons[Properties.ID]; }
    }
    else if (Properties.ID !== -2) { return; } // Processing to see if Custom Icon is available

	if (Ready) {
        if ('Tint' in Properties) { Image.color = Color.new(Properties.Tint.R, Properties.Tint.G, Properties.Tint.B, Properties.Alpha); }
        else { Image.color = Color.setA(UICONST.DefaultIconColor, Properties.Alpha); }
		Image.width  = Properties.Width;
		Image.height = Properties.Height;
		Image.angle  = ('Rotation' in Properties) ? Properties.Rotation : 0.0f;
		Image.draw(Properties.X, Properties.Y);
	}
	else { DrawDashLoadIcon(Properties); }
}
/**
 * Cor de preenchimento da barra: igual à zona colorida das ondas do fundo.
 * Mesma lógica que `Waves.SetColor` em wave.js (RGB de `BgElements.BgColor.Color` + 65/65/90).
 */
function themePBarProgressColor(alphaMod) {
    let col = { R: 128, G: 128, B: 128 };
    if (typeof BgElements !== "undefined" && BgElements.BgColor && BgElements.BgColor.Color) {
        col = BgElements.BgColor.Color;
    }
    const r = Math.min(col.R + 65, 255);
    const g = Math.min(col.G + 65, 255);
    const b = Math.min(col.B + 90, 255);
    const c = Color.new(r, g, b, 128);
    return Color.setA(c, alphaMod);
}
function DrawProgressBar(Pos, progress, label = "") {
    const bar = DashElements.Pbar;
    const x1 = UICONST.PbarBaseX + Pos.X;
    const x2 = x1 + 10;
    const x3 = x2 + UICONST.PbarCenterWidth;
    const y = (ScrCanvas.height >> 1) + Pos.Y;
    const pColor = themePBarProgressColor((DashUI.PbarAlpha * 2) - 1);

    // Draw Plate
    bar.color = Color.setA(UICONST.PBarPlateColor, DashUI.PbarAlpha);
    bar.startx = 0;  bar.endx = 9;  bar.width = 10; bar.draw(x1, y);
    bar.startx = 10; bar.endx = 22; bar.width = UICONST.PbarCenterWidth; bar.draw(x2, y);
    bar.startx = 23; bar.endx = 32; bar.width = 10; bar.draw(x3, y);

    // Draw Progress
    bar.color = pColor;
    if (progress > 0) {
        bar.startx = 0; bar.endx = 9; bar.width = 10; bar.draw(x1, y);

        bar.startx = 10; bar.endx = 22; bar.width = UICONST.PbarCenterWidth * (progress / 100); bar.draw(x2, y);

        if (progress > 99) {
            bar.startx = 23; bar.endx = 32; bar.width = 10; bar.draw(x3, y);
        }
    }

    const pTxt = {
        Text: [`${progress.toString()}%`],
        Alignment: "CENTER",
        Position: { X: Pos.X, Y: Pos.Y + 22 },
        Alpha: DashUI.PbarAlpha
    }

    TxtPrint(pTxt);

    if (label) {
        const pLabel = {
            Text: [ label ],
            Alignment: "CENTER",
            Position: { X: Pos.X, Y: Pos.Y - 18 },
            Alpha: DashUI.PbarAlpha
        };

        TxtPrint(pLabel);
    }
}

/** Geometria da barra NET ISO (direita): centro horizontal para alinhar texto por baixo. */
function netIsoDialogBarLayout() {
    const margin = 48;
    const centerW = Math.min(280, Math.max(120, ScrCanvas.width - 200));
    const x1 = ScrCanvas.width - margin - 20 - centerW;
    const centerX = x1 + 10 + (centerW >> 1);
    return { margin, centerW, x1, centerX };
}

/** Barra fina estilo PS3 (mesmo sprite Pbar que DrawProgressBar), alinhada à direita no diálogo NET ISO. */
function DrawNetIsoDialogProgressBar(progress, alpha, yTop) {
    const bar = DashElements.Pbar;
    const { centerW, x1 } = netIsoDialogBarLayout();
    const x2 = x1 + 10;
    const x3 = x2 + centerW;
    const y = yTop;
    const p = Math.max(0, Math.min(100, Number(progress)));
    const pColor = themePBarProgressColor((alpha * 2) - 1);
    bar.color = Color.setA(UICONST.PBarPlateColor, alpha);
    bar.startx = 0;
    bar.endx = 9;
    bar.width = 10;
    bar.draw(x1, y);
    bar.startx = 10;
    bar.endx = 22;
    bar.width = centerW;
    bar.draw(x2, y);
    bar.startx = 23;
    bar.endx = 32;
    bar.width = 10;
    bar.draw(x3, y);
    bar.color = pColor;
    if (p > 0) {
        bar.startx = 0;
        bar.endx = 9;
        bar.width = 10;
        bar.draw(x1, y);
        bar.startx = 10;
        bar.endx = 22;
        bar.width = centerW * (p / 100);
        bar.draw(x2, y);
        if (p > 99) {
            bar.startx = 23;
            bar.endx = 32;
            bar.width = 10;
            bar.draw(x3, y);
        }
    }
}

/** Download de ISO para mass0:/DVD/ — mesmo estilo visual que DrawUIDialog (linhas, ícone, overlay 64).
 *  ISOs grandes: vários GET a /download_segment?offset=&length= (pedidos menores que ~32 MiB) para contornar limite ~50–60 MB
 *  por ligação na PS2. Segmentos: asyncDownload + poll só com getAsyncSize (sem ready no fim — evita fclose/kill_task em cadeia no Athena).
 *  Grava em .part0, .part1…; chunk_bytes>0 usa .partN.c; no fim junta-se no .iso. */
const gNetIsoDl = {
    pct: 0, label: "", total: 0, err: false,
    downloaded: 0, startMs: 0, destPath: "",
    showUi: true,
    /** Só diálogo NET ISO (NetIsoShowPct): linha extra escrita na worker; o desenho só lê este texto. */
    showLivePct: false,
    livePctLine: "",
    segmentsTotal: 0,
    segmentCur: 0
};

function netIsoSyncLivePctLine() {
    if (!gNetIsoDl.showLivePct) {
        gNetIsoDl.livePctLine = "";
        return;
    }
    const bytesLine = netIsoBytesLine();
    if (gNetIsoDl.total > 0) {
        const p = Math.min(99, Math.max(0, Math.floor(Number(gNetIsoDl.pct))));
        const pctSeg = String(p) + "%";
        gNetIsoDl.livePctLine = pctSeg + "\n" + bytesLine;
        return;
    }
    gNetIsoDl.livePctLine = bytesLine;
}

let gNetIsoAsyncDownloadKnown = null;
function netIsoHasAsyncDownload() {
    if (gNetIsoAsyncDownloadKnown !== null) {
        return gNetIsoAsyncDownloadKnown;
    }
    try {
        gNetIsoAsyncDownloadKnown = typeof (new Request()).asyncDownload === "function";
    } catch (eH) {
        xlog(eH);
        gNetIsoAsyncDownloadKnown = false;
    }
    return gNetIsoAsyncDownloadKnown;
}

let gNetIsoAppendBuf = null;

/** spin_ms=0 → 1 ms no loop de poll (async); 0 ms literal causaria busy-wait. */
function netIsoPollYieldMs(spinMs) {
    const n = spinMs | 0;
    return (n > 0) ? Math.min(250, n) : 1;
}

function netIsoGetDownloadTuning() {
    let stallSec = 180;
    let spinMs = 0;
    let drawMs = 450;
    let segmentBytes = 33554432;
    /** 0 = um GET por segmento; sub-chunks: 256K–100M (igual ao teto de segment_bytes). */
    let chunkBytes = 0;
    let useSegments = true;
    /** Pausa entre pedidos de segmentos consecutivos (ms); 0 = sem pausa extra. */
    let segmentGapMs = 0;
    /** Após terminar um segmento async (ms); 0 = sem pausa extra. */
    let afterSegmentMs = 0;
    /** Após GET /size/ no probe (ms); 0 = só espera até o ficheiro existir (poll 1 ms). */
    let probeMs = 0;
    /** Pausa ao fechar o diálogo de sucesso (ms); 0 = fecho imediato. */
    let successPauseMs = 0;
    /** Iterações seguidas com ficheiro no tamanho esperado (segmento async). */
    let segmentStableTicks = 2;
    /**
     * 1 = cada segmento: GET síncrono → XMB/temp → cópia para .partN (sem .partN a meio).
     * Útil se o ISO está no USB e o XMB noutro volume (MC/HDD): o USB só escreve ao copiar o segmento inteiro.
     * Ignorado se chunk_bytes > 0 (sub-chunks). */
    let segmentBuffer = 0;
    try {
        const c = CfgMan.Get("netiso.cfg");
        if (c.stall_sec !== undefined) {
            const s = parseInt(c.stall_sec, 10);
            if (!isNaN(s) && s >= 30 && s <= 7200) {
                stallSec = s;
            }
        }
        if (c.spin_ms !== undefined) {
            const m = parseInt(c.spin_ms, 10);
            if (!isNaN(m) && m >= 0 && m <= 250) {
                spinMs = m;
            }
        }
        if (c.draw_ms !== undefined) {
            const d = parseInt(c.draw_ms, 10);
            if (!isNaN(d) && d >= 200 && d <= 2000) {
                drawMs = d;
            }
        }
        if (c.segment_bytes !== undefined) {
            const sb = parseInt(c.segment_bytes, 10);
            if (!isNaN(sb) && sb >= 1048576 && sb <= 104857600) {
                segmentBytes = sb;
            }
        }
        if (c.chunk_bytes !== undefined) {
            const cb = parseInt(c.chunk_bytes, 10);
            if (!isNaN(cb) && cb === 0) {
                chunkBytes = 0;
            } else if (!isNaN(cb) && cb >= 262144 && cb <= 104857600) {
                chunkBytes = cb;
            }
        }
        if (c.use_segments !== undefined) {
            const v = String(c.use_segments).toLowerCase();
            useSegments = (v === "1" || v === "true" || v === "yes");
        }
        if (c.segment_gap_ms !== undefined) {
            const g = parseInt(c.segment_gap_ms, 10);
            if (!isNaN(g) && g >= 0 && g <= 600) {
                segmentGapMs = g;
            }
        }
        if (c.after_segment_ms !== undefined) {
            const a = parseInt(c.after_segment_ms, 10);
            if (!isNaN(a) && a >= 0 && a <= 500) {
                afterSegmentMs = a;
            }
        }
        if (c.probe_ms !== undefined) {
            const p = parseInt(c.probe_ms, 10);
            if (!isNaN(p) && p >= 0 && p <= 500) {
                probeMs = p;
            }
        }
        if (c.success_pause_ms !== undefined) {
            const sp = parseInt(c.success_pause_ms, 10);
            if (!isNaN(sp) && sp >= 0 && sp <= 2000) {
                successPauseMs = sp;
            }
        }
        if (c.segment_stable_ticks !== undefined) {
            const t = parseInt(c.segment_stable_ticks, 10);
            if (!isNaN(t) && t >= 1 && t <= 8) {
                segmentStableTicks = t;
            }
        }
        if (c.segment_buffer !== undefined) {
            const b = String(c.segment_buffer).toLowerCase();
            segmentBuffer = (b === "1" || b === "true" || b === "yes") ? 1 : 0;
        }
    } catch (eT) {
        xlog(eT);
    }
    return {
        stallMs: stallSec * 1000,
        spinMs,
        drawMs,
        segmentBytes,
        chunkBytes,
        useSegments,
        segmentGapMs,
        afterSegmentMs,
        probeMs,
        successPauseMs,
        segmentStableTicks,
        segmentBuffer
    };
}

function netIsoParseDownloadUrl(url) {
    const mark = "/download/";
    const i = url.indexOf(mark);
    if (i < 0) {
        return null;
    }
    const base = url.slice(0, i);
    let rest = url.slice(i + mark.length);
    const q = rest.indexOf("?");
    if (q >= 0) {
        rest = rest.slice(0, q);
    }
    try {
        return { base: base, fname: decodeURIComponent(rest) };
    } catch (eP) {
        xlog(eP);
        return null;
    }
}

/** GET /size/<fname> → {"size":N} (servidor); se falhar, devolve 0 e mantém-se o tamanho da lista. */
function netIsoProbeRemoteFileSize(baseUrl, fname, probeSleepMs) {
    if (!baseUrl || !fname) {
        return 0;
    }
    const waitProbe = (probeSleepMs !== undefined && probeSleepMs !== null)
        ? Math.max(0, Math.min(500, probeSleepMs | 0))
        : 0;
    const url = baseUrl + "/size/" + encodeURIComponent(fname);
    const dir = PATHS.XMB + "temp";
    const tmp = dir + "/netiso_sz.json";
    try {
        if (!std.exists(dir)) {
            os.mkdir(dir);
        }
        if (std.exists(tmp)) {
            try {
                os.remove(tmp);
            } catch (e0) {
                xlog(e0);
            }
        }
        const rq = new Request();
        rq.keepalive = false;
        rq.download(url, tmp);
        if (waitProbe > 0) {
            os.sleep(waitProbe);
        }
        let probeTry = 0;
        while (!std.exists(tmp) && probeTry < 6000) {
            os.sleep(1);
            probeTry++;
        }
        if (!std.exists(tmp)) {
            return 0;
        }
        const raw = std.loadFile(tmp);
        try {
            os.remove(tmp);
        } catch (e1) {
            xlog(e1);
        }
        const j = JSON.parse(raw);
        const n = Number(j.size);
        return (n > 0 && !isNaN(n)) ? Math.floor(n) : 0;
    } catch (e2) {
        xlog(e2);
        return 0;
    }
}

function netIsoAppendToFile(fromPath, toPath) {
    const BUF = 65536;
    if (!gNetIsoAppendBuf || gNetIsoAppendBuf.length !== BUF) {
        gNetIsoAppendBuf = new Uint8Array(BUF);
    }
    const buf = gNetIsoAppendBuf;
    const fdIn = os.open(fromPath, os.O_RDONLY);
    const fdOut = os.open(toPath, os.O_RDWR);
    os.seek(fdOut, 0, std.SEEK_END);
    try {
        for (;;) {
            const n = os.read(fdIn, buf.buffer, 0, BUF);
            if (n <= 0) {
                break;
            }
            os.write(fdOut, buf.buffer, 0, n);
        }
    } finally {
        os.close(fdIn);
        os.close(fdOut);
    }
}

/** Cópia em blocos (junção de .partN → .iso, etc.). */
function netIsoCopyFileReplace(fromPath, toPath) {
    const BUF = 65536;
    if (!gNetIsoAppendBuf || gNetIsoAppendBuf.length !== BUF) {
        gNetIsoAppendBuf = new Uint8Array(BUF);
    }
    const buf = gNetIsoAppendBuf;
    const fdIn = os.open(fromPath, os.O_RDONLY);
    const fdOut = os.open(toPath, os.O_WRONLY | os.O_CREAT | os.O_TRUNC);
    try {
        for (;;) {
            const n = os.read(fdIn, buf.buffer, 0, BUF);
            if (n <= 0) {
                break;
            }
            os.write(fdOut, buf.buffer, 0, n);
        }
    } finally {
        os.close(fdIn);
        os.close(fdOut);
    }
}

function netIsoRemovePartFiles(destPath, maxIndex) {
    const lim = Math.max(0, maxIndex | 0);
    for (let i = 0; i <= lim; i++) {
        const p = destPath + ".part" + i;
        if (std.exists(p)) {
            try {
                os.remove(p);
            } catch (eR) {
                xlog(eR);
            }
        }
    }
}

function netIsoDownloadSegmented(parsed, destPath, total, barPos, tuning) {
    const segB = tuning.segmentBytes;
    const useSubChunks = tuning.chunkBytes > 0;
    const chunkMax = 104857600;
    const chunkB = useSubChunks
        ? Math.max(262144, Math.min(tuning.chunkBytes, chunkMax))
        : 0;
    const partCap = Math.min(512, Math.ceil(total / segB) + 4);
    netIsoRemovePartFiles(destPath, partCap);
    const legacySeg = destPath + ".seg";
    if (std.exists(legacySeg)) {
        try {
            os.remove(legacySeg);
        } catch (eLs) {
            xlog(eLs);
        }
    }
    const legacySegChunk = legacySeg + ".chunk";
    if (std.exists(legacySegChunk)) {
        try {
            os.remove(legacySegChunk);
        } catch (eLsc) {
            xlog(eLsc);
        }
    }
    for (let hci = 0; hci <= partCap; hci++) {
        const hch = destPath + ".part" + hci + ".c";
        if (std.exists(hch)) {
            try {
                os.remove(hch);
            } catch (eHc) {
                xlog(eHc);
            }
        }
    }
    let offset = 0;
    let segmentIndex = 0;
    while (offset < total && !gNetIsoDl.err) {
        const segLen = Math.min(segB, total - offset);
        const segUrl = parsed.base + "/download_segment/" + encodeURIComponent(parsed.fname)
            + "?offset=" + offset + "&length=" + segLen;
        const partPath = destPath + ".part" + segmentIndex;
        const chunkPath = partPath + ".c";
        if (std.exists(partPath)) {
            try {
                os.remove(partPath);
            } catch (eRm0) {
                xlog(eRm0);
            }
        }
        if (std.exists(chunkPath)) {
            try {
                os.remove(chunkPath);
            } catch (eRmC0) {
                xlog(eRmC0);
            }
        }
        if (offset > 0 && (tuning.segmentGapMs | 0) > 0) {
            os.sleep(tuning.segmentGapMs);
        }
        gNetIsoDl.segmentCur = Math.floor(offset / segB) + 1;
        gNetIsoDl.downloaded = offset;
        if (gNetIsoDl.total > 0) {
            gNetIsoDl.pct = Math.min(99, Math.floor((100 * offset) / gNetIsoDl.total));
        }
        netIsoSyncLivePctLine();
        netIsoDrawDownloadFrame(barPos, gNetIsoDl.pct);
        if (!useSubChunks) {
            if ((tuning.segmentBuffer | 0) === 1) {
                netIsoDownloadSegmentBufferedToPart(segUrl, partPath, segLen, tuning);
            } else {
                netIsoHttpGetToFile(segUrl, partPath, barPos, offset, 0, tuning, true, segLen);
            }
            if (gNetIsoDl.err) {
                break;
            }
            gNetIsoDl.downloaded = offset + segLen;
            if (gNetIsoDl.total > 0) {
                gNetIsoDl.pct = Math.min(99, Math.floor((100 * gNetIsoDl.downloaded) / gNetIsoDl.total));
            }
            netIsoSyncLivePctLine();
            netIsoDrawDownloadFrame(barPos, gNetIsoDl.pct);
        } else {
            let partOff = 0;
            while (partOff < segLen && !gNetIsoDl.err) {
                const partLen = Math.min(chunkB, segLen - partOff);
                const partUrl = parsed.base + "/download_segment/" + encodeURIComponent(parsed.fname)
                    + "?offset=" + (offset + partOff) + "&length=" + partLen;
                const fullInOne = (partOff === 0 && partLen >= segLen);
                if (!fullInOne && std.exists(chunkPath)) {
                    try {
                        os.remove(chunkPath);
                    } catch (eRmCh) {
                        xlog(eRmCh);
                    }
                }
                const destHttp = fullInOne ? partPath : chunkPath;
                netIsoHttpGetToFile(partUrl, destHttp, barPos, offset + partOff, 0, tuning, true, partLen);
                if (gNetIsoDl.err) {
                    break;
                }
                if (!fullInOne) {
                    try {
                        if (partOff === 0) {
                            netIsoCopyFileReplace(chunkPath, partPath);
                        } else {
                            netIsoAppendToFile(chunkPath, partPath);
                        }
                    } catch (eMer) {
                        xlog(eMer);
                        gNetIsoDl.err = true;
                        break;
                    }
                    try {
                        os.remove(chunkPath);
                    } catch (eRmP) {
                        xlog(eRmP);
                    }
                }
                partOff += partLen;
                gNetIsoDl.downloaded = offset + partOff;
                if (gNetIsoDl.total > 0) {
                    gNetIsoDl.pct = Math.min(99, Math.floor((100 * gNetIsoDl.downloaded) / gNetIsoDl.total));
                }
                netIsoSyncLivePctLine();
                netIsoDrawDownloadFrame(barPos, gNetIsoDl.pct);
            }
        }
        if (gNetIsoDl.err) {
            break;
        }
        segmentIndex++;
        offset += segLen;
        gNetIsoDl.downloaded = offset;
        if (gNetIsoDl.total > 0) {
            gNetIsoDl.pct = Math.min(99, Math.floor((100 * offset) / gNetIsoDl.total));
        }
        netIsoSyncLivePctLine();
        netIsoDrawDownloadFrame(barPos, gNetIsoDl.pct);
    }
    for (let hci2 = 0; hci2 <= partCap; hci2++) {
        const hch2 = destPath + ".part" + hci2 + ".c";
        if (std.exists(hch2)) {
            try {
                os.remove(hch2);
            } catch (eH2) {
                xlog(eH2);
            }
        }
    }
    if (gNetIsoDl.err) {
        netIsoRemovePartFiles(destPath, segmentIndex + 2);
        return;
    }
    if (segmentIndex < 1) {
        gNetIsoDl.err = true;
        xlog("Net ISO: sem segmentos gravados");
        return;
    }
    const p0 = destPath + ".part0";
    if (!std.exists(p0)) {
        gNetIsoDl.err = true;
        xlog("Net ISO: falta .part0 para junção");
        netIsoRemovePartFiles(destPath, segmentIndex + 2);
        return;
    }
    try {
        netIsoCopyFileReplace(p0, destPath);
    } catch (eM0) {
        xlog(eM0);
        gNetIsoDl.err = true;
        netIsoRemovePartFiles(destPath, segmentIndex + 2);
        return;
    }
    try {
        os.remove(p0);
    } catch (eRp0) {
        xlog(eRp0);
    }
    for (let mi = 1; mi < segmentIndex && !gNetIsoDl.err; mi++) {
        const pm = destPath + ".part" + mi;
        if (!std.exists(pm)) {
            gNetIsoDl.err = true;
            xlog("Net ISO: falta " + pm);
            break;
        }
        try {
            netIsoAppendToFile(pm, destPath);
        } catch (eAm) {
            xlog(eAm);
            gNetIsoDl.err = true;
            break;
        }
        try {
            os.remove(pm);
        } catch (eRpm) {
            xlog(eRpm);
        }
    }
    if (gNetIsoDl.err) {
        try {
            if (std.exists(destPath)) {
                os.remove(destPath);
            }
        } catch (eRd) {
            xlog(eRd);
        }
        netIsoRemovePartFiles(destPath, segmentIndex + 2);
        return;
    }
    netIsoRemovePartFiles(destPath, segmentIndex + 2);
    gNetIsoDl.downloaded = total;
    if (gNetIsoDl.total > 0) {
        gNetIsoDl.pct = 99;
    }
    netIsoSyncLivePctLine();
    netIsoDrawDownloadFrame(barPos, gNetIsoDl.pct);
}

function netIsoAsyncBytes(r) {
    try {
        const raw = r.getAsyncSize();
        let n = Number(raw);
        if (isNaN(n)) {
            return 0;
        }
        if (n < 0) {
            n = (n >>> 0);
        }
        return n;
    } catch (e) {
        xlog(e);
        return 0;
    }
}

function netIsoEnsureTempDir() {
    const dir = PATHS.XMB + "temp";
    if (!std.exists(dir)) {
        try {
            os.mkdir(dir);
        } catch (eMk) {
            xlog(eMk);
            return null;
        }
    }
    return dir;
}

/**
 * Segmento completo em temp (GET síncrono), depois cópia para partPath — o destino final não é escrito até o GET acabar.
 */
function netIsoDownloadSegmentBufferedToPart(segUrl, partPath, segLen, tuning) {
    const dir = netIsoEnsureTempDir();
    if (!dir) {
        gNetIsoDl.err = true;
        return;
    }
    const stagePath = dir + "/netiso_seg.bin";
    try {
        if (std.exists(stagePath)) {
            try {
                os.remove(stagePath);
            } catch (eRm) {
                xlog(eRm);
            }
        }
        const r = new Request();
        r.keepalive = false;
        r.download(segUrl, stagePath);
        const got = netIsoGetFileSize(stagePath);
        if (got < segLen) {
            xlog("Net ISO: segmento incompleto (buffer) " + got + " / " + segLen);
            gNetIsoDl.err = true;
            return;
        }
        netIsoCopyFileReplace(stagePath, partPath);
    } catch (eDl) {
        xlog(eDl);
        gNetIsoDl.err = true;
    } finally {
        if (std.exists(stagePath)) {
            try {
                os.remove(stagePath);
            } catch (eCl) {
                xlog(eCl);
            }
        }
    }
    if ((tuning.afterSegmentMs | 0) > 0 && !gNetIsoDl.err) {
        os.sleep(tuning.afterSegmentMs);
    }
}

function netIsoParentDirAndFile(fullPath) {
    const idx = fullPath.lastIndexOf("/");
    if (idx < 0) {
        return { dir: "", base: fullPath };
    }
    return { dir: fullPath.slice(0, idx + 1), base: fullPath.slice(idx + 1) };
}

function netIsoGetFileSize(fullPath) {
    if (!fullPath) {
        return 0;
    }
    if (std.exists(fullPath)) {
        try {
            const fd = os.open(fullPath, os.O_RDONLY);
            let len = os.seek(fd, 0, std.SEEK_END);
            os.close(fd);
            len = Number(len);
            if (len > 0 && !isNaN(len)) {
                return len;
            }
        } catch (e0) {
            xlog(e0);
        }
    }
    const { dir, base } = netIsoParentDirAndFile(fullPath);
    if (!dir || !std.exists(dir)) {
        return 0;
    }
    try {
        const items = System.listDir(dir);
        const bl = base.toLowerCase();
        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            if (it.dir) {
                continue;
            }
            if (it.name.toLowerCase() === bl) {
                const sz = Number(it.size);
                return (!isNaN(sz) && sz > 0) ? sz : 0;
            }
        }
    } catch (e) {
        xlog(e);
    }
    return 0;
}

function netIsoPad2(n) {
    n = n | 0;
    return (n < 10 ? "0" : "") + n;
}

/** Tempo estimado restante (mesma regra que o ecrã cheio); string vazia se ainda não der para calcular. */
function netIsoEtaString() {
    const now = Date.now();
    const t0 = gNetIsoDl.startMs || now;
    const elapsedSec = Math.max(0, Math.floor((now - t0) / 1000));
    const dl = Math.floor(Number(gNetIsoDl.downloaded));
    const tot = Math.floor(Number(gNetIsoDl.total));
    if (!(tot > 0 && dl > 8192 && elapsedSec >= 3)) {
        return "";
    }
    const rate = dl / elapsedSec;
    if (rate <= 256) {
        return "";
    }
    const rem = Math.max(0, tot - dl);
    const etaSec = Math.floor(rem / rate);
    if (etaSec >= 3600) {
        const h = Math.floor(etaSec / 3600);
        return `ETA ~${h}h+`;
    }
    if (etaSec > 0) {
        const am = Math.min(99, Math.floor(etaSec / 60));
        const asec = etaSec % 60;
        return `ETA ~${netIsoPad2(am)}:${netIsoPad2(asec)}`;
    }
    return "";
}

function netIsoBytesLine() {
    const st = gNetIsoDl.segmentsTotal | 0;
    const sc = gNetIsoDl.segmentCur | 0;
    const segTag = (st > 0 && sc > 0) ? ("  " + sc + "/" + st) : "";
    const tot = Math.floor(Number(gNetIsoDl.total));
    if (tot > 0) {
        let dl = Math.floor(Number(gNetIsoDl.downloaded));
        if (dl < 1 && gNetIsoDl.pct > 0) {
            dl = Math.floor((gNetIsoDl.pct / 100) * tot);
        }
        let line = `${formatFileSize(dl)} / ${formatFileSize(tot)}${segTag}`;
        const eta = netIsoEtaString();
        if (eta.length > 0) {
            line += "   " + eta;
        }
        return line;
    }
    return "A transferir..." + segTag;
}

function netIsoTimeLine() {
    const now = Date.now();
    const t0 = gNetIsoDl.startMs || now;
    const elapsedSec = Math.max(0, Math.floor((now - t0) / 1000));
    const em = Math.floor(elapsedSec / 60);
    const es = elapsedSec % 60;
    return `Tempo ${netIsoPad2(em)}:${netIsoPad2(es)}`;
}

function netIsoDialogBarPos() {
    const lineTopY = UICONST.DialogInfo.LineYTop;
    const lineBottomY = UICONST.DialogInfo.LineYBottom;
    const y = ((lineTopY + lineBottomY) >> 1) - (ScrCanvas.height >> 1);
    return { X: 0, Y: y };
}

/** Mesmo “chrome” que DrawUIDialog: overlay escuro, linhas, ícone, título; barra ao centro da área do diálogo. */
function netIsoDrawDownloadFrame(barPos, pctDisp) {
    if (!gNetIsoDl.showUi) { return; }
    Screen.clear();
    const ovColor = Color.setA(DashUI.Overlay.Color, DashUI.Overlay.Alpha);
    Draw.rect(0, 0, ScrCanvas.width, ScrCanvas.height, ovColor);

    const baseA = DashUI.PbarAlpha;
    const lineCol = Color.setA(UICONST.DialogInfo.LineCol, baseA);
    const lineTopY = UICONST.DialogInfo.LineYTop;
    const lineBottomY = UICONST.DialogInfo.LineYBottom;
    const iconX = UICONST.DialogInfo.IconX;

    Draw.line(0, lineTopY, ScrCanvas.width, lineTopY, lineCol);
    Draw.line(0, lineBottomY, ScrCanvas.width, lineBottomY, lineCol);

    const discId = FindDashIcon("DISC_PS2");
    if (discId >= 0) {
        const ico = {
            ID: discId,
            Alpha: baseA,
            Width: 24,
            Height: 24,
            X: iconX,
            Y: lineTopY - 25
        };
        DrawDashIcon(ico);
    }

    const titleStr = gNetIsoDl.label ? gNetIsoDl.label : "A transferir…";
    const titleTxt = {
        Text: titleStr,
        Position: { X: iconX + 30, Y: lineTopY - 25 },
        Alpha: baseA
    };
    TxtPrint(titleTxt);

    DrawProgressBar(barPos, pctDisp, "");

    TxtPrint({
        Text: [ netIsoBytesLine() ],
        Alignment: "CENTER",
        Position: { X: barPos.X, Y: barPos.Y + 78 },
        Alpha: baseA
    });
    TxtPrint({
        Text: [ netIsoTimeLine() ],
        Alignment: "CENTER",
        Position: { X: barPos.X, Y: barPos.Y + 96 },
        Alpha: baseA
    });
    Screen.flip();
}

function netIsoSpinPollRequest(r, barPos, baseDone, spin, tuning) {
    const stallMs = tuning.stallMs;
    const spinMs = netIsoPollYieldMs(tuning.spinMs);
    const drawMs = tuning.drawMs;
    const loopStart = Date.now();
    let lastDrawMs = loopStart - drawMs;
    let lastPctLineMs = 0;
    let lastProgress = 0;
    let lastChangeMs = Date.now();
    for (;;) {
        let done = false;
        try {
            done = r.ready();
        } catch (eReady) {
            xlog(eReady);
            gNetIsoDl.err = true;
            return spin;
        }
        if (done) {
            return spin;
        }
        /* Só getAsyncSize: abrir o mesmo ficheiro em O_RDONLY enquanto asyncDownload escreve
         * no USB/BDM costuma crashar a meio do segmento (ex. ~24 MiB). */
        const fromAsync = netIsoAsyncBytes(r);
        const segProg = fromAsync;
        const cur = baseDone + segProg;
        gNetIsoDl.downloaded = cur;
        if (cur > lastProgress) {
            lastProgress = cur;
            lastChangeMs = Date.now();
        } else if (lastProgress < 1 && (Date.now() - loopStart > 120000)) {
            gNetIsoDl.err = true;
            xlog("Net ISO: sem dados após 120s");
            return spin;
        } else if (lastProgress > 0 && (Date.now() - lastChangeMs > stallMs)) {
            gNetIsoDl.err = true;
            xlog("Net ISO: transferência parada (stall)");
            return spin;
        }
        if (gNetIsoDl.total > 0 && gNetIsoDl.downloaded > 0) {
            gNetIsoDl.pct = Math.min(99, Math.floor((100 * gNetIsoDl.downloaded) / gNetIsoDl.total));
        }
        const tLine = Date.now();
        if (gNetIsoDl.showLivePct && ((lastPctLineMs === 0) || (tLine - lastPctLineMs >= 200))) {
            lastPctLineMs = tLine;
            netIsoSyncLivePctLine();
        }
        spin++;
        const now = Date.now();
        if (now - lastDrawMs >= drawMs) {
            lastDrawMs = now;
            const pctDisp = (gNetIsoDl.total > 0)
                ? gNetIsoDl.pct
                : (12 + ((spin * 3) % 78));
            netIsoDrawDownloadFrame(barPos, pctDisp);
        }
        os.sleep(spinMs);
    }
}

/**
 * Só getAsyncSize em loop — não chama r.ready() no fim (ready() faz fclose outra vez depois da thread em save mode; vários
 * segmentos seguidos crasham). O objeto Request fica por libertar pelo GC; novo Request em cada segmento.
 */
function netIsoSpinSegmentSaveNoReady(r, barPos, baseDone, spin, tuning, fileBytes) {
    const stallMs = tuning.stallMs;
    const spinMs = netIsoPollYieldMs(tuning.spinMs);
    const drawMs = tuning.drawMs;
    const loopStart = Date.now();
    let lastDrawMs = loopStart - drawMs;
    let lastPctLineMs = 0;
    let lastProgress = 0;
    let lastChangeMs = Date.now();
    const need = Math.max(0, fileBytes | 0);
    const ticksNeed = Math.max(1, Math.min(8, tuning.segmentStableTicks | 0));
    let stableOk = 0;
    for (;;) {
        const fromAsync = netIsoAsyncBytes(r);
        const cur = baseDone + fromAsync;
        gNetIsoDl.downloaded = cur;
        if (cur > lastProgress) {
            lastProgress = cur;
            lastChangeMs = Date.now();
            stableOk = 0;
        } else if (lastProgress < 1 && (Date.now() - loopStart > 120000)) {
            gNetIsoDl.err = true;
            xlog("Net ISO: sem dados após 120s (segmento)");
            return spin;
        } else if (lastProgress > 0 && (Date.now() - lastChangeMs > stallMs)) {
            if (need > 0 && fromAsync >= need) {
                break;
            }
            gNetIsoDl.err = true;
            xlog("Net ISO: segmento parado (stall)");
            return spin;
        }
        if (need > 0 && fromAsync >= need) {
            stableOk++;
            if (stableOk >= ticksNeed) {
                break;
            }
        }
        if (gNetIsoDl.total > 0 && gNetIsoDl.downloaded > 0) {
            gNetIsoDl.pct = Math.min(99, Math.floor((100 * gNetIsoDl.downloaded) / gNetIsoDl.total));
        }
        const tLine = Date.now();
        if (gNetIsoDl.showLivePct && ((lastPctLineMs === 0) || (tLine - lastPctLineMs >= 200))) {
            lastPctLineMs = tLine;
            netIsoSyncLivePctLine();
        }
        spin++;
        const now = Date.now();
        if (gNetIsoDl.showUi && (now - lastDrawMs >= drawMs)) {
            lastDrawMs = now;
            const pctDisp = (gNetIsoDl.total > 0)
                ? gNetIsoDl.pct
                : (12 + ((spin * 3) % 78));
            netIsoDrawDownloadFrame(barPos, pctDisp);
        }
        os.sleep(spinMs);
    }
    if ((tuning.afterSegmentMs | 0) > 0) {
        os.sleep(tuning.afterSegmentMs);
    }
    return spin;
}

/**
 * GET url → ficheiro local.
 * Download único: asyncDownload + netIsoSpinPollRequest (ready() no fim).
 * Segmentos: asyncDownload + netIsoSpinSegmentSaveNoReady (só getAsyncSize; expectLen = bytes deste GET).
 */
function netIsoHttpGetToFile(url, destPath, barPos, baseDoneGlobal, spin, tuning, segmentDl, expectLen) {
    const r = new Request();
    const seg = segmentDl === true;
    try {
        if (seg) {
            const need = (expectLen !== undefined && expectLen !== null) ? (expectLen | 0) : 0;
            r.keepalive = false;
            if (typeof r.asyncDownload === "function" && need > 0) {
                r.asyncDownload(url, destPath);
                return netIsoSpinSegmentSaveNoReady(r, barPos, baseDoneGlobal, spin, tuning, need);
            }
            r.download(url, destPath);
            if (!gNetIsoDl.err && (tuning.afterSegmentMs | 0) > 0) {
                os.sleep(tuning.afterSegmentMs);
            }
            return spin;
        }
        if (typeof r.asyncDownload === "function") {
            r.keepalive = true;
            r.asyncDownload(url, destPath);
            return netIsoSpinPollRequest(r, barPos, baseDoneGlobal, spin, tuning);
        }
        r.keepalive = false;
        r.download(url, destPath);
    } catch (e) {
        xlog(e);
        gNetIsoDl.err = true;
    }
    return spin;
}

function netIsoDownloadWithProgress(url, destPath, expectedSize, displayName, showProgressUi, skipOuterMutex) {
    if (showProgressUi === undefined) { showProgressUi = true; }
    if (skipOuterMutex === undefined) { skipOuterMutex = false; }
    gNetIsoDl.showUi = showProgressUi;
    gNetIsoDl.showLivePct = !showProgressUi;
    gNetIsoDl.segmentsTotal = 0;
    gNetIsoDl.segmentCur = 0;
    gNetIsoDl.livePctLine = "";
    gNetIsoDl.err = false;
    gNetIsoDl.pct = 0;
    gNetIsoDl.downloaded = 0;
    gNetIsoDl.destPath = destPath;
    gNetIsoDl.label = displayName ? String(displayName).slice(0, 56) : "";
    gNetIsoDl.total = (Number(expectedSize) > 0) ? Number(expectedSize) : 0;
    gNetIsoDl.startMs = Date.now();

    let prevOv = 0;
    let prevCol = { R: 0, G: 0, B: 0 };
    if (showProgressUi) {
        prevOv = DashUI.Overlay.Alpha;
        prevCol = DashUI.Overlay.Color
            ? { R: DashUI.Overlay.Color.R, G: DashUI.Overlay.Color.G, B: DashUI.Overlay.Color.B }
            : { R: 0, G: 0, B: 0 };
        DashUI.Overlay.Color = { R: 0, G: 0, B: 0 };
        DashUI.Overlay.Alpha = 64;
        DashUI.PbarAlpha = 128;
    }

    const barPos = netIsoDialogBarPos();
    let spin = 0;
    spin++;
    const pctInd = (gNetIsoDl.total > 0)
        ? 0
        : (12 + ((spin * 3) % 78));
    netIsoDrawDownloadFrame(barPos, pctInd);

    const tuning = netIsoGetDownloadTuning();
    const parsed = netIsoParseDownloadUrl(url);
    const wantSegUi = tuning.useSegments && parsed
        && (gNetIsoDl.total > tuning.segmentBytes);
    if (wantSegUi) {
        gNetIsoDl.segmentsTotal = Math.max(1, Math.ceil(gNetIsoDl.total / tuning.segmentBytes));
    }
    netIsoSyncLivePctLine();

    if (!skipOuterMutex) {
        MainMutex.unlock();
    }
    try {
        if (parsed) {
            const probed = netIsoProbeRemoteFileSize(parsed.base, parsed.fname, tuning.probeMs);
            if (probed > 0) {
                if (gNetIsoDl.total > 0 && probed !== gNetIsoDl.total) {
                    xlog("Net ISO: tamanho lista vs servidor " + gNetIsoDl.total + " → " + probed);
                }
                gNetIsoDl.total = probed;
            }
        }
        const wantSeg = tuning.useSegments && parsed
            && (gNetIsoDl.total > tuning.segmentBytes);
        if (wantSeg) {
            gNetIsoDl.segmentsTotal = Math.max(1, Math.ceil(gNetIsoDl.total / tuning.segmentBytes));
        } else {
            gNetIsoDl.segmentsTotal = 0;
        }
        netIsoSyncLivePctLine();

        if (std.exists(destPath)) {
            try {
                os.remove(destPath);
            } catch (eRm) {
                xlog(eRm);
            }
        }
        const legacySeg = destPath + ".seg";
        if (std.exists(legacySeg)) {
            try {
                os.remove(legacySeg);
            } catch (eRs) {
                xlog(eRs);
            }
        }
        const legacySegCh = legacySeg + ".chunk";
        if (std.exists(legacySegCh)) {
            try {
                os.remove(legacySegCh);
            } catch (eRsc) {
                xlog(eRsc);
            }
        }
        for (let pi = 0; pi < 64; pi++) {
            const pc = destPath + ".part" + pi + ".c";
            if (std.exists(pc)) {
                try {
                    os.remove(pc);
                } catch (ePc) {
                    xlog(ePc);
                }
            }
        }

        if (wantSeg) {
            netIsoDownloadSegmented(parsed, destPath, gNetIsoDl.total, barPos, tuning);
        } else {
            const r = new Request();
            r.keepalive = true;
            if (typeof r.asyncDownload === "function") {
                r.asyncDownload(url, destPath);
                netIsoSpinPollRequest(r, barPos, 0, spin, tuning);
            } else {
                r.download(url, destPath);
            }
        }
        if (!gNetIsoDl.err) {
            if (!std.exists(destPath)) {
                gNetIsoDl.err = true;
            } else {
                const got = netIsoGetFileSize(destPath);
                gNetIsoDl.downloaded = got;
                if (gNetIsoDl.total > 0) {
                    if (got < gNetIsoDl.total - 8192) {
                        gNetIsoDl.err = true;
                        try {
                            os.remove(destPath);
                        } catch (e2) {
                            xlog(e2);
                        }
                    } else {
                        gNetIsoDl.downloaded = gNetIsoDl.total;
                    }
                } else if (got < 1) {
                    gNetIsoDl.err = true;
                    try {
                        os.remove(destPath);
                    } catch (e3) {
                        xlog(e3);
                    }
                }
            }
        }
    } catch (e) {
        xlog(e);
        gNetIsoDl.err = true;
    } finally {
        if (!skipOuterMutex) {
            MainMutex.lock();
        }
    }

    if (!gNetIsoDl.err) {
        gNetIsoDl.pct = 100;
        if (gNetIsoDl.total > 0) {
            gNetIsoDl.downloaded = gNetIsoDl.total;
        } else if (gNetIsoDl.destPath) {
            gNetIsoDl.downloaded = netIsoGetFileSize(gNetIsoDl.destPath);
        }
    }
    netIsoSyncLivePctLine();

    netIsoDrawDownloadFrame(barPos, gNetIsoDl.err ? 0 : 100);
    if (showProgressUi && (tuning.successPauseMs | 0) > 0) {
        os.sleep(tuning.successPauseMs);
    }

    const ok = !gNetIsoDl.err && std.exists(destPath);
    if (showProgressUi) {
        DashUI.Overlay.Alpha = prevOv;
        DashUI.Overlay.Color = prevCol;
        DashUI.PbarAlpha = 0;
    }
    gNetIsoDl.showUi = true;
    gNetIsoDl.showLivePct = false;
    gNetIsoDl.livePctLine = "";
    gNetIsoDl.segmentsTotal = 0;
    gNetIsoDl.segmentCur = 0;
    return ok;
}

function DrawUIPIC2() {
    const obj = DashUI.PIC2;
    obj.A = 0;
    obj.Fade.Progress = 0.0f;
}
function DashUISetSpecialExit(type) {
	gExit = { Type: type };
	DashUI.State.Next = 5;
}
function DashUISetElfExecution(Data) {
	gExit = {};
    gExit.Elf           = { Path: Data.Path };
    gExit.Elf.Args      = ('Args' in Data) ? Data.Args : [];
    gExit.Elf.RebootIOP = ('RebootIOP' in Data) ? (Data.RebootIOP === "true") : false;
	if ('Code' in Data)	{ gExit.Elf.Code = Data.Code; }
	if ('__skipElfCheck' in Data) { gExit.Elf.__skipElfCheck = Data.__skipElfCheck; }
	if ('__keepNetForSmb' in Data) { gExit.Elf.__keepNetForSmb = Data.__keepNetForSmb; }
	DashUI.State.Next = 5;
}
function UpdateIconSpinning() {
    DashUI.LoadSpinning = DashUI.LoadSpinning + 0.05f;
    if (DashUI.LoadSpinning == 6.05f) { DashUI.LoadSpinning = 0.05f; }
}
function GetHighlightedElement() {
    const mainList = DashUI.ItemCollection.Current;
    const mainCur = DashUI.Items.Current;
    if (DashUI.SubMenu.Level < 0) {
        if (mainCur < 0 || mainCur >= mainList.length) { return {}; }
        return mainList[mainCur];
    }
    const coll = DashUI.SubMenu.ItemCollection[DashUI.SubMenu.Level];
    if (!coll || !coll.Items) { return {}; }
    const items = coll.Items;
    const cur = DashUI.SubMenu.Items.Current;
    if (cur < 0 || cur >= items.length) { return {}; }
    return items[cur];
}
function UIAnimationCommonFade_Start(element, work, isIn) {
	if ((element.Display && isIn === true) || (!element.Display && isIn === false)) {
		return;
	}

	element.Fade.In = isIn;
	element.Fade.Progress = 0.0f;
	element.Fade.Running = true;
	element.Display = true;

	DashUI.AnimationQueue.push(() => {
		const result = work();
		if (result) { element.Display = isIn; }
		return result;
	});
}
function UIAnimationCommon_Work(anim, progress) {

	anim.Progress += progress;

	if (anim.Progress >= 1.0f) {
		anim.Progress = 1.0f;
		anim.Running = false;
		return true;
	}

	return false;
}

//////////////////////////////////////////////////////////////////////////
///*				   			 Categories							  *///
//////////////////////////////////////////////////////////////////////////

function UIAnimationCategoryMove_Start(delta) {
    const obj = DashUI.Category;
    const next = obj.Next + delta;
	const run = next >= 0 && next < CATNAME.length;
    if ((run) && (obj.Current === obj.Next)) {
		DashUIResetBg();
		PlayCursorSfx();
        obj.Next = next;
        obj.Animation.Running = true;
        obj.Animation.Progress = 0.0f;
		DashUI.AnimationQueue.push(UIAnimationCategoryMove_Work);
		UIAnimationItemCollectionMove_Start();
	}
}
function UIAnimationCategoryMove_Work() {
    const anim = DashUI.Category.Animation;
    if (!anim.Running) { return true; }
    anim.Progress += 0.075f;
    if (anim.Progress < 1.0f) {
		const l = pad.pressed(Pads.LEFT) || (pad.lx < -64);
		const r = pad.pressed(Pads.RIGHT) || (pad.lx > 64);
        if ((anim.Progress > 0.6f) && (l || r)) {
			const delta = l ? -1 : 1;
			UIAnimationCategoryMove_Reset(delta)
		}
		return false;
	}

    anim.Progress = 0.0f;
    anim.Running = false;
	DashUI.Category.Current = DashUI.Category.Next;

	return true;
}
function UIAnimationCategoryMove_Reset(delta) {
    const catObj = DashUI.Category;
    const next = catObj.Next + delta;
	const run = next >= 0 && next < CATNAME.length;
	if (!run) { return }

	DashUIResetBg();
    PlayCursorSfx();
    const collObj = DashUI.ItemCollection;

	DashUI.Items.Current        = DashCatItems[catObj.Next].Default;
	DashUI.Items.Next           = DashUI.Items.Current;
    catObj.Current              = catObj.Next;
    catObj.Next                 = next;
    catObj.Animation.Progress   = 0.0f;
    collObj.Swipe.Dir           = catObj.Next - catObj.Current;
    collObj.Current             = collObj.Next;
    collObj.Next                = DashCatItems[catObj.Next].Items;
    collObj.Swipe.Progress      = -0.075f;
}
function DrawUICategories() {
	if ((!DashUI.Category.Display) || (DashUI.SubMenu.Level > 1)) { return; }

	const Icon      = {};
	const Text      = {};
	Text.Position   = {};
	Text.Alignment  = "CENTER";
	Text.Scale      = FontObj.SizeM;

    const fade          = DashUI.Category.Fade;
    const dialogFade    = (DashUI.Dialog.Display && (!DashUI.Dialog.Data[DashUI.Dialog.Level].BG))
	const faderunning   = fade.Running || dialogFade;
	let fadeProgress    = getFadeProgress(fade);
    if (dialogFade) { fadeProgress = 1 - getFadeProgress(DashUI.Dialog.Fade); }

    const anim      = DashUI.Category.Animation;
	const easing    = (anim.Running) ? cubicEaseOut(anim.Progress) : 0;
	const current   = DashUI.Category.Current;
	const next      = DashUI.Category.Next;
	const nextDif   = next - current;
    const fadeX     = 20 * (1 - fadeProgress);
    const fadeY     = -10 * (1 - fadeProgress)

	// Sub Menu Modifiers
    const subMod = DashUI.SubMenu.Display;
    const subLvl = DashUI.SubMenu.Level;
	const subfade = DashUI.SubMenu.Fade;
	const subfadeProgress = getFadeProgress(subfade);

	const subSelXmod 	= UICONST.Category.SubX * subfadeProgress;
	const subSelAmod 	= ~~(128 * subfadeProgress);
	const subNoSelXmod 	= 18 * subfadeProgress + (18 * subLvl);
	const subNoSelYmod 	= 5 * subfadeProgress + (5 * subLvl);
    const subNoSelAmod  = (subLvl < 1) ? ~~(-102 * subfadeProgress) : -102 - (26 * subfadeProgress);
    const subLevelXmod  = UICONST.Category.SubX * subLvl;

	// Context Modifiers
	const contextMod          = DashUI.Context.Display;
	const contextfade         = DashUI.Context.Fade;
    const contextfadeProgress = getFadeProgress(contextfade);
    const unselAsubCtxMod     = ~~(-8 * contextfadeProgress);
    const UnselACtxMod        = ~~(-102 * contextfadeProgress);
    const UnselPosCtxMod      = 5 * contextfadeProgress;

    const halfMod    = UICONST.IcoUnselMod >> 1;
	const contextX 	 = halfMod * contextfadeProgress;

    for (let i = 0; i < CATNAME.length; i++) {

        // Cull: Objects greatly above and below the selected item
		const dif = i - current;
		if (dif < -3) { continue; }
		else if (dif > 7) { break; }

		Icon.ID 		= i;
		Icon.Alpha 		= 110;
		Icon.Width 	    = UICONST.IcoUnselSize;
		Icon.Height     = UICONST.IcoUnselSize;
		Icon.X 			= UICONST.Category.IconX;
		Icon.Y 			= UICONST.Category.IconY;
		Icon.Tint		= UICONST.Category.IconUnselectedColor;

        const isSelected = (i === current || i === next);

        if (isSelected) {
            Text.Text = [getLocalText(CATNAME[i])];
            Text.Position.X = -142;
            Text.Position.Y = -54;
        }

        if (i === current) {
            const sizeMod = UICONST.IcoSelSize - UICONST.IcoUnselMod * easing;
			Icon.X 			+= ((nextDif < 0) ? 102 * easing : 81 * easing) * -nextDif;
			Icon.Y 			+= 15 * easing;
			Icon.Width 		= sizeMod;
			Icon.Height 	= sizeMod;
			Icon.Tint		 = (anim.Running) ? interpolateColorObj(UICONST.Category.IconSelectedColor, UICONST.Category.IconUnselectedColor, anim.Progress) : UICONST.Category.IconSelectedColor;
			Text.Color		 = (anim.Running) ? interpolateColorObj(UICONST.TextSelectedColor, UICONST.TextUnselectedColor, anim.Progress) : UICONST.TextSelectedColor;
			Text.Alpha 	     = 128 + (-120 * easing);
			Text.Position.X  = Text.Position.X - (92 * easing * nextDif);

			if (subMod) {
				Icon.X 			-= (subSelXmod + subLevelXmod);
				Icon.Alpha 		-= (128 * subfadeProgress) * subLvl;
				Text.Position.X -= (subSelXmod + subLevelXmod);
				Text.Alpha 	    -= subSelAmod;
				Text.Alpha 	    -= (128 * subLvl);
			}

			if (contextMod) {
				Icon.Tint		 = interpolateColorObj(UICONST.Category.IconSelectedColor, UICONST.Category.IconUnselectedColor, contextfadeProgress);
				Text.Alpha 	    -= ~~(128 * contextfadeProgress); ;
				if (subMod) { Icon.X -= contextX; }
			}
		}
        else if (i === next) {
            const sizeMod = UICONST.IcoSelSize - UICONST.IcoUnselMod * (1 - easing);
			Icon.X 			 = Icon.X - ((nextDif > 0) ? 102 * (1 - easing) : 81 * (1 - easing)) * -nextDif;
			Icon.Y 			+= 15 * (1 - easing);
            Icon.Width       = sizeMod;
			Icon.Height 	 = sizeMod;
			Icon.Tint		 = interpolateColorObj(UICONST.Category.IconUnselectedColor, UICONST.Category.IconSelectedColor, anim.Progress);
			Text.Position.X  = Text.Position.X + (((nextDif < 0) ? 88 : 92) * (1 - easing) * nextDif);
			Text.Color		 = interpolateColorObj(UICONST.TextUnselectedColor, UICONST.TextSelectedColor, anim.Progress);
			Text.Alpha 	     = 128 - (110 * (1 - easing));
		}
		else {
			const baseX = (dif < 0) ? dif * 81 : (dif * 81 + 21);
			Icon.Y 		+= 15;
			Icon.X 		+= baseX;
			Icon.X 		+= 81 * -nextDif * easing;

            if (subMod) {
                Icon.Alpha += (subNoSelAmod);
                Icon.X -= subNoSelXmod;
                Icon.Y += subNoSelYmod;
                if (contextMod) {
                    Icon.Alpha += unselAsubCtxMod;
                }
            }
			else if (contextMod) {
                Icon.Alpha += UnselACtxMod;
                Icon.X -= UnselPosCtxMod;
                Icon.Y += UnselPosCtxMod;
			}
		}

		if (faderunning) {
			Icon.Alpha 		= ~~(Icon.Alpha * fadeProgress);
            const offsetX = (dif > 0) ? fadeX : -fadeX;
			Icon.X += offsetX;
            Icon.Y += fadeY;

            if (isSelected) {
                Text.Alpha = ~~(Text.Alpha * fadeProgress);
                Text.Position.X += offsetX;
                Text.Position.Y += fadeY;
            }
		}

		const insideLimits = (Icon.X > -UICONST.ScreenDrawLimit) && (Icon.X < UICONST.ScrRightLimit);
		if (insideLimits) { DrawDashIcon(Icon); }
        if (isSelected) { TxtPrint(Text); }
	}
}

//////////////////////////////////////////////////////////////////////////
///*				   			   Items							  *///
//////////////////////////////////////////////////////////////////////////

function UIAnimationCategoryItemsMove_Start(delta) {
    const obj = DashUI.Items;
    const next = obj.Next + delta;
	const run = next >= 0 && next < DashUI.ItemCollection.Current.length;
    if ((run) && (obj.Current === obj.Next)) {
		DashUIResetBg();
		PlayCursorSfx();
        obj.Next = next;
        obj.Animation.Running = true;
        obj.Animation.Progress = 0.0f;
		DashCatItems[DashUI.Category.Current].Default = next;
		DashUI.AnimationQueue.push(UIAnimationCategoryItemsMove_Work);
	}
}
function UIAnimationCategoryItemsMove_Work() {
    const anim = DashUI.Items.Animation;
    if (!anim.Running) { return true; }

    anim.Progress += 0.07f;
    if (anim.Progress < 1.0f) {
		const u = pad.pressed(Pads.UP) || (pad.ly < -64);
		const d = pad.pressed(Pads.DOWN) || (pad.ly > 64);
        if ((anim.Progress > 0.6f) && (u || d)) {
			const delta = u ? -1 : 1;
			UIAnimationCategoryItemsMove_Reset(delta)
		}
		return false;
	}

    anim.Progress = 0.0f;
    anim.Running = false;
	DashUI.Items.Current = DashUI.Items.Next;

	return true;
}
function UIAnimationCategoryItemsMove_Reset(delta) {
    const obj = DashUI.Items;
    const next = obj.Next + delta;
	const run = next >= 0 && next < DashUI.ItemCollection.Current.length;
	if (!run) { return; }

	PlayCursorSfx();
	DashUIResetBg();
    obj.Animation.Progress = 0.0f;
    obj.Current = obj.Next;
    obj.Next = next;
	DashCatItems[DashUI.Category.Current].Default = next;
}
function UIAnimationItemCollectionMove_Start() {
    const swipe = DashUI.ItemCollection.Swipe;
    swipe.Running = true;
    swipe.Progress = 0.0f;
    swipe.Dir = DashUI.Category.Next - DashUI.Category.Current;
	DashUI.ItemCollection.Next = DashCatItems[DashUI.Category.Next].Items;
	DashUI.AnimationQueue.push(UIAnimationItemCollectionMove_Work);
}
function UIAnimationItemCollectionMove_Work() {
    const swipe = DashUI.ItemCollection.Swipe;
    if (!swipe.Running) { return true; }
    swipe.Progress += 0.075f;
    if (swipe.Progress < 1.0f) { return false; }

    swipe.Progress = 0.0f;
    swipe.Running = false;

	DashUI.ItemCollection.Current = DashUI.ItemCollection.Next;
	DashUI.Items.Current = DashCatItems[DashUI.Category.Next].Default;
	DashUI.Items.Next = DashUI.Items.Current;

	return true;
}
function DrawUICategoryItems() {
	DrawUICategoryItems_Work(DashUI.ItemCollection.Current, DashUI.Items.Current, 0)
	if (DashUI.ItemCollection.Swipe.Running) {
		DrawUICategoryItems_Work(DashUI.ItemCollection.Next, DashCatItems[DashUI.Category.Next].Default, 92 * DashUI.ItemCollection.Swipe.Dir);
	}
}
function DrawUICategoryItems_Work(items, current, x) {
    if ((!DashUI.Items.Display) || (DashUI.SubMenu.Level > 1)) return;

	const Name = {};
	const Icon = {};

	const swipe = DashUI.ItemCollection.Swipe;
	const swipeProgress = swipe.Running ?
		((x !== 0) ?
			cubicEaseOut(swipe.Progress) :
			cubicEaseIn(swipe.Progress))
		: 1;

	const swipeConst = swipe.Running ? cubicEaseOut(swipe.Progress) : 0;
	const swipeoffsetX = x + 92 * swipeConst * -swipe.Dir;

    const fade          = DashUI.Items.Fade;
    const dialogBg      = (DashUI.Dialog.Display && (!DashUI.Dialog.Data[DashUI.Dialog.Level].BG));
    let faderunning     = fade.Running || dialogBg;
	let fadeProgress    = getFadeProgress(fade);
    if (dialogBg) { fadeProgress = 1 - getFadeProgress(DashUI.Dialog.Fade); }

    const anim       = DashUI.Items.Animation;
    const easing     = anim.Running ? cubicEaseOut(anim.Progress) : 0;
    const next       = DashUI.Items.Next;
    const dir        = next - current;
    const total      = items.length;

    const halfMod    = UICONST.IcoUnselMod >> 1;
    const upOff      = -102;
    const downOff    = 18;
    const textUp     = -99;
    const textDown   = 21;
    const icoSelSize = UICONST.IcoSelSize - UICONST.IcoUnselMod * easing;

    const modCurrY      = (dir < 0 ? 82 : -142) * easing;
    const modNextShift  = UICONST.SubItemSlotSize * easing * (-dir);

    // Sub Menu Modifiers
    const subLevel          = DashUI.SubMenu.Level;
	const subMod            = DashUI.SubMenu.Display;
	const subfade           = DashUI.SubMenu.Fade;
	const subfadeProgress   = getFadeProgress(subfade);

    const subNoSelAmod      = (subLevel < 1) ? ~~(-98 * subfadeProgress) : -98 - ~~(12 * subfadeProgress);
	const subNoSelXmod 		= UICONST.CatItems.SubNoSelX * subfadeProgress + (UICONST.CatItems.SubNoSelX * subLevel);
    const subSelAmod        = (subLevel < 1) ? ~~(-128 * subfadeProgress) : -128;
	const subSelXmod 		= UICONST.Category.SubX * subfadeProgress;
	const subLevelXmod 		= UICONST.Category.SubX * subLevel;
    const subNoSelTextAmod  = (subLevel < 1) ? ~~(-128 * subfadeProgress) : -128;
	const subSelAFadeMod 	= ~~((128 * subfadeProgress) * subLevel);

	// Context Modifiers
	const contextMod        = DashUI.Context.Display;
	const contextfade       = DashUI.Context.Fade;
	const contextfadeProgress = getFadeProgress(contextfade);
	const contextX          = halfMod * contextfadeProgress;

    for (let i = 0; i < total; i++) {
		// Cull: Objects greatly above and below the selected item
		const diff = i - current;
		if (diff < -4) continue;
		if (diff > 5) break;

        const info = items[i];
        let Desc = false;

        if ('CustomIcon' in info) { Icon.CustomIcon = info.CustomIcon; }
        else if ('CustomIcon' in Icon) { delete Icon.CustomIcon; }
        if ('Color' in Name) { delete Name.Color; }
        if (typeof info.Icon === "string") { info.Icon = FindDashIcon(info.Icon); }

		Icon.ID 		= info.Icon;
		Icon.Alpha 		= 110;
		Icon.Width 		= UICONST.IcoUnselSize;
		Icon.Height 	= UICONST.IcoUnselSize;
		Icon.X 			= UICONST.CatItems.IconX;
		Icon.Y 			= UICONST.CatItems.IconY;
        Name.Text 		= [ getLocalText(info.Name) ];
		Name.Position 	= { X:UICONST.CatItems.TextX, Y: UICONST.CatItems.TextY };
		Name.Scale 		= FontObj.SizeL;
		Name.Alpha 	    = 128;
		Name.Glow   	= false;

        if (i === current) {
            Icon.X      	+= halfMod * easing;
            Icon.Y      	+= modCurrY;
            Icon.Width  	= icoSelSize;
            Icon.Height 	= icoSelSize;
            Name.Position.Y += modCurrY - (9 * easing);
            Name.Glow   	= !anim.Running && !contextMod && !faderunning && !subMod && !swipe.Running;
			Name.Color 		= (anim.Running) ? interpolateColorObj(UICONST.TextSelectedColor, UICONST.TextUnselectedColor, anim.Progress) : UICONST.TextSelectedColor;

            if (Name.Glow) { if (('CustomBG' in info) && (!('Image' in DashUI.ItemBG))) { DashUI.ItemBG.Image = info.CustomBG; } }

			Desc = {
                Text: [ getLocalText(info.Description) ],
                Scale: FontObj.SizeM,
                Position: {
                    X: Name.Position.X,
                    Y: Name.Position.Y + 20
                },
                Alpha: ~~(128 - (128 * easing))
            };

			if (subMod) {
				Icon.X 			-= (subSelXmod + subLevelXmod);
				Icon.Alpha 		-= subSelAFadeMod;
				Name.Alpha 	    += subSelAmod;
				Desc.Alpha 	    += subSelAmod;
				Name.Position.X -= subSelXmod;
                Desc.Position.X -= subSelXmod;
                if (contextMod) { Icon.X -= contextX; }
			}
            else if (contextMod) {
                Icon.X -= contextX;
                Icon.Y -= contextX;
                Icon.Width += UICONST.IcoUnselMod * contextfadeProgress;
                Icon.Height += UICONST.IcoUnselMod * contextfadeProgress;
                Name.Alpha += ~~(-90 * contextfadeProgress);
                Desc.Alpha += ~~(-90 * contextfadeProgress);
                Name.Position.X += contextX;
                Desc.Position.X += contextX;
			}
        }
        else {
            const modOffsetY = diff * UICONST.SubItemSlotSize + modNextShift;
            const baseY 	 = (diff > 0 ? downOff : upOff) + modOffsetY;
            Icon.Y      	+= baseY + halfMod;
            Icon.X      	+= halfMod;

            Name.Position.Y += ((diff > 0 ? textDown : textUp) + modOffsetY);

            if ((anim.Running) && (i === next)) {
                const modYNext 	= (dir < 0 ? 102 : -18) * easing;
                Icon.Width   	+= UICONST.IcoUnselMod * easing;
                Icon.Height  	+= UICONST.IcoUnselMod * easing;
                Icon.X       	-= halfMod * easing;
                Icon.Y       	-= halfMod * easing;
                Icon.Y       	+= modYNext;
                Name.Position.Y += modYNext - (3 * easing);
				Name.Color 		= interpolateColorObj(UICONST.TextUnselectedColor, UICONST.TextSelectedColor, anim.Progress);
				Name.Alpha 	    = 128;

				Desc = {
                    Text: [ getLocalText(info.Description) ],
                    Scale: FontObj.SizeM,
                    Position: {
                        X: Name.Position.X,
                        Y: Name.Position.Y + 20
                    },
                    Alpha: ~~(128 * easing)
                };
            }

			if (subMod) {
				const subNoSelYmod = ((diff > 0) ? -8 : 8) * subfadeProgress;
				Icon.X 			-= subNoSelXmod;
				Icon.Y 			+= (subNoSelYmod + (((diff > 0) ? -8 : 8) * subLevel));
				Icon.Alpha 		+= subNoSelAmod;
				Name.Alpha 	    += subNoSelTextAmod;
				Name.Position.X -= subNoSelXmod;
                Name.Position.Y += subNoSelYmod;
                if (contextMod) {
                    Icon.Alpha += ~~(-12 * contextfadeProgress);
                }
			}
            else if (contextMod) {
				const ctxNoSelYmod = ((diff > 0) ? 10 : -10) * contextfadeProgress;
				Icon.Y 			+= ctxNoSelYmod;
				Icon.Alpha 		+= ~~(-98 * contextfadeProgress);
				Name.Alpha 	    += ~~(-128 * contextfadeProgress);
				Name.Position.Y += ctxNoSelYmod;
			}
        }

		if (faderunning) {
			Icon.Alpha 	= ~~(Icon.Alpha * fadeProgress);
			Name.Alpha 	= ~~(Name.Alpha * fadeProgress);

			const rel = i - current;
			let offsetX = -5 * (1 - fadeProgress);
			let offsetY = 0;
			if (rel < 0)      { offsetY = -20 * (1 - fadeProgress); }
			else if (rel > 0) { offsetY =  20 * (1 - fadeProgress); }

			Icon.X 			+= offsetX;
			Icon.Y 			+= offsetY;
			Name.Position.X += offsetX;
			Name.Position.Y += offsetY;

			if (Desc) {
				Desc.Alpha 	= ~~(Desc.Alpha * fadeProgress);
				Desc.Position.X += offsetX;
				Desc.Position.Y += offsetY;
			}
		}
		else if (swipe.Running) {
			Icon.Alpha 		= ~~(Icon.Alpha * swipeProgress);
			Name.Alpha 	    = (x !== 0) ? ~~(Name.Alpha * swipeProgress) : ~~((Name.Alpha - 64) * swipeProgress);
			Icon.X 			+= swipeoffsetX;
			Name.Position.X += swipeoffsetX;

			if (Desc) { Desc.Alpha = Name.Alpha; Desc.Position.X = Name.Position.X; }
		}

        if (Icon.Y < -UICONST.ScreenDrawLimit) continue;
        if (Icon.Y > UICONST.ScrLowerLimit) break;

		// Draw Focus
		if ((DashUI.SubMenu.Level < 1) && (DashElements.ItemFocus) && (i === current || i === next) && Desc) {
            let FocusA = (subMod) ? Desc.Alpha : (contextMod ? ~~(128 * (1 - contextfadeProgress)) : Desc.Alpha);
            if (FocusA > 0) {

                let focus = DashElements.ItemFocus;

                let isCurrent = (i === current);
                let isNext = (i === next);
                focus.width = 82;
                focus.height = 82;

                if (anim.Running) {
                    const mod = 24 * (isNext ? (1 - easing) : easing);
                    focus.width -= mod;
                    focus.height -= mod;
                }
                else if (contextMod) {
                    const mod = 24 * contextfadeProgress;
                    focus.width += mod;
                    focus.height += mod;
                }

                focus.color = Color.setA(focus.color, FocusA);
                focus.draw(Icon.X - 5, Icon.Y - 5);
            }
		}

        DrawDashIcon(Icon);
        TxtPrint(Name);
		if (Desc) { TxtPrint(Desc); }
    }
}

//////////////////////////////////////////////////////////////////////////
///*				   			 Sub Menu							  *///
//////////////////////////////////////////////////////////////////////////

function DashUIEnterSubMenu(SubMenu) {
    const obj = DashUI.SubMenu;
    obj.Items.Current = SubMenu.Default;
    obj.Items.Next = SubMenu.Default;
    obj.Level++;
    obj.ItemCollection[obj.Level] = SubMenu;
    DashUI.State.Next = 2;
    UIAnimateSubMenuItemsFade_Start(true);
}
function DashUISetNewSubMenu(SubMenu) {
    PlayCursorSfx();
    let initFun = SubMenu.Init;
    if (!initFun) {
        DashUIEnterSubMenu(SubMenu);
        return;
    }

    Tasks.Push(() => initFun(SubMenu));

    DashUI.AnimationQueue.push(() => {
        if (Tasks.length > 0 || Tasks.isRunning) { return false; }
        DashUIEnterSubMenu(SubMenu);
        return true;
    });
}
function DashUIBackFromSubMenu() {
    PlayCancelSfx();
    const prevLevel = DashUI.SubMenu.Level - 1;
    if ((prevLevel < 0) || (!('Init' in DashUI.SubMenu.ItemCollection[prevLevel]))) {
        UIAnimateSubMenuItemsFade_Start(false);
        return;
    }

    const SubMenu = DashUI.SubMenu.ItemCollection[prevLevel];
    SubMenu.Processing = true;
    DashUI.AnimationQueue.push(() => {
        if (!SubMenu.Processing) {
            UIAnimateSubMenuItemsFade_Start(false);
            return true;
        }
        return false;
    });

    Tasks.Push(() => {
        SubMenu.Init(SubMenu);
        delete SubMenu.Processing;
    });
}
function UIAnimateSubMenuItemsFade_Start(isIn) {
	DashUIResetBg();

	const element = DashUI.SubMenu;
	element.Fade.In = isIn;
	element.Fade.Progress = 0.0f;
	element.Fade.Running = true;
	element.Display = true;
	element.PrevAnimation.Display = true;
	DashUI.AnimationQueue.push(UIAnimateSubMenuItemsFade_Work);

	const subElement = DashUI.SubMenu.Animation;
	subElement.Fade.In = isIn;
	subElement.Fade.Progress = 0.0f;
	subElement.Fade.Running = true;
    subElement.Display = true;
    DashUI.AnimationQueue.push(UICONST.Fun.SubMenuFade);
}
function UIAnimateSubMenuItemsFade_Work() {
    const fade = DashUI.SubMenu.Fade;
    if (!fade.Running) { return true; }
    fade.Progress += 0.04f;
    if (fade.Progress < 1.0f) { return false; }

    if (!fade.In) {
        const submenu = DashUI.SubMenu;
        submenu.Level--;
        submenu.Display = (submenu.Level > -1);
        if (submenu.Level > -1) {
            const next = submenu.ItemCollection[submenu.Level].Default;
            submenu.Items.Current = next;
            submenu.Items.Next = next;
        }
        else {
            DashUI.State.Next = 1;
        }
    }

    fade.Progress = 1.0f;
    fade.Running = false;

    return true;
}
function UIAnimationSubMenuItemsMove_Start(delta) {
    const obj = DashUI.SubMenu;
    const objItems = obj.Items;
    const next = objItems.Next + delta;
    const run = next >= 0 && next < obj.ItemCollection[obj.Level].Items.length;
    if ((run) && (objItems.Current === objItems.Next)) {
		DashUIResetBg();
		PlayCursorSfx();
        objItems.Next = next;
        obj.Animation.Running = true;
        obj.Animation.Progress = 0.0f;
		DashUI.AnimationQueue.push(UIAnimationSubMenuItemsMove_Work);
	}
}
function UIAnimationSubMenuItemsMove_Work() {
    const anim = DashUI.SubMenu.Animation;
    if (!anim.Running) { return true; }

    anim.Progress += 0.07f;
    if (anim.Progress < 1.0f) {
		const u = pad.pressed(Pads.UP) || (pad.ly < -64);
		const d = pad.pressed(Pads.DOWN) || (pad.ly > 64);
        if ((anim.Progress > 0.6f) && (u || d)) {
			const delta = u ? -1 : 1;
			UIAnimationSubMenuItemsMove_Reset(delta)
		}

		return false;
	}

	DashUI.SubMenu.Items.Current = DashUI.SubMenu.Items.Next;
	DashUI.SubMenu.ItemCollection[DashUI.SubMenu.Level].Default = DashUI.SubMenu.Items.Current;
    anim.Progress = 0.0f;
    anim.Running = false;

	return true;
}
function UIAnimationSubMenuItemsMove_Reset(delta) {
    const obj = DashUI.SubMenu;
    const objitems = obj.Items;
    const next = objitems.Next + delta;
    const run = next >= 0 && next < obj.ItemCollection[obj.Level].Items.length;
	if (!run) { return; }

	PlayCursorSfx();
	DashUIResetBg();
    objitems.Current = objitems.Next;
    objitems.Next = next;
    obj.ItemCollection[obj.Level].Default = objitems.Current;
    obj.Animation.Progress = 0.0f;
}
function DrawUISubMenuFadingInitialLevel() {
	if ((DashUI.SubMenu.Level < 2) || (!DashUI.SubMenu.Fade.Running)) return;

    const mainObj = DashUI.SubMenu.ItemCollection[DashUI.SubMenu.Level - 2];
	const items   = mainObj.Items;
    const current = mainObj.Default;
    const fadeProgress = getFadeProgress(DashUI.SubMenu.Fade);

	const halfMod    = UICONST.IcoUnselMod >> 1;
	const icoA       = 110;
	const SelIcoA    = icoA * fadeProgress;
	const SelModX    = UICONST.SubItems.PrevSelX + SelIcoA;
    const noSelModX  = UICONST.SubItems.PrevUnselX + (UICONST.SubItems.PrevUnselX * fadeProgress);
	const noSelModA  = icoA + ~~(-96 - 14 * fadeProgress);

	let Icon = {
		Width:  UICONST.IcoSelSize,
		Height: UICONST.IcoSelSize,
		X: UICONST.SubItems.IconX,
		Y: UICONST.SubItems.IconY
	};

    for (let i = 0; i < items.length; i++) {
		const diff = i - current;
		if (diff <= -6) continue;
		if (diff >= 6) break;

		const info = items[i];
		Icon.ID    = info.Icon;
        Icon.Alpha = noSelModA;
        Icon.Width = UICONST.IcoUnselSize;
        Icon.Height = UICONST.IcoUnselSize;
		Icon.X = UICONST.SubItems.IconX;
		Icon.Y = UICONST.SubItems.IconY;

		if ('CustomIcon' in info) { Icon.CustomIcon = info.CustomIcon; }
		else if ('CustomIcon' in Icon) { delete Icon.CustomIcon; }

        if (i === current) {
            Icon.Width  = UICONST.IcoSelSize;
            Icon.Height = UICONST.IcoSelSize;
			Icon.Alpha  = icoA - SelIcoA;
			Icon.X     -= SelModX;
		}
		else {
			const mod     = (diff > 0) ? 24 : -24;
			const yOffset = ((diff > 0) ? -10 : 10);
			const baseY   = mod + diff * UICONST.SubItemSlotSize;

			Icon.X       += halfMod - noSelModX;
			Icon.Y       += halfMod + yOffset + (yOffset * fadeProgress) + baseY;
		}

		if ((Icon.Y < -UICONST.ScreenDrawLimit) || (Icon.Y > UICONST.ScrLowerLimit)) continue;
		DrawDashIcon(Icon);
	}
}
function DrawUISubMenuPreviousLevel() {
    if (DashUI.SubMenu.Level < 1) return;

    const mainObj = DashUI.SubMenu.ItemCollection[DashUI.SubMenu.Level - 1];
	const items   = mainObj.Items;
    const current = mainObj.Default;
	const fade    = DashUI.SubMenu.Fade;
	const fadeProgress = getFadeProgress(fade);

	const aFade 		= DashUI.SubMenu.PrevAnimation.Fade;
	const aFadeProgress	= (aFade.Running) ? getFadeProgress(aFade) : 1;

	const icoA      = 110 * aFadeProgress;
	const halfMod   = UICONST.IcoUnselMod >> 1;
	const baseA     = ~~(128 - 128 * fadeProgress);
	const SelModX   = UICONST.SubItems.PrevSelX * fadeProgress;
    const noSelModX = UICONST.SubItems.PrevUnselX * fadeProgress;
    const noSelModA = icoA + ((aFade.Running) ? ~~(-96 * aFadeProgress) : ~~(-96 * fadeProgress));
	const ArrowA    = ~~(84 - 84 * fadeProgress);

	DashElements.Arrow.width  = 20;
	DashElements.Arrow.height = 20;
    DashElements.Arrow.color  = Color.setA(DashElements.Arrow.color, ArrowA);
	DashElements.Arrow.draw(UICONST.SubItems.ArrowX - (80 * fadeProgress), UICONST.SubItems.ArrowY);

    let Icon = {}, Name = {}, Desc = false, Ctxt = {};

	// Context Modifiers
	const contextMod = DashUI.Context.Display;
	const contextfade = DashUI.Context.Fade;
    const contextfadeProgress = getFadeProgress(contextfade);

	const contextX = halfMod * contextfadeProgress;

    for (let i = 0; i < items.length; i++) {
		const diff = i - current;
		if (diff <= -6) continue;
		if (diff >= 6) break;

		Desc = false;
		const info = items[i];
		Icon.ID     = info.Icon;
		Icon.Alpha  = noSelModA;
		Icon.Width  = UICONST.IcoUnselSize;
        Icon.Height = UICONST.IcoUnselSize;
		Icon.X      = UICONST.SubItems.IconX;
		Icon.Y      = UICONST.SubItems.IconY;

		if ('CustomIcon' in info) { Icon.CustomIcon = info.CustomIcon; }
		else if ('CustomIcon' in Icon) { delete Icon.CustomIcon; }

        if ('Color' in Name) { delete Name.Color; }
		Name.Text     = [ getLocalText(info.Name) ];
		Name.Position = { X: UICONST.SubItems.TextX, Y: UICONST.SubItems.TextY };
		Name.Scale    = FontObj.SizeL;
		Name.Alpha    = baseA;
		Name.Glow     = false;

        const CtxtName = (info.Type === "CONTEXT") ? info.Value.Items[info.Value.Default].Name : false;

		if (i === current) {
		    Icon.Alpha      = icoA;
		    Icon.Width      = UICONST.IcoSelSize;
		    Icon.Height     = UICONST.IcoSelSize;
			Icon.X 			-= SelModX;
			Name.Position.X -= SelModX;
			Name.Color   	 = UICONST.TextSelectedColor;
			Name.Alpha 	     = baseA;

			Desc = {
                Text: [ getLocalText(info.Description) ],
				Scale: FontObj.SizeM,
				Position: {
					X: Name.Position.X,
					Y: Name.Position.Y + 20
                },
                Alpha: baseA
			};

			if (contextMod)	{ Icon.X -= contextX; }
		}
		else {
			const mod     = (diff > 0) ? 24 : -24;
			const yOffset = ((diff > 0) ? -10 : 10) * fadeProgress;
			const baseY   = mod + diff * UICONST.SubItemSlotSize;

			Icon.X       += halfMod - noSelModX;
			Icon.Y       += yOffset + baseY + halfMod;
            Name.Position.Y += yOffset + baseY;
			Name.Position.X -= noSelModX;

			if (contextMod)	{
				Icon.X -= contextX;
				Icon.Y -= ((diff > 0) ? contextX : -contextX);
				Icon.Alpha -= contextX;
			}
		}

		if ((Icon.Y < -UICONST.ScreenDrawLimit) || (Icon.Y > UICONST.ScrLowerLimit)) continue;
		if (Desc) TxtPrint(Desc);
		if (CtxtName) {
            const modX = (i === current) ? SelModX : noSelModX;
            let ctext = getLocalText(CtxtName);
            (ctext.length > 8) && (ctext = ctext.substr(0, 8) + "...");
			Ctxt.Text	    = [ ctext ];
            Ctxt.Position   = { X: UICONST.ContextPreviewOptionX - modX , Y: Name.Position.Y };
            Ctxt.Alpha      = Name.Alpha;
            TxtPrint(Ctxt);
		}

		// Draw Focus
		if ((DashElements.ItemFocus) && Desc) {
			let focus = DashElements.ItemFocus;
			focus.width = 82;
			focus.height = 82;
            focus.color = Color.setA(focus.color, Desc.Alpha);
            focus.draw(Icon.X - 5, Icon.Y - 6);
		}

		TxtPrint(Name);
		DrawDashIcon(Icon);
	}
}
function DrawUISubMenu() {
	if ((!DashUI.SubMenu.Display) || (!DashUI.SubMenu.Animation.Display)) { return; }

	DrawUISubMenuFadingInitialLevel();
	DrawUISubMenuPreviousLevel();

	const Name 		= {};
    const Icon      = {};
    const Ctxt      = {};

    const level     = DashUI.SubMenu.Level;
	const items 	= DashUI.SubMenu.ItemCollection[level].Items;
    const current   = DashUI.SubMenu.Items.Current;
    const next      = DashUI.SubMenu.Items.Next;
    const dir       = next - current;

	const anim 		 = DashUI.SubMenu.Animation;
    const easing     = anim.Running ? cubicEaseOut(anim.Progress) : 0;
    const animYMod   = (UICONST.SubItemSlotSize * -dir) * easing;

	const fade			= DashUI.SubMenu.Fade;
	const fadeProgress	= getFadeProgress(fade);
	const aFade 		= DashUI.SubMenu.Animation.Fade;
	let aFadeProgress 	= getFadeProgress(aFade);

	if (!aFade.Running) { aFadeProgress = fadeProgress; }

    const halfMod    	= UICONST.IcoUnselMod >> 1;
	const baseA 	 	= ~~(128 * aFadeProgress);
	const icoA		 	= ~~(110 * aFadeProgress);
	const xFadeMod 	 	= ((level > 0) ? 4 : 14) * (1 - fadeProgress);
    const yFadeMod      = halfMod * (1 - fadeProgress);
    const modCurrY      = (dir < 0 ? 89 : -65) * easing;
    const modCurrNameY  = (12 * easing);
    const modCurrSize   = UICONST.IcoSelSize - UICONST.IcoUnselMod * easing;
    const modNextY      = (dir < 0 ? 65 : -87) * (1 - easing);
    const modNextNameY  = (12 * (1 - easing));
    const modNextSize   = UICONST.IcoSelSize - UICONST.IcoUnselMod * (1 - easing);

	// Context Modifiers
	const contextMod          = DashUI.Context.Display;
	const contextfade         = DashUI.Context.Fade;
    const contextfadeProgress = getFadeProgress(contextfade);
    const contextNameX        = UICONST.ContextPreviewOptionX - xFadeMod;
    const contextPosMod       = halfMod * contextfadeProgress;
    const contextAmod         = ~~(90 * contextfadeProgress);
    const contextNAmod        = ~~(128 * contextfadeProgress);
    const contextSizeMod      = UICONST.IcoUnselMod * contextfadeProgress;

	const ArrowA = ~~(84 * aFadeProgress);
    const ArrowX = (contextMod) ? ~~(-contextPosMod) : 0;

	DashElements.Arrow.width = 20;
	DashElements.Arrow.height = 20;
    DashElements.Arrow.color = Color.setA(DashElements.Arrow.color, ArrowA);
	DashElements.Arrow.draw(UICONST.SubItems.ArrowX + ArrowX, UICONST.SubItems.ArrowY);

	// Display Empty Message
	if (items.length < 1) {
		Name.Text 		= [ getLocalText(XMBLANG.MSG_SUBMENU_EMPTY) ];
		Name.Position 	= { X: UICONST.SubItems.TextX - xFadeMod, Y:UICONST.SubItems.TextY + 5 };
		Name.Scale 		= FontObj.SizeM;
        Name.Alpha 		= baseA;

        TxtPrint(Name);
        return;
    }

	for (let i = 0; i < items.length; i++) {
		const diff = i - current;
		if (diff <= -6) continue;
		if (diff >= 6) break;

		let Desc = false;
        const info = items[i];

        if ('CustomIcon' in info)           { Icon.CustomIcon = info.CustomIcon; }
        else if ('CustomIcon' in Icon)      { delete Icon.CustomIcon; }
        if ('Color' in Name)                { delete Name.Color; }
        if (typeof info.Icon === "string")  { info.Icon = FindDashIcon(info.Icon); }

		Icon.ID 		= info.Icon;
		Icon.Alpha 		= icoA;
		Icon.Width 		= UICONST.IcoUnselSize;
		Icon.Height 	= UICONST.IcoUnselSize;
		Icon.X 			= UICONST.SubItems.IconX - xFadeMod;
		Icon.Y 			= UICONST.SubItems.IconY;
        Name.Text 		= [ getLocalText(info.Name) ];
		Name.Position 	= { X: UICONST.SubItems.TextX - xFadeMod, Y:UICONST.SubItems.TextY };
		Name.Scale 		= FontObj.SizeL;
		Name.Alpha 	    = baseA;
		Name.Glow   	= false;

        let CtxtName = (info.Type === "CONTEXT") ? getLocalText(info.Value.Items[info.Value.Default].Name) : false;

        if (i === current) {
            Icon.Width  	= modCurrSize;
            Icon.Height 	= modCurrSize;
            Icon.X     		+= halfMod * easing;
            Icon.Y      	+= modCurrY;
            Name.Position.Y += modCurrY - modCurrNameY;
			Name.Color 		 = (anim.Running) ? interpolateColorObj(UICONST.TextSelectedColor, UICONST.TextUnselectedColor, anim.Progress) : UICONST.TextSelectedColor;
			Name.Glow   	 = (baseA === 128) && (!anim.Running) && (!contextMod);

			if (Name.Glow) { if (('CustomBG' in info) && (!('Image' in DashUI.ItemBG))) { DashUI.ItemBG.Image = info.CustomBG; } }

			if (contextMod) {
				Icon.X      	-= contextPosMod;
				Icon.Y      	-= contextPosMod;
				Icon.Width  	+= contextSizeMod;
				Icon.Height 	+= contextSizeMod;
				Name.Alpha 	    -= contextAmod;
                Name.Position.X += contextPosMod;
            }

            Desc = {
                Text: [ getLocalText(info.Description) ],
                Scale: FontObj.SizeM,
                Position: { X: Name.Position.X, Y: Name.Position.Y + 20 },
                Alpha: (contextMod) ? Name.Alpha : ~~(baseA - (128 * easing))
            };
		}
        else if (i === next) {
            Icon.Width      = modNextSize;
            Icon.Height     = modNextSize;
            Icon.X          += halfMod * (1 - easing);
            Icon.Y          -= modNextY;
            Name.Position.Y -= modNextY + modNextNameY;
            Name.Color      = interpolateColorObj(UICONST.TextUnselectedColor, UICONST.TextSelectedColor, anim.Progress);
            Desc = {
                Text: [ getLocalText(info.Description) ],
                Scale: FontObj.SizeM,
                Position: { X: Name.Position.X, Y: Name.Position.Y + 20 },
                Alpha: ~~(128 * easing)
            };
        }
        else {
            const iDir  = (diff > 0) ? 1 : -1;
            const YMOD  = halfMod + (diff * UICONST.SubItemSlotSize) + (25 * iDir) + animYMod - (yFadeMod * iDir);
            Icon.X      += halfMod;
            Icon.Y      += YMOD;
            Name.Position.Y += (YMOD - 12);

            if (contextMod) {
                const yOffset   = iDir * contextPosMod;
                Icon.Y          += yOffset;
                Name.Position.Y += yOffset;
                Name.Alpha      -= contextNAmod;
                Icon.Alpha      -= contextAmod;
            }
		}

        if (Icon.Y < -UICONST.ScreenDrawLimit) continue;
        if (Icon.Y > UICONST.ScrLowerLimit) break;

		// Draw Focus
		if ((DashElements.ItemFocus) && (i === current || i === next) && Desc) {
			let FocusA = contextMod ? ~~(128 * (1 - contextfadeProgress)) : Desc.Alpha;
            FocusA = (DashUI.Dialog.Fade.Running && !DashUI.Dialog.Fade.In) ? ~~(128 * fadeProgress) : (DashUI.Dialog.Fade.Running ? 0 : FocusA);
            if (FocusA > 0) {
                let focus = DashElements.ItemFocus;

                let isCurrent = (i === current);
                let isNext = (i === next);
                focus.width = 82;
                focus.height = 82;

                if (anim.Running) {
                    const mod = isNext ? UICONST.IcoUnselMod * (1 - easing) : UICONST.IcoUnselMod * easing;
                    focus.width -= mod;
                    focus.height -= mod;
                }
                else if (contextMod) {
                    focus.width += contextSizeMod;
                    focus.height += contextSizeMod;
                }

                focus.color = Color.setA(focus.color, FocusA);
                focus.draw(Icon.X - 5, Icon.Y - 6);
            }
		}

        TxtPrint(Name);
        DrawDashIcon(Icon);
		if (Desc) { TxtPrint(Desc); }

        // Context Option Selected
        if (CtxtName) {
            CtxtName.length > 8 && (CtxtName = CtxtName.substr(0, 8) + "...");
            Ctxt.Text = CtxtName;
            Ctxt.Alpha = Name.Alpha;
            Ctxt.Position = { X: contextNameX, Y: Name.Position.Y - 5 };
            if (contextMod) Ctxt.Alpha += ~~(-128 * contextfadeProgress);
            TxtPrint(Ctxt);
        }
    }
}

//////////////////////////////////////////////////////////////////////////
///*				   			  Context							  *///
//////////////////////////////////////////////////////////////////////////

function DashUISetNewContextMenu(Context) {
	if (typeof Context.Items === "function") { Context.Items = Context.Items(); }

    PlayCursorSfx();

    const obj = DashUI.Context;
    const items = obj.Items;

    obj.Timer = Timer.new();
    Timer.reset(DashUI.Context.Timer);
    Timer.pause(DashUI.Context.Timer);

    items.Current = Context.Default;
    items.Next = Context.Default;
    obj.Level++;
    obj.ItemCollection[obj.Level] = Context;
	DashUI.State.Next = 3;

    items.UpperLimit = 0;
    items.LowerLimit = 9;

    if (Context.Items.length < 9) { items.LowerLimit = Context.Items.length; }

    if (Context.Default > 8)
    {
        if ((Context.Default + 8) >= Context.Items.length) {
            items.LowerLimit = Context.Items.length;
            items.UpperLimit = items.LowerLimit - 9;
		}
        else {
            items.UpperLimit = Context.Default;
            items.LowerLimit = items.UpperLimit + 9;
		}
    }

	UIAnimateContextMenuItemsFade_Start(true);
}
function UIAnimateContextMenuItemsFade_Start(isIn) {
	const element = DashUI.Context;
	if (isIn === element.Fade.In) { return; }

	element.Fade.In = isIn;
	element.Fade.Progress = 0.0f;
	element.Fade.Running = true;
	element.Display = true;
	DashUI.AnimationQueue.push(UIAnimateContextMenuItemsFade_Work);
}
function UIAnimateContextMenuItemsFade_Work() {
    const obj = DashUI.Context;
    const fade = obj.Fade;
    if (!fade.Running) { return true; }
    fade.Progress += 0.04f;
    if (fade.Progress < 1.0f) { return false; }

    if (!fade.In) {
        obj.Level--;
        obj.Display = (obj.Level > -1);
        if (obj.Display) {
            const next = obj.ItemCollection[obj.Level].Default;
            obj.Items.Current = next;
            obj.Items.Next = next;
        }
        else if (DashUI.State.Next === DashUI.State.Current) {
            Timer.destroy(obj.Timer);
            DashUI.State.Next = DashUI.State.Previous;
        }
    }

    fade.Progress = 1.0f;
    fade.Running = false;
    return true;
}
function UIAnimationContextMenuItemsMove_Start(delta) {
    const obj = DashUI.Context;
    const objitems = obj.Items;
    const next = objitems.Current + delta;
    const run = next >= 0 && next < obj.ItemCollection[obj.Level].Items.length;
	if (!run) { return; }

	PlayCursorSfx();
    if (next >= objitems.LowerLimit) {
        objitems.UpperLimit++;
        objitems.LowerLimit++;
	}
    else if (next < objitems.UpperLimit) {
        objitems.UpperLimit--;
        objitems.LowerLimit--;
	}

    objitems.Next = next;
    obj.Animation.Running = true;
    obj.Animation.Progress = 0.0f;
	DashUI.AnimationQueue.push(UIAnimationContextMenuItemsMove_Work);
}
function UIAnimationContextMenuItemsMove_Work() {
    const anim = DashUI.Context.Animation;
    if (!anim.Running) { return true; }
    anim.Progress += 0.2f;
    if (anim.Progress < 1.0f) { return false; }
    anim.Progress = 0.0f;
    anim.Running = false;
    DashUI.Context.Items.Current = DashUI.Context.Items.Next;
	return true;
}
function DashUIExecuteConfirmFunction(obj) {
    const dashObj = DashUI.Context;
    const current = dashObj.Items.Current;
    const context = dashObj.ItemCollection[dashObj.Level];
    const item = context.Items[current];

    if (typeof obj.Confirm !== "function") {
        if (!("Event" in obj.Confirm)) { return true; }
        switch (obj.Confirm.Event) {
            case "OPEN_DIALOG": DashUISetDialog(eval(obj.Confirm.Dialog));
        }
    }
    else {
        const result = obj.Confirm(current, item);
        if ((result !== undefined) && (result === false)) { return false; }
    }

    return true;
}
function DashUISelectContextItem() {
	const current = DashUI.Context.Items.Current;
	const context = DashUI.Context.ItemCollection[DashUI.Context.Level];
    const item = context.Items[current];

    UIAnimateContextMenuItemsFade_Start(false);

    if      ('Confirm' in item)    { if (!DashUIExecuteConfirmFunction(item))    { return; } }
    else if ('Confirm' in context) { if (!DashUIExecuteConfirmFunction(context)) { return; } }

	context.Default = current;
}
function DashUIBackFromContextMenu() {
	const current = DashUI.Context.Items.Current;
	const context = DashUI.Context.ItemCollection[DashUI.Context.Level];
	const item = context.Items[current];

	if ('Cancel' in context) { context.Cancel(current, item); }

	PlayCancelSfx();
	UIAnimateContextMenuItemsFade_Start(false);
}
function DashUIContextPreviewHandler(item) {
    const obj = DashUI.Context;
    if (DashUI.AnimationQueue.length > 0) {
        obj.pFunExecuted = false;
        Timer.reset(obj.Timer);
        Timer.resume(obj.Timer);
		return;
	}

    let time = getTimerSec(obj.Timer);
    if (('Preview' in obj.ItemCollection[obj.Level]) && (time > 10)) {
        if (!obj.pFunExecuted) {
            Timer.pause(obj.Timer);
            const fun = obj.ItemCollection[obj.Level].Preview;
            fun(obj.Items.Current, item);
            obj.pFunExecuted = true;
        }
    }

	if (('PreviewImage' in item) && (time > 6))	{
		const customImg = ImageCache.Get(item.PreviewImage);
		const Ready = customImg && customImg.ready();
		if (Ready) {
            if (obj.PreviewA === 0)
			{
                let ival = os.setInterval(() => {
                    obj.PreviewA += 8;
                    if (obj.PreviewA > 120) { os.clearInterval(ival); }
                }, 0);
            }

			customImg.width = 240;
			customImg.height = 135;
            customImg.color = Color.setA(customImg.color, obj.PreviewA);
            customImg.draw(UICONST.Context.PreviewImgX, UICONST.Context.PreviewImgY);
            return;
		}
	}

    obj.PreviewA = 0;
}
function DrawUIContext() {
    const obj = DashUI.Context;
    if (!obj.Display) { return; }

    const fade = obj.Fade;
	const fadeProgress = getFadeProgress(fade);

	const boxA = UICONST.Context.BoxA * fadeProgress;
	const boxX = UICONST.Context.BoxX + (25 * fadeProgress);

	const Box = DashElements.Context;
	const Col = (UICONST.Context.Tint) ? UICONST.Context.Tint : BgElements.BgColor.Color;

	Box.height = ScrCanvas.height;
	Box.color = Color.new(Col.R, Col.G, Col.B, boxA);
	Box.draw(ScrCanvas.width - boxX, 0);

    const items = obj.ItemCollection[obj.Level].Items;
    const current = obj.Items.Current;
	const baseX = UICONST.Context.BaseX - (25 * fadeProgress);
	const baseY = UICONST.Context.BaseY;
	const baseA = ~~(128 * fadeProgress);
    const first = obj.Items.UpperLimit;
    const last = obj.Items.LowerLimit;

	const NameTexts = [];
	const Icon = {};
	Icon.Width 		= 14;
	Icon.Height 	= 14;
	Icon.Alpha 		= baseA;
	Icon.X 			= baseX;

    let selico = false;
    let selYmod = 0;
	let slotPos = 0;

	for (let i = first; i < last; i++) {
		const item = items[i];
		let icomodX = false;
		if (('Icon' in item) && (item.Icon !== -1)) {
            selico = (i === current);
            icomodX = true;

			Icon.ID 		= item.Icon;
			Icon.Y 			= 7 + baseY + slotPos;

			if (typeof item.Icon === "string") { Icon.CustomIcon = item.Icon; }

            if (selico && !fade.Running) {
                DashElements.CtxIco.color = Color.setA(DashElements.CtxIco.color, FontObj.Glow.Value + 64);
                DashElements.CtxIco.draw(Icon.X - 6, Icon.Y - 6);
			}

			DrawDashIcon(Icon);
		}

        if (i === current) { selYmod = slotPos;  NameTexts.push(""); }
        else {
            let text = getLocalText(item.Name);
            if (text.length > 24) { text = text.substring(0, 20) + "..."; }
            if (icomodX) { text = `     ${text}`; }
            NameTexts.push(text);
		}

        slotPos += UICONST.StextLine;
    }

    const Names = {
        Text: NameTexts,
        Position: { X: baseX, Y: baseY },
        Alpha: baseA
    };

    TxtPrint(Names);

    let selText = getLocalText(items[current].Name);

    if (selText.length > 24) {
        let currT = 1 + getTimerSec(obj.Timer);
        let start = ((currT + 20) < selText.length) ? currT : (selText.length - 20);
        selText = "..." + selText.substring(start, start + 20);
    }

    const SelName = {
        Text: selico ? [`     ${selText}`] : [selText],
        Position: { X: baseX, Y: baseY + selYmod },
        Alpha: baseA,
        Color: { R: UICONST.TextSelectedColor.R, G: UICONST.TextSelectedColor.G, B: UICONST.TextSelectedColor.B },
        Glow: DashUI.AnimationQueue.length < 1
    };

    TxtPrint(SelName);

    const arrowA = (!fade.Running) ? -FontObj.Glow.Value : 0;

    if (first > 0 || last < items.length) {
        DashElements.Arrow.width = 12;
        DashElements.Arrow.height = 12;
        DashElements.Arrow.color = Color.setA(DashElements.Arrow.color, baseA + arrowA);
        if (first > 0) {
            DashElements.Arrow.angle = -0.5f;
            DashElements.Arrow.draw(baseX, baseY - 6);
        }
        if (last < items.length) {
            DashElements.Arrow.angle = 0.5f;
            DashElements.Arrow.draw(baseX, baseY + slotPos + 6);
        }
        DashElements.Arrow.angle = 0.0f;
    }

	DashUIContextPreviewHandler(items[current]);
}

//////////////////////////////////////////////////////////////////////////
///*				   			  Option							  *///
//////////////////////////////////////////////////////////////////////////

function GetOptionContext() {
    const subObj = DashUI.SubMenu;
	const mainItem = DashUI.ItemCollection.Current[DashUI.Items.Current];
    const item = (subObj.Level > -1) ? subObj.ItemCollection[subObj.Level].Items[subObj.Items.Current] : mainItem;
	if (!item) { return false; }
    if (item && ('Option' in item)) { return item.Option; }
    else if (mainItem) {
        for (let key in mainItem) {
            let obj = mainItem[key];
            if (obj && obj.Type === "OptionContext") {
                if ('Filter' in obj) {
                    switch (obj.Filter) {
                        case "File":   if (!('Type' in item) || item.Type !== "SUBMENU") { return obj; } break;
                        case "SubDeviceOnly":
                            if (('FullPath' in item) && item.FullPath.substring(0, 3) !== "hdd") {
                                return obj;
                            }
                            break;
                        case "Custom":
                            if ('Condition' in obj) {
                                if (eval(obj.Condition)) {
                                    return obj;
                                }
                            }
                            break;
                    }
                }
                else { return obj; }
            }
        }
    }

	return false;
}
function OpenOptionBox() {
	const context = GetOptionContext();
	if (context) { DashUISetNewContextMenu(context); }
}
function DrawUIOptionBox() {
    const box = DashElements.OptionBox;
	if ((DashUI.AnimationQueue.length > 0) || (DashUI.State.Next > 2) || (DashUI.State.Current < 1))
    { box.Progress = 0.0f; return; }

	const context = GetOptionContext();

	if (!context) { return; }

    box.Progress += 0.05f;
    if (box.Progress >= 1.0f) { box.Progress = 1.0f; }

    const alpha = ~~(box.Progress * 128);

	const optxt = {
		Text: [ getLocalText(XMBLANG.OPTIONS) ],
        Position: { X: UICONST.OptionBox.XTXT, Y: UICONST.OptionBox.YTXT },
        Alpha: alpha
	};

    const elementBox = DashElements.OptionBox;
    const elementIco = DashElements.OptionIco;
    elementBox.width = 30 + FontObj.Font.getTextSize(optxt.Text[0]).width;
    elementBox.color = Color.setA(elementBox.color, alpha);
    elementIco.color = Color.setA(elementIco.color, alpha);
    elementBox.draw(UICONST.OptionBox.XBOX, UICONST.OptionBox.YBOX);
    elementIco.draw(UICONST.OptionBox.XICO, UICONST.OptionBox.YICO);

	TxtPrint(optxt);
}

//////////////////////////////////////////////////////////////////////////
///*				   			  Dialog							  *///
//////////////////////////////////////////////////////////////////////////

function DashUISetDialog(Dialog) {
	DashUI.Dialog.Level++;
	DashUI.Dialog.Data.push({ ...Dialog });

	DashUI.State.Next = 4; 	 // Dialog Message State
    DashUI.OverlayState = 2; // Show Dialog Overlay
	DashUI.Overlay.Color = { R: 0, G: 0, B: 0 }
	DashUI.Overlay.Alpha = 0;
	UIAnimationDialogFade_Start(true);
}
function DashUIDialogTransition(ToDialog) {
    UIAnimationDialogContentFade_Start(false);
    DashUI.AnimationQueue.push(() => {
        if (!DashUI.Dialog.ContentFade.Running) { return false; }
        DashUI.Dialog.Data.push({ ...ToDialog });
        DashUI.Dialog.Level++;
        UIAnimationDialogContentFade_Start(true);
        return true;
    });
}
function OpenDialogErrorMsg(Message) {
	const dialog = {
        Icon: -1,
        Title: "",
        BG: false,
        Type: "TEXT",
        Text: Message,
        BACK_BTN: true,
        ENTER_BTN: true,
	};

	DashUISetDialog(dialog);
}
function OpenDialogParentalCheck(Item) {
	const dialog = {
        Icon: -1,
        Title: "",
        BG: true,
        Type: "PARENTAL_CHECK",
        Text: XMBLANG.PASS_CUR_MSG,
        BACK_BTN: true,
        ENTER_BTN: true,
	};

    dialog.Confirm = function() {
		let succeed = true;
		for (let i = 0; i < 4; i++)	{ if (DashUI.Dialog.Data[DashUI.Dialog.Level].TmpCode[i] !== UserConfig.ParentalCode[i]) { succeed = false; break; } }
		if (succeed) { DashUIObjectHandler(Item); }
		UIAnimationDialogFade_Start(false);
    };

	DashUISetDialog(dialog);
}
function UIAnimationDialogFade_Start(isIn) {
	const element = DashUI.Dialog;
	if (isIn === element.Fade.In) { return; }

	element.Fade.In = isIn;
	element.Fade.Progress = 0.0f;
	element.Fade.Running = true;
	element.Display = true;
	DashUI.AnimationQueue.push(UIAnimationDialogFade_Work);
    UIAnimationDialogContentFade_Start(isIn);

    if (DashUI.Dialog.Data[DashUI.Dialog.Level].BG) { return; }

    const level = DashUI.SubMenu.Level;
    if ((level > -1)) {
        UIAnimationCommonFade_Start(DashUI.SubMenu.Animation, UICONST.Fun.SubMenuFade, !isIn);
        if ((level > 0)) {
            UIAnimationCommonFade_Start(DashUI.SubMenu.PrevAnimation, UICONST.Fun.SubMenuPrevFade, !isIn);
        }
	}
}
function UIAnimationDialogFade_Work() {
	const fade = DashUI.Dialog.Fade;
	if (!fade.Running) { return true; }
	const upperlimit = (DashUI.Dialog.Data[DashUI.Dialog.Level].BG) ? 96 : 64;
	fade.Progress += 0.04f;
	DashUI.Overlay.Alpha = (fade.In) ? (DashUI.Overlay.Alpha + 4) : (DashUI.Overlay.Alpha - 4);
	const ovLimit = (fade.In) ? DashUI.Overlay.Alpha >= upperlimit : DashUI.Overlay.Alpha <= 0;

	DashUI.Overlay.Alpha = (ovLimit) ? ((fade.In) ? upperlimit : 0) : DashUI.Overlay.Alpha;

	if ((fade.Progress >= 1.0f) && (ovLimit)) {
		fade.Progress = 1.0f;
		fade.Running = false;
		if (!fade.In) {
			DashUI.Dialog.Level = -1;
			DashUI.Dialog.Data = [];
			DashUI.OverlayState = 0; // Hide Overlay
			DashUI.Dialog.Display = (DashUI.Dialog.Level > -1);
			if ((!DashUI.Dialog.Display) && (DashUI.State.Next === DashUI.State.Current)) {
				DashUI.State.Next = DashUI.State.Previous;
			}
		}
		return true;
	}

	return false;
}
function UIAnimationDialogContentFade_Start(isIn) {
    const element = DashUI.Dialog.ContentFade;
    element.In = isIn;
    element.Progress = 0.0f;
    element.Running = true;
    DashUI.AnimationQueue.push(UICONST.Fun.DialogContentFade);
}
function UIAnimationDialogAnimStart() {
    PlayCursorSfx();
    const element = DashUI.Dialog.Animation;
    element.Progress = 0.0f;
    element.Running = true;
    DashUI.AnimationQueue.push(UICONST.Fun.DialogAnimation);
}
function UIAnimationDialogMove_Start(delta, upperLimit) {
	const data = DashUI.Dialog.Data[DashUI.Dialog.Level];
	const next = data.Selected + delta;
	const run = next >= 0 && next < upperLimit;
    if (!run) { return; }
    data.Selected = next;
    UIAnimationDialogAnimStart();
}
function UIAnimationDialogInfoMove_Start(delta) {
	const data = DashUI.Dialog.Data[DashUI.Dialog.Level];
	if (data.Selected < 0) { return; }
	const item = data.Info[data.Selected];
	if (!item.Selectable) { return; }

	const next = item.Selected + delta;
	const run = next >= 0 && next < item.Value.length;
    if (!run) { return; }
    item.Selected = next;

    UIAnimationDialogAnimStart();
}
function UIAnimationParentalDialogChange_Start(delta) {
	const data = DashUI.Dialog.Data[DashUI.Dialog.Level];
	let next = data.TmpCode[data.Selected] + delta;
    next = (next > 9) ? 0 : ((next < 0) ? 9 : next);
    data.TmpCode[data.Selected] = next;
    UIAnimationDialogAnimStart();
}
function DrawUIDialogParentalScreen(data, baseA) {
	if (!('Selected' in data)) { data.Selected = 0; }
	if (!('TmpCode' in data)) { data.TmpCode = [ 0, 0, 0, 0]; }

	if (DashUI.AnimationQueue.length < 1) { SetPadEvents_Parental(); }

	const Message = {
		Text: getLocalText(data.Text),
		Alignment: "CENTER",
        Position: { X: 0, Y: -40 },
        Alpha: baseA
	};

	TxtPrint(Message);

	for (let i = 0; i < 4; i++) {
		const CodeChar = {
			Text: (i == data.Selected) ? [ data.TmpCode[i].toString() ] : [ "*" ],
			Alignment: "CENTER",
            Position: { X: -48 + (i * 30), Y: 41 },
            Alpha: baseA,
			Glow: ((i === data.Selected) && (baseA === 128)),
		};
		TxtPrint(CodeChar);
	}

	let baseY = (ScrCanvas.height >> 1) + 20;
	let arrowX = (ScrCanvas.width >> 1) - 56 + (data.Selected * 30);
    const arrowElement = DashElements.Arrow;
    arrowElement.angle = -0.5f;
    arrowElement.width = 16;
    arrowElement.height = 16;
    arrowElement.color = Color.setA(arrowElement.color,baseA);
    arrowElement.draw(arrowX, baseY + 5);
    arrowElement.angle = 0.5f;
    arrowElement.draw(arrowX, baseY + 31);
    arrowElement.angle = 0.0f;
}
function DrawUIDialogInfoScreen(data, baseA) {
    if (!('Processed' in data)) {
        data.Info = data.Info.filter(item => item.Value !== "");
        data.Processed = true;
    }

    if (DashUI.AnimationQueue.length < 1) { SetPadEvents_Information(); }

    const items = data.Info;
    const nameTxt = [];
    const valTxt = [];
    let nameY = UICONST.DialogInfo.NameY - (8 * (items.length - 1));

    if (data.ElementIcon === "true") {
        nameY += (5 * (items.length - 1));
    }

    for (let i = 0; i < items.length; i++) {
        nameTxt.push(getLocalText(items[i].Name) + ":");
        if (Array.isArray(items[i].Value)) {
            if (data.Selected === i) { valTxt.push(""); continue; }
            valTxt.push(getLocalText(items[i].Value[items[i].Selected]));
        }
        else {
            valTxt.push(getLocalText(items[i].Value));
        }
    }

    const Name = {
        Text: nameTxt,
        Alignment: "RIGHT",
        Position: { X: UICONST.DialogInfo.NameX, Y: nameY },
        Alpha: baseA,
    };

    const Value = {
        Text: valTxt,
        Alignment: "LEFT",
        Position: { X: UICONST.DialogInfo.DescX, Y: nameY },
        Alpha: baseA
    };

    TxtPrint(Name);
    TxtPrint(Value);

    if (data.Selected > -1) {

        const selYpos = nameY + (data.Selected * UICONST.StextLine);

        const SelValue = {
            Text: [ getLocalText(items[data.Selected].Value[items[data.Selected].Selected]) ],
            Alignment: "LEFT",
            Position: { X: UICONST.DialogInfo.DescX, Y: selYpos },
            Alpha: baseA,
            Glow: DashUI.AnimationQueue.length < 1
        };

        const seltxtSize = FontObj.Font.getTextSize(SelValue.Text).width;

        TxtPrint(SelValue);

        const arrowElement = DashElements.Arrow;

        arrowElement.width = 16;
        arrowElement.height = 16;
        arrowElement.color = Color.setA(arrowElement.color,baseA);

		if (items[data.Selected].Selected > 0) {
            arrowElement.angle = 0.0f;
            arrowElement.draw(UICONST.DialogInfo.DescX - 16, selYpos + 7);
		}
		if (items[data.Selected].Selected < (items[data.Selected].Value.length - 1)) {
            arrowElement.angle = 1.0f;
            arrowElement.draw(UICONST.DialogInfo.DescX + seltxtSize, selYpos + 7);
		}

        arrowElement.angle = 0.0f;
    }
}
function DrawUIConfirmationScreen(data, txtA) {
	if (DashUI.AnimationQueue.length < 1) { SetPadEvents_Confirmation(); }

	const Message = {
		Text: getLocalText(data.Text),
		Alignment: "CENTER",
        Position: { X: 0, Y: -40 },
        Alpha: txtA
    };

    let modY = 0;

    if ('Timer' in data) {
        modY = 100;

        const timerText = {
            Text: `${getLocalText(XMBLANG.REMTIME)}\n${data.Timer} ${getLocalText(XMBLANG.SECONDS)}`,
            Alignment: "HCENTER",
            Position: { X: 0, Y: 40 },
            Alpha: txtA
        };

        TxtPrint(timerText);
    }

	const Yes = {
		Text: getLocalText(XMBLANG.YES),
		Alignment: "CENTER",
        Position: { X: -30, Y: 0 + modY },
        Alpha: txtA
	};

	const No = {
		Text: getLocalText(XMBLANG.NO),
		Alignment: "CENTER",
        Position: { X: 30, Y: 0 + modY },
        Alpha: txtA
	};

	if (DashUI.AnimationQueue.length < 1) {
		if (!('Selected' in data)) { data.Selected = 1; }
        else if (data.Selected === 0) {
            Yes.Color = UICONST.TextSelectedColor;
            Yes.Glow = true;
        }
        else {
            No.Color = UICONST.TextSelectedColor;
            No.Glow = true;
        }
	}

	TxtPrint(Message);
	TxtPrint(Yes);
	TxtPrint(No);
}
function DrawUITextDialog(data, a) {
    let line0 = getLocalText(data.Text);
    if (typeof line0 !== "string") {
        line0 = String(line0);
    }

    if (data.NetIsoShowPct === true) {
        const showLive = gNetIsoDl.showLivePct;
        const ln = (showLive && typeof gNetIsoDl.livePctLine === "string") ? gNetIsoDl.livePctLine : "";
        const lineSize = ~~(FontObj.Font.scale * 32);
        const elemY = (data.ElementIcon === "true") ? 20 : 0;

        if (!showLive || ln.length < 1) {
            const plines = PreprocessText(line0);
            const n = plines.length;
            const TXT = {
                Text: line0,
                Alignment: "RIGHT",
                Position: {
                    X: -48,
                    Y: (ScrCanvas.height >> 1) - ~~((n * lineSize) / 2) - 10 + elemY
                },
                Alpha: a
            };
            TxtPrint(TXT);
        } else {
            let pctLine = "";
            let bytesLine = "";
            const parts = ln.split("\n");
            if (gNetIsoDl.total > 0) {
                pctLine = parts[0] || "";
                bytesLine = parts.slice(1).join("\n") || "";
            } else {
                bytesLine = parts.join("\n") || "";
            }
            const g1 = 6;
            const g2 = 6;
            const barH = 12;
            const baseMsg = line0;
            const plinesMsg = PreprocessText(baseMsg);
            let totalH = plinesMsg.length * lineSize + g1 + barH + g2;
            if (pctLine.length) { totalH += lineSize; }
            if (bytesLine.length) { totalH += lineSize; }

            const midY = (ScrCanvas.height >> 1);
            let cursorY = midY - ~~(totalH / 2) + elemY;

            TxtPrint({
                Text: baseMsg,
                Alignment: "RIGHT",
                Position: { X: -48, Y: cursorY - 10 },
                Alpha: a
            });
            cursorY += plinesMsg.length * lineSize + g1;

            const pBar = (gNetIsoDl.total > 0)
                ? Math.min(99, Math.max(0, Math.floor(Number(gNetIsoDl.pct))))
                : 0;
            DrawNetIsoDialogProgressBar(pBar, a, cursorY);
            cursorY += barH + g2;

            if (pctLine.length) {
                const { centerX } = netIsoDialogBarLayout();
                TxtPrint({
                    Text: pctLine,
                    Alignment: "CENTER",
                    Position: {
                        X: centerX - (ScrCanvas.width >> 1),
                        Y: cursorY - (ScrCanvas.height >> 1)
                    },
                    Alpha: a
                });
                cursorY += lineSize;
            }
            if (bytesLine.length) {
                TxtPrint({
                    Text: bytesLine,
                    Alignment: "RIGHT",
                    Position: { X: -48, Y: cursorY - 10 },
                    Alpha: a
                });
            }
        }
    } else {
        const TXT = {
            Text: line0,
            Alignment: "CENTER",
            Position: { X: 0, Y: 0 },
            Alpha: a
        };

        if (data.ElementIcon === "true") {
            TXT.Position.Y += 20;
        }

        if ('Align' in data) { TXT.Alignment = data.Align; }
        if ('X' in data) { TXT.Position.X = data.X; }
        if ('Y' in data) { TXT.Position.Y = data.Y; }

        TxtPrint(TXT);
    }

    if ((DashUI.AnimationQueue.length < 1) && ('Fun' in data)) {
        Tasks.Push(data.Fun);
        delete data.Fun;
	}
}
function DrawUIDialog() {
	if (!DashUI.Dialog.Display) { return; }

	const cfad = DashUI.Dialog.ContentFade;
	const fade = DashUI.Dialog.Fade;
	const data = DashUI.Dialog.Data[DashUI.Dialog.Level];

	const fadeProgress = getFadeProgress(fade);
	const cfadProgress = (cfad.Running) ? getFadeProgress(cfad) : (cfad.In ? 1 : 0);
	const baseA = ~~(128 * fadeProgress);
	const contentAlpha = ~~(128 * cfadProgress);
    const lineCol = Color.setA(UICONST.DialogInfo.LineCol, baseA);
	const lineTopY = UICONST.DialogInfo.LineYTop;
	const lineBottomY = UICONST.DialogInfo.LineYBottom;
	const iconX = UICONST.DialogInfo.IconX;
	let titleX = iconX + 30;
	let titleY = lineTopY - 25;

	Draw.line(0, lineTopY, ScrCanvas.width, lineTopY, lineCol);
    Draw.line(0, lineBottomY, ScrCanvas.width, lineBottomY, lineCol);

    if (('Icon' in data) && (data.Icon !== -1)) {

        let iconId = data.Icon;
        let customIco = undefined;

        if (data.NetIsoShowPct === true && DashUI.SubMenu.Level > -1) {
            const hi = GetHighlightedElement();
            if (hi && 'Icon' in hi && hi.Icon !== undefined && hi.Icon !== -1) {
                if (typeof hi.Icon === "string") { iconId = FindDashIcon(hi.Icon); }
                else { iconId = hi.Icon; }
                if ('CustomIcon' in hi && typeof hi.CustomIcon === "string") { customIco = hi.CustomIcon; }
            }
        }
        if (customIco === undefined && typeof iconId === "string") { iconId = FindDashIcon(iconId); }

        let iw = 24;
        let ih = 24;
        let iconDrawX = iconX;
        let iconDrawY = lineTopY - 25;
        if (data.NetIsoShowPct === true) {
            const midY = (ScrCanvas.height >> 1);
            iw = ih = 92;
            const titleStrRaw = (('Title' in data) && data.Title != "") ? getLocalText(data.Title) : "";
            FontObj.Font.scale = FontObj.SizeS;
            const plines = titleStrRaw.length ? PreprocessText(titleStrRaw) : [ "" ];
            let maxW = iw;
            for (let pi = 0; pi < plines.length; pi++) {
                const tw = FontObj.Font.getTextSize(plines[pi]).width;
                if (tw > maxW) { maxW = tw; }
            }
            const lineSz = ~~(FontObj.Font.scale * 32);
            const titleBlockH = plines.length * lineSz;
            const gap = 10;
            const totalH = iw + gap + titleBlockH;
            iconDrawY = midY - ~~(totalH / 2);
            titleX = iconX;
            titleY = iconDrawY + iw + gap;
            const textCenterX = iconX + (maxW >> 1);
            iconDrawX = textCenterX - (iw >> 1);
        }

        const Icon = {
			ID: 	iconId,
			Alpha:	baseA,
			Width: 	iw,
			Height:	ih,
			X:		iconDrawX,
			Y:		iconDrawY
		};
        if (customIco !== undefined) { Icon.CustomIcon = customIco; }

		DrawDashIcon(Icon);
    }

    if (('Title' in data) && (data.Title != "")) {
        const Title = {
			Text: getLocalText(data.Title),
            Position: { X: titleX, Y: titleY },
            Alpha: baseA
		};
        if (data.NetIsoShowPct === true) { Title.Alignment = "LEFT"; }

		TxtPrint(Title);
    }

	if (("BACK_BTN" in data) && (data.BACK_BTN)) {
        const Back = {
            Text: `${(UserConfig.ConfirmBtn === 0) ? "O" : "X"}  ${getLocalText(XMBLANG.BACK)}`,
			Alignment: "CENTER",
            Position: { X: 65, Y: 178 },
            Alpha: baseA
		};

		TxtPrint(Back);
    }

    if (("ENTER_BTN" in data) && (data.ENTER_BTN)) {
        const Enter = {
            Text: `${(UserConfig.ConfirmBtn === 0) ? "X" : "O"}  ${getLocalText(XMBLANG.ENTER)}`,
			Alignment: "CENTER",
            Position: { X: -70, Y: 178 },
            Alpha: baseA
		};

		TxtPrint(Enter);
    }

    if (contentAlpha < 1) { return; }

	switch (data.Type) {
		case "TEXT":            DrawUITextDialog(data, contentAlpha); break;
		case "CONFIRMATION":    DrawUIConfirmationScreen(data, contentAlpha); break;
		case "INFO":            DrawUIDialogInfoScreen(data, contentAlpha); break;
		case "PARENTAL_SET":
		case "PARENTAL_CHECK":  DrawUIDialogParentalScreen(data, contentAlpha); break;
    }

    if ('ElementIcon' in data) {
        const Icon = {};

        if (data.ElementIcon === "true") {
            const info = GetHighlightedElement();
            if ('CustomIcon' in info) { Icon.CustomIcon = info.CustomIcon; }
            if (typeof info.Icon === "string") { info.Icon = FindDashIcon(info.Icon); }
            Icon.ID = info.Icon;
        }
        else {
            const i = parseInt(data.ElementIcon);
            if (isNaN(i)) { Icon.ID = FindDashIcon(data.ElementIcon); }
            else { Icon.ID = i; }
        }

        Icon.Alpha = contentAlpha;
        Icon.Width = UICONST.IcoSelSize + UICONST.IcoUnselMod;
        Icon.Height = UICONST.IcoSelSize + UICONST.IcoUnselMod;
        Icon.X = UICONST.DialogInfo.DescX - (Icon.Width >> 1);
        Icon.Y = UICONST.Category.IconY;

        DrawDashIcon(Icon);
    }
}

//////////////////////////////////////////////////////////////////////////
///*				   			 Init Work							  *///
//////////////////////////////////////////////////////////////////////////

DashCatInit();
DashUInit();
DashElementsInit();
DashUIConstantsInit();
DashUICustomizationInit();
DashBackgroundLoad();
console.log("INIT LIB: UI COMPLETE");
