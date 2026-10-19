/**
 * 字符流动背景：设置项 + 挂载到欢迎页 / 终端区
 * 依赖 char-field.js（CharField）和 app.js 的全局（sessions、emptyState、isCurrentImageSkin…）
 */
(function () {
  if (typeof CharField === "undefined") return;

  const STORAGE_KEY = "terminal-deck-char-field";
  const DEFAULTS = { enabled: true, scope: "welcome", intensity: "mid" };

  function loadSettings() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return {
        enabled: raw.enabled !== false,
        scope: raw.scope === "all" ? "all" : "welcome",
        intensity: CharField.PRESETS[raw.intensity] ? raw.intensity : DEFAULTS.intensity,
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
  const optionRows = document.querySelectorAll("[data-char-field-option]");

  const welcomeField = welcomeCanvas
    ? CharField.create(welcomeCanvas, { mask: "center", fps: 20, idleFps: 8, intensity: settings.intensity })
    : null;
  const terminalField = terminalCanvas
    ? CharField.create(terminalCanvas, { mask: "none", fps: 15, idleFps: 6, intensity: settings.intensity })
    : null;

  let terminalOn = false;

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
    if (toggle) {
      toggle.title = imageSkin()
        ? "当前是图片皮肤：以背景图为准，不显示字符背景；换回纯色皮肤后生效"
        : "欢迎页（可选终端区）显示缓慢变化的字符网格背景";
    }
    if (scopeSelect) {
      scopeSelect.value = settings.scope;
      scopeSelect.disabled = !settings.enabled;
      scopeSelect.title = imageSkin()
        ? "当前是图片皮肤：以背景图为准，不显示字符背景；换回纯色皮肤后生效"
        : "终端背景模式下，终端会变为半透明以透出字符背景";
    }
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
    const light = lightSkin();
    const image = imageSkin();
    const count = typeof sessions !== "undefined" ? sessions.size : 0;
    const welcomeVisible =
      typeof emptyState !== "undefined" && emptyState && !emptyState.classList.contains("hidden");

    if (welcomeField) {
      welcomeField.setAlphaScale(light ? 0.6 : 1);
      welcomeField.refreshTheme();
      // 图片皮肤本身就是背景图，不再叠加字符背景
      welcomeField.setActive(settings.enabled && welcomeVisible && !image);
    }

    const nextTerminal = Boolean(
      terminalField && settings.enabled && settings.scope === "all" && !image && count > 0
    );
    if (terminalField) {
      terminalField.setAlphaScale(light ? 0.4 : 0.55);
      terminalField.refreshTheme();
      terminalField.setActive(nextTerminal);
    }
    if (nextTerminal !== terminalOn) {
      terminalOn = nextTerminal;
      document.body.classList.toggle("char-field-terminal", terminalOn);
      // 终端背景改为半透明 / 恢复不透明
      if (typeof applyCurrentSkin === "function") applyCurrentSkin();
    }
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
    welcomeRunning: Boolean(welcomeField && welcomeField.isRunning()),
    terminalRunning: Boolean(terminalField && terminalField.isRunning()),
  });
  sync();
})();
