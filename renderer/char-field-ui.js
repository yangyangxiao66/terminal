/**
 * 字符流动背景：设置项 + 挂载到欢迎页 / 终端区
 * 依赖 char-field.js（CharField）和 app.js 的全局（sessions、emptyState、isCurrentImageSkin…）
 */
(function () {
  if (typeof CharField === "undefined") return;

  const STORAGE_KEY = "terminal-deck-char-field";
  const DEFAULTS = { enabled: true, scope: "welcome", intensity: "mid", effect: "drift", heartTint: "pink" };
  const FX = typeof CharFieldEffects !== "undefined" ? CharFieldEffects : null;

  function loadSettings() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return {
        enabled: raw.enabled !== false,
        scope: raw.scope === "all" ? "all" : "welcome",
        intensity: CharField.PRESETS[raw.intensity] ? raw.intensity : DEFAULTS.intensity,
        effect: FX && FX.isEffectId(raw.effect) ? raw.effect : DEFAULTS.effect,
        heartTint: raw.heartTint === "accent" ? "accent" : "pink",
      };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // ignore
    }
  }

  const settings = loadSettings();
  const welcomeCanvas = document.getElementById("charFieldWelcome");
  const terminalCanvas = document.getElementById("charFieldTerminal");
  const toggle = document.getElementById("charFieldToggle");
  const scopeSelect = document.getElementById("charFieldScope");
  const intensityGroup = document.getElementById("charFieldIntensity");
  const effectSelect = document.getElementById("charFieldEffect");
  const heartTintSelect = document.getElementById("charFieldHeartTint");
  const heartRow = document.getElementById("charFieldHeartRow");
  const optionRows = document.querySelectorAll("[data-char-field-option]");

  const welcomeField = welcomeCanvas
    ? CharField.create(welcomeCanvas, {
        mask: "center",
        fps: 20,
        idleFps: 8,
        intensity: settings.intensity,
        effect: settings.effect,
        heartTint: settings.heartTint,
      })
    : null;
  const terminalField = terminalCanvas
    ? CharField.create(terminalCanvas, {
        mask: "none",
        fps: 15,
        idleFps: 6,
        intensity: settings.intensity,
        effect: settings.effect,
        heartTint: settings.heartTint,
      })
    : null;

  let terminalOn = false;
  let imageReplaced = false;

  function imageSkin() {
    try {
      return typeof isCurrentImageSkin === "function" && isCurrentImageSkin();
    } catch {
      return false;
    }
  }

  /** 浅色皮肤：字符用深色（--text）且整体更淡 */
  function lightSkin() {
    if (!welcomeCanvas) return false;
    const lum = CharField.luminance(getComputedStyle(welcomeCanvas).textDecorationColor);
    return lum != null && lum > 0.6;
  }

  function syncUi() {
    if (toggle) {
      toggle.classList.toggle("active", settings.enabled);
      toggle.setAttribute("aria-checked", String(settings.enabled));
    }
    for (const row of optionRows) row.classList.toggle("is-disabled", !settings.enabled);
    if (toggle) toggle.title = "在应用范围内以字符背景替代图片；关闭后恢复原图片";
    if (scopeSelect) {
      scopeSelect.value = settings.scope;
      scopeSelect.disabled = !settings.enabled;
      scopeSelect.title = "选择“欢迎页 + 终端背景”，可在运行中的终端显示字符动效";
    }
    if (effectSelect) {
      effectSelect.value = settings.effect;
      effectSelect.disabled = !settings.enabled;
    }
    if (heartTintSelect) {
      heartTintSelect.value = settings.heartTint;
      heartTintSelect.disabled = !settings.enabled;
    }
    // 爱心颜色只在「爱心扩散 / 自动轮播」时有意义
    if (heartRow) heartRow.hidden = !(settings.effect === "heart" || settings.effect === "auto");
    if (intensityGroup) {
      for (const button of intensityGroup.querySelectorAll("[data-intensity]")) {
        const on = button.dataset.intensity === settings.intensity;
        button.classList.toggle("active", on);
        button.setAttribute("aria-checked", String(on));
        button.disabled = !settings.enabled;
      }
    }
  }

  function sync() {
    const image = imageSkin();
    const count = typeof sessions !== "undefined" ? sessions.size : 0;
    const welcomeVisible =
      typeof emptyState !== "undefined" && emptyState && !emptyState.classList.contains("hidden");
    const welcomeOn = Boolean(welcomeField && settings.enabled && welcomeVisible);
    const nextTerminal = Boolean(
      terminalField && settings.enabled && settings.scope === "all" && count > 0
    );
    const nextImageReplaced = image && (welcomeOn || nextTerminal);
    const themeChanged = nextTerminal !== terminalOn || nextImageReplaced !== imageReplaced;
    terminalOn = nextTerminal;
    imageReplaced = nextImageReplaced;
    document.body.classList.toggle("char-field-terminal", terminalOn);
    document.body.classList.toggle("char-field-replaces-image", imageReplaced);
    document.documentElement.classList.toggle("char-field-replaces-image", imageReplaced);
    const light = lightSkin();

    if (welcomeField) {
      welcomeField.setAlphaScale(light ? 0.6 : 1);
      welcomeField.refreshTheme();
      welcomeField.setActive(welcomeOn);
    }

    if (terminalField) {
      terminalField.setAlphaScale(light ? 0.4 : 0.55);
      terminalField.refreshTheme();
      terminalField.setActive(nextTerminal);
    }
    // 记住原皮肤，只切换当前可见背景；先更新状态，避免皮肤同步回调递归。
    if (themeChanged && typeof applyCurrentSkin === "function") applyCurrentSkin();
    syncUi();
  }

  toggle?.addEventListener("click", () => {
    settings.enabled = !settings.enabled;
    saveSettings();
    sync();
  });

  scopeSelect?.addEventListener("change", () => {
    settings.scope = scopeSelect.value === "all" ? "all" : "welcome";
    saveSettings();
    sync();
  });

  effectSelect?.addEventListener("change", () => {
    settings.effect = FX && FX.isEffectId(effectSelect.value) ? effectSelect.value : "drift";
    welcomeField?.setEffect(settings.effect);
    terminalField?.setEffect(settings.effect);
    saveSettings();
    sync();
  });

  heartTintSelect?.addEventListener("change", () => {
    settings.heartTint = heartTintSelect.value === "accent" ? "accent" : "pink";
    welcomeField?.setHeartTint(settings.heartTint);
    terminalField?.setHeartTint(settings.heartTint);
    saveSettings();
    sync();
  });

  intensityGroup?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-intensity]");
    if (!button || !CharField.PRESETS[button.dataset.intensity]) return;
    settings.intensity = button.dataset.intensity;
    welcomeField?.setIntensity(settings.intensity);
    terminalField?.setIntensity(settings.intensity);
    saveSettings();
    sync();
  });

  window.charFieldSync = sync;
  window.__charFieldState = () => ({
    ...settings,
    terminalOn,
    imageReplaced,
    welcomeEffect: welcomeField ? welcomeField.currentEffect() : "",
    welcomeRunning: Boolean(welcomeField && welcomeField.isRunning()),
    terminalRunning: Boolean(terminalField && terminalField.isRunning()),
  });
  sync();
})();
