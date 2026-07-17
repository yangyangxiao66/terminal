/**
 * 终端矩阵皮肤定义。
 * - 内置配色皮肤可直接用
 * - 带 backgroundImage 的皮肤：把图片放到 renderer/skins/ 后填写相对路径
 * - custom：用户本地选图，持久化在 localStorage
 */
const SKIN_STORAGE_KEY = "terminal-deck-skin-id";
const CUSTOM_IMAGE_STORAGE_KEY = "terminal-deck-skin-custom-image";
/** 图片皮肤玻璃通透度 0–100：越小越透、背景越清晰；越大越不透明、更易读 */
const GLASS_STORAGE_KEY = "terminal-deck-glass-level";
const DEFAULT_GLASS_LEVEL = 22;

const ANSI = {
  black: "#181b1e",
  red: "#df6b6b",
  green: "#73c991",
  yellow: "#d7ba7d",
  blue: "#75a7d8",
  magenta: "#c48ad6",
  cyan: "#66c2c2",
  white: "#d4d4d4",
  brightBlack: "#6d7780",
  brightRed: "#f07b7b",
  brightGreen: "#8bd6a4",
  brightYellow: "#e4c98c",
  brightBlue: "#8bb9e4",
  brightMagenta: "#d29ae0",
  brightCyan: "#7bd1d1",
  brightWhite: "#ffffff",
};

/** @type {Record<string, SkinDef>} */
const SKINS = {
  matrix: {
    id: "matrix",
    name: "矩阵绿",
    description: "默认暗绿终端风",
    ui: {
      colorScheme: "dark",
      bgApp: "#111417",
      bgToolbar: "#1a1f24",
      bgGrid: "#0d1012",
      bgPane: "#101316",
      bgPaneHeader: "#20262b",
      bgControl: "#242a30",
      bgMenu: "#252b31",
      bgEmpty: "#111417",
      text: "#e8edf1",
      textMuted: "#aab4bd",
      textSoft: "#89959e",
      textPath: "#dce4ea",
      border: "#343b42",
      borderStrong: "#3b444c",
      borderPane: "#30373e",
      accent: "#3a9c78",
      accentHover: "#31906e",
      accentStrong: "#287f61",
      accentBorder: "#399776",
      accentSoft: "#64c49f",
      accentBright: "#73d5ad",
      accentGlow: "rgba(58, 156, 120, 0.4)",
      accentActiveBg: "#1d3d32",
      accentDrop: "rgba(24, 67, 53, 0.88)",
      statusLive: "#51b88f",
      statusExit: "#d39446",
      danger: "#a94848",
      dangerBorder: "#ba5a5a",
      menuHover: "#354048",
      menuBorder: "#46515a",
      menuSep: "#3c454d",
      emptyText: "#9ca7af",
      resizeGrip: "#5a8f78",
      paneOpacity: "0.96",
      toolbarOpacity: "0.92",
      overlay: "rgba(13, 16, 18, 0.55)",
      backgroundImage: "",
      backgroundGradient: "none",
    },
    xterm: {
      background: "#101316",
      foreground: "#e1e7eb",
      cursor: "#73d5ad",
      cursorAccent: "#101316",
      selectionBackground: "#345d70",
      ...ANSI,
    },
  },

  midnight: {
    id: "midnight",
    name: "午夜蓝",
    description: "深蓝冷静风",
    ui: {
      colorScheme: "dark",
      bgApp: "#0b1020",
      bgToolbar: "#121a2e",
      bgGrid: "#080d18",
      bgPane: "#0e1526",
      bgPaneHeader: "#172238",
      bgControl: "#1a2740",
      bgMenu: "#1c283f",
      bgEmpty: "#0b1020",
      text: "#e6edf8",
      textMuted: "#9aadc8",
      textSoft: "#7d92b0",
      textPath: "#d5e0f2",
      border: "#2a3b5c",
      borderStrong: "#33486e",
      borderPane: "#2a3a58",
      accent: "#4f8cff",
      accentHover: "#3f7af0",
      accentStrong: "#2f6ae0",
      accentBorder: "#5a94ff",
      accentSoft: "#7eb0ff",
      accentBright: "#8ec0ff",
      accentGlow: "rgba(79, 140, 255, 0.4)",
      accentActiveBg: "#1a2f55",
      accentDrop: "rgba(20, 40, 80, 0.88)",
      statusLive: "#5b9dff",
      statusExit: "#d39a4a",
      danger: "#b04a5a",
      dangerBorder: "#c45a6a",
      menuHover: "#243552",
      menuBorder: "#3a4f72",
      menuSep: "#314562",
      emptyText: "#8fa3c0",
      resizeGrip: "#5a7fb8",
      paneOpacity: "0.95",
      toolbarOpacity: "0.92",
      overlay: "rgba(8, 13, 24, 0.55)",
      backgroundImage: "",
      backgroundGradient: "radial-gradient(1200px 600px at 10% -10%, #1a2a55 0%, transparent 55%), radial-gradient(900px 500px at 100% 0%, #122040 0%, transparent 50%)",
    },
    xterm: {
      background: "#0e1526",
      foreground: "#dce6f5",
      cursor: "#8ec0ff",
      cursorAccent: "#0e1526",
      selectionBackground: "#2a4a7a",
      ...ANSI,
      blue: "#7eb0ff",
      brightBlue: "#9ec4ff",
      cyan: "#6ec8e0",
    },
  },

  cyber: {
    id: "cyber",
    name: "赛博紫",
    description: "霓虹紫粉赛博感",
    ui: {
      colorScheme: "dark",
      bgApp: "#140f1c",
      bgToolbar: "#1d1528",
      bgGrid: "#0f0b15",
      bgPane: "#15101f",
      bgPaneHeader: "#241a33",
      bgControl: "#2a2038",
      bgMenu: "#2a2038",
      bgEmpty: "#140f1c",
      text: "#f0e8f8",
      textMuted: "#b5a4c8",
      textSoft: "#9684ad",
      textPath: "#e4d8f0",
      border: "#3d2f52",
      borderStrong: "#4a3a62",
      borderPane: "#3a2d4d",
      accent: "#b44dff",
      accentHover: "#a03ef0",
      accentStrong: "#8c2ee0",
      accentBorder: "#c06aff",
      accentSoft: "#d08cff",
      accentBright: "#e0a8ff",
      accentGlow: "rgba(180, 77, 255, 0.4)",
      accentActiveBg: "#3a1f55",
      accentDrop: "rgba(55, 25, 80, 0.88)",
      statusLive: "#c06aff",
      statusExit: "#e0a050",
      danger: "#c05070",
      dangerBorder: "#d06080",
      menuHover: "#3a2d50",
      menuBorder: "#4d3a68",
      menuSep: "#3f3155",
      emptyText: "#a894bc",
      resizeGrip: "#9a6acc",
      paneOpacity: "0.94",
      toolbarOpacity: "0.9",
      overlay: "rgba(15, 11, 21, 0.5)",
      backgroundImage: "",
      backgroundGradient: "radial-gradient(1000px 500px at 0% 0%, #3a1a55 0%, transparent 50%), radial-gradient(800px 400px at 100% 100%, #1a3055 0%, transparent 45%)",
    },
    xterm: {
      background: "#15101f",
      foreground: "#ebe2f5",
      cursor: "#e0a8ff",
      cursorAccent: "#15101f",
      selectionBackground: "#4a2a6a",
      ...ANSI,
      magenta: "#d08cff",
      brightMagenta: "#e8b0ff",
      cyan: "#70d0e8",
    },
  },

  ember: {
    id: "ember",
    name: "余烬橙",
    description: "暖橙暗调",
    ui: {
      colorScheme: "dark",
      bgApp: "#17120f",
      bgToolbar: "#221a15",
      bgGrid: "#120e0b",
      bgPane: "#181310",
      bgPaneHeader: "#2a211b",
      bgControl: "#322820",
      bgMenu: "#2c241e",
      bgEmpty: "#17120f",
      text: "#f3ebe3",
      textMuted: "#b8a99a",
      textSoft: "#9a8a7a",
      textPath: "#e8ddd2",
      border: "#4a3a2e",
      borderStrong: "#5a4a3c",
      borderPane: "#45382c",
      accent: "#e07a3a",
      accentHover: "#d06a2a",
      accentStrong: "#c05a1a",
      accentBorder: "#e88a4a",
      accentSoft: "#f0a070",
      accentBright: "#ffb888",
      accentGlow: "rgba(224, 122, 58, 0.4)",
      accentActiveBg: "#4a2a18",
      accentDrop: "rgba(70, 40, 20, 0.88)",
      statusLive: "#e08a4a",
      statusExit: "#d0a040",
      danger: "#c04840",
      dangerBorder: "#d05850",
      menuHover: "#3a3028",
      menuBorder: "#5a4a3c",
      menuSep: "#45382c",
      emptyText: "#a89888",
      resizeGrip: "#c08050",
      paneOpacity: "0.95",
      toolbarOpacity: "0.92",
      overlay: "rgba(18, 14, 11, 0.55)",
      backgroundImage: "",
      backgroundGradient: "radial-gradient(900px 500px at 80% -20%, #5a3018 0%, transparent 55%)",
    },
    xterm: {
      background: "#181310",
      foreground: "#f0e6dc",
      cursor: "#ffb888",
      cursorAccent: "#181310",
      selectionBackground: "#6a4030",
      ...ANSI,
      yellow: "#e0b060",
      red: "#e07060",
    },
  },

  paper: {
    id: "paper",
    name: "纸白浅色",
    description: "浅色办公风",
    ui: {
      colorScheme: "light",
      bgApp: "#eef1f4",
      bgToolbar: "#f7f9fb",
      bgGrid: "#e4e8ec",
      bgPane: "#ffffff",
      bgPaneHeader: "#f0f3f6",
      bgControl: "#ffffff",
      bgMenu: "#ffffff",
      bgEmpty: "#eef1f4",
      text: "#1c242c",
      textMuted: "#5a6a78",
      textSoft: "#6e7e8c",
      textPath: "#2a3540",
      border: "#c8d0d8",
      borderStrong: "#b0bac4",
      borderPane: "#c5ced6",
      accent: "#1f8a64",
      accentHover: "#187a58",
      accentStrong: "#146b4c",
      accentBorder: "#2a9a72",
      accentSoft: "#1f8a64",
      accentBright: "#2aaa78",
      accentGlow: "rgba(31, 138, 100, 0.28)",
      accentActiveBg: "#d8f0e6",
      accentDrop: "rgba(220, 245, 235, 0.92)",
      statusLive: "#2aaa78",
      statusExit: "#c08030",
      danger: "#c04040",
      dangerBorder: "#d05050",
      menuHover: "#e8eef2",
      menuBorder: "#c0cad4",
      menuSep: "#d0d8e0",
      emptyText: "#6a7a88",
      resizeGrip: "#5aaa88",
      paneOpacity: "0.98",
      toolbarOpacity: "0.96",
      overlay: "rgba(238, 241, 244, 0.45)",
      backgroundImage: "",
      backgroundGradient: "none",
    },
    xterm: {
      background: "#ffffff",
      foreground: "#1c242c",
      cursor: "#1f8a64",
      cursorAccent: "#ffffff",
      selectionBackground: "#b8dcc8",
      black: "#1c242c",
      red: "#c04040",
      green: "#2a8a58",
      yellow: "#a07820",
      blue: "#3060b0",
      magenta: "#8a40a0",
      cyan: "#2080a0",
      white: "#e8ecef",
      brightBlack: "#5a6a78",
      brightRed: "#e05050",
      brightGreen: "#3aaa68",
      brightYellow: "#c09830",
      brightBlue: "#4080d0",
      brightMagenta: "#a050c0",
      brightCyan: "#30a0c0",
      brightWhite: "#111417",
    },
  },

  /**
   * 图片皮肤模板：把预设图放到 renderer/skins/ 后改 backgroundImage。
   * 当前用深色半透明壳 + 自定义图；用户选图后会写入 custom 并切到这套配色。
   */
  wallpaper: {
    id: "wallpaper",
    name: "图片皮肤",
    description: "使用背景图换皮（可自定义）",
    ui: {
      colorScheme: "dark",
      bgApp: "#0d1012",
      bgToolbar: "#1a1f24",
      bgGrid: "transparent",
      bgPane: "#101316",
      bgPaneHeader: "#1c2228",
      bgControl: "#242a30",
      bgMenu: "#252b31",
      bgEmpty: "transparent",
      text: "#e8edf1",
      textMuted: "#aab4bd",
      textSoft: "#89959e",
      textPath: "#dce4ea",
      border: "#343b42",
      borderStrong: "#3b444c",
      borderPane: "rgba(255, 255, 255, 0.18)",
      accent: "#3a9c78",
      accentHover: "#31906e",
      accentStrong: "#287f61",
      accentBorder: "#399776",
      accentSoft: "#64c49f",
      accentBright: "#73d5ad",
      accentGlow: "rgba(58, 156, 120, 0.4)",
      accentActiveBg: "#1d3d32",
      accentDrop: "rgba(24, 67, 53, 0.72)",
      statusLive: "#51b88f",
      statusExit: "#d39446",
      danger: "#a94848",
      dangerBorder: "#ba5a5a",
      menuHover: "#354048",
      menuBorder: "#46515a",
      menuSep: "#3c454d",
      emptyText: "#c8d0d6",
      resizeGrip: "#5a8f78",
      // 默认通透度由 glass level 覆盖；此处作无滑条时的回退
      paneOpacity: "0.18",
      toolbarOpacity: "0.68",
      // 网格几乎不压暗，只保一点对比
      overlay: "rgba(8, 10, 12, 0.08)",
      backgroundImage: "",
      backgroundGradient: "none",
      // xterm 默认很透，避免与面板双重遮罩把背景盖死
      xtermBg: "rgba(12, 14, 16, 0.16)",
      // 突出感光晕 / 氛围（可被预设覆盖）
      heroGlow: "rgba(255, 176, 196, 0.42)",
      heroGlowSoft: "rgba(255, 214, 228, 0.28)",
      ambientTop: "#2a2030",
      ambientBottom: "#141018",
    },
    xterm: {
      background: "rgba(12, 14, 16, 0.16)",
      foreground: "#f0f4f6",
      cursor: "#73d5ad",
      cursorAccent: "#101316",
      selectionBackground: "rgba(52, 93, 112, 0.55)",
      ...ANSI,
    },
  },
};

/**
 * 图片皮肤：
 * 1) catalog.js 的 SKIN_SHOP_TEMPLATES（精修配置）
 * 2) 运行时扫描 renderer/skins/ 下所有图片（自动上架）
 */
const IMAGE_SKIN_PRESETS =
  typeof SKIN_SHOP_TEMPLATES !== "undefined" && Array.isArray(SKIN_SHOP_TEMPLATES)
    ? SKIN_SHOP_TEMPLATES
    : [];

function cloneSkin(baseId, overrides) {
  const base = SKINS[baseId] || SKINS.matrix;
  return {
    ...base,
    ...overrides,
    id: overrides.id,
    name: overrides.name || base.name,
    ui: { ...base.ui, ...(overrides.ui || {}) },
    xterm: { ...base.xterm, ...(overrides.xterm || {}) },
  };
}

function registerImagePreset(preset) {
  if (!preset || !preset.id || !preset.image) return false;
  // 勿覆盖纯色主题 id
  if (SKINS[preset.id] && !(SKINS[preset.id].shop && SKINS[preset.id].shop.type === "image")) {
    if (!SKINS[preset.id].ui || !SKINS[preset.id].ui.backgroundImage) {
      return false;
    }
  }
  const xtermBg = preset.xtermBg || "rgba(12, 14, 16, 0.14)";
  const groupId = preset.group || "misc";
  SKINS[preset.id] = cloneSkin(preset.base || "wallpaper", {
    id: preset.id,
    name: preset.name,
    description: preset.description || "图片皮肤",
    shop: {
      category: preset.category || "scene",
      group: groupId,
      tags: Array.isArray(preset.tags) ? preset.tags : [],
      featured: Boolean(preset.featured),
      type: "image",
      image: preset.image,
    },
    ui: {
      backgroundImage: preset.image,
      paneOpacity: preset.paneOpacity || "0.16",
      toolbarOpacity: preset.toolbarOpacity || "0.66",
      overlay: preset.overlay || "rgba(10, 8, 12, 0.06)",
      xtermBg,
      heroGlow: preset.heroGlow,
      heroGlowSoft: preset.heroGlowSoft,
      ambientTop: preset.ambientTop,
      ambientBottom: preset.ambientBottom,
    },
    xterm: {
      background: xtermBg,
      foreground: "#f0f4f6",
      selectionBackground: "rgba(52, 93, 112, 0.55)",
    },
  });
  return true;
}

for (const preset of IMAGE_SKIN_PRESETS) {
  registerImagePreset(preset);
}

/** 从文件名生成稳定 id */
function skinIdFromFilename(filename) {
  const base = String(filename || "").replace(/\.[^.]+$/, "");
  let slug = base
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w\u4e00-\u9fff\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!slug) {
    let h = 2166136261;
    for (let i = 0; i < filename.length; i += 1) {
      h ^= filename.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    slug = (h >>> 0).toString(36);
  }
  return `img-${slug}`;
}

function guessCategoryFromTitle(title) {
  const t = String(title || "");
  if (/古风|仙灵|洛丽塔|学院|马尾|二次元|anime|lolita|gufeng|xueyuan|精灵|赛博|萨勒芬/i.test(t)) {
    return "anime";
  }
  if (/风景|自然|花|山|海|夜樱|nature/i.test(t)) return "nature";
  if (/霓虹|抽象|光影|neon|cyber/i.test(t)) return "abstract";
  if (/街景|室内|店|城市|scene/i.test(t)) return "scene";
  return "anime";
}

/** @returns {Array<{id:string,name:string,category:string,description:string,order:number,folder:string}>} */
function getShopGroupDefs() {
  if (typeof SKIN_SHOP_GROUPS !== "undefined" && Array.isArray(SKIN_SHOP_GROUPS)) {
    return SKIN_SHOP_GROUPS.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  }
  return [
    { id: "misc", name: "其他", category: "all", description: "", order: 100, folder: "" },
  ];
}

function resolveGroupMeta(groupId) {
  const id = groupId || "misc";
  const defs = getShopGroupDefs();
  const found = defs.find((g) => g.id === id || g.folder === id);
  if (found) return found;
  // 未知文件夹：用文件夹名当合集名，默认二次元
  return {
    id,
    name: id,
    category: "anime",
    description: "",
    order: 50,
    folder: id,
  };
}

/**
 * 把磁盘上的图片登记进商城（catalog 已占用的 image 路径会跳过）。
 * 子目录 → 合集 group；根目录 → misc（除非 catalog 已指定）。
 * @param {Array<{ file: string, image: string, title: string, group?: string, folder?: string }>} files
 */
function registerSkinImagesFromDisk(files) {
  if (!Array.isArray(files) || !files.length) return 0;
  const usedImages = new Set();
  for (const skin of Object.values(SKINS)) {
    const img = skin.ui && skin.ui.backgroundImage;
    if (img) usedImages.add(img.replace(/\\/g, "/"));
  }

  let added = 0;
  for (const file of files) {
    if (!file || !file.image) continue;
    const image = String(file.image).replace(/\\/g, "/");
    if (usedImages.has(image)) continue;

    const title = file.title || file.file || image;
    const folder = file.group || file.folder || "";
    const groupMeta = folder ? resolveGroupMeta(folder) : resolveGroupMeta("misc");
    const idBase = folder ? `${folder}-${title}` : title;
    let id = skinIdFromFilename(idBase);
    if (SKINS[id]) {
      let n = 2;
      while (SKINS[`${id}-${n}`]) n += 1;
      id = `${id}-${n}`;
    }

    const ok = registerImagePreset({
      id,
      name: title,
      group: groupMeta.id,
      category: groupMeta.category && groupMeta.category !== "all" ? groupMeta.category : guessCategoryFromTitle(title),
      tags: folder ? [groupMeta.name, title] : [title],
      description: groupMeta.name ? `${groupMeta.name} · ${title}` : "背景模板",
      image,
      featured: Boolean(folder),
    });
    if (ok) {
      usedImages.add(image);
      added += 1;
    }
  }
  return added;
}

// 纯色主题打上商城元数据
const THEME_SHOP_META = {
  matrix: { category: "theme", group: "theme", tags: ["绿", "默认", "暗色"], featured: true },
  midnight: { category: "theme", group: "theme", tags: ["蓝", "冷静", "暗色"], featured: false },
  cyber: { category: "theme", group: "theme", tags: ["紫", "霓虹", "赛博"], featured: true },
  ember: { category: "theme", group: "theme", tags: ["橙", "暖色", "暗色"], featured: false },
  paper: { category: "theme", group: "theme", tags: ["浅色", "办公", "白"], featured: false },
  wallpaper: {
    category: "custom",
    group: "custom",
    tags: ["自定义", "本地"],
    featured: false,
    type: "custom",
  },
};

for (const [id, meta] of Object.entries(THEME_SHOP_META)) {
  if (!SKINS[id]) continue;
  SKINS[id].shop = {
    category: meta.category,
    group: meta.group || meta.category || "misc",
    tags: meta.tags || [],
    featured: Boolean(meta.featured),
    type: meta.type || "theme",
    image: "",
  };
}

/**
 * 通透度 0–100 → 面板/模糊/xterm 参数。
 * 数值越低：背景图越清晰；越高：终端越易读。
 * @param {number} level
 */
function glassLevelToParams(level) {
  const t = Math.min(100, Math.max(0, Number(level) || 0)) / 100;
  return {
    paneOpacity: (0.04 + t * 0.5).toFixed(3),
    paneOpacityInactive: (0.012 + t * 0.2).toFixed(3),
    xtermAlpha: (0.02 + t * 0.36).toFixed(3),
    xtermAlphaInactive: (0.006 + t * 0.14).toFixed(3),
    blurPx: Math.round(t * 10),
    headerMix: `${Math.round(28 + t * 48)}%`,
    toolbarOpacity: (0.55 + t * 0.35).toFixed(3),
  };
}

function loadGlassLevel() {
  try {
    const raw = localStorage.getItem(GLASS_STORAGE_KEY);
    if (raw == null || raw === "") return DEFAULT_GLASS_LEVEL;
    const v = Number(raw);
    if (!Number.isFinite(v)) return DEFAULT_GLASS_LEVEL;
    return Math.min(100, Math.max(0, Math.round(v)));
  } catch {
    return DEFAULT_GLASS_LEVEL;
  }
}

function saveGlassLevel(level) {
  try {
    localStorage.setItem(GLASS_STORAGE_KEY, String(Math.min(100, Math.max(0, Math.round(level)))));
  } catch {
    // ignore
  }
}

function isImageSkinId(skinId, skin) {
  if (skinId === "wallpaper") return true;
  return Boolean(skin && skin.ui && skin.ui.backgroundImage);
}

function makeRgba(alpha, rgb = "12, 14, 16") {
  return `rgba(${rgb}, ${alpha})`;
}

function getSkinList() {
  return Object.values(SKINS).map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description || "",
  }));
}

function getSkin(id) {
  return SKINS[id] || SKINS.matrix;
}

/** 商城分类列表 */
function getShopCategories() {
  if (typeof SKIN_SHOP_CATEGORIES !== "undefined" && Array.isArray(SKIN_SHOP_CATEGORIES)) {
    return SKIN_SHOP_CATEGORIES.slice();
  }
  return [
    { id: "all", name: "全部" },
    { id: "theme", name: "纯色主题" },
    { id: "anime", name: "二次元" },
    { id: "scene", name: "街景人物" },
    { id: "custom", name: "我的" },
  ];
}

/**
 * 商城货架：纯色主题 + 图片模板 + 自定义（若有本地图）
 * @param {{ hasCustomImage?: boolean }} [options]
 */
function getShopItems(options = {}) {
  const items = [];
  const hasCustom = Boolean(options.hasCustomImage);

  for (const skin of Object.values(SKINS)) {
    if (skin.id === "wallpaper" && !hasCustom) continue;
    const shop = skin.shop || {};
    const isImage = Boolean(skin.ui && skin.ui.backgroundImage);
    const type =
      shop.type ||
      (skin.id === "wallpaper" ? "custom" : isImage ? "image" : "theme");
    const groupId =
      shop.group ||
      (type === "theme" ? "theme" : type === "custom" ? "custom" : "misc");
    const groupMeta = resolveGroupMeta(groupId);

    items.push({
      id: skin.id,
      name: skin.name,
      description: skin.description || "",
      category: shop.category || groupMeta.category || (type === "theme" ? "theme" : "scene"),
      group: groupMeta.id,
      groupName: groupMeta.name,
      groupOrder: groupMeta.order != null ? groupMeta.order : 50,
      groupDescription: groupMeta.description || "",
      tags: shop.tags || [],
      featured: Boolean(shop.featured),
      type,
      image: shop.image || (isImage ? skin.ui.backgroundImage : "") || "",
      accent: (skin.ui && skin.ui.accent) || "#3a9c78",
      accentSoft: (skin.ui && skin.ui.accentSoft) || "#64c49f",
      bgApp: (skin.ui && skin.ui.bgApp) || "#111417",
      bgToolbar: (skin.ui && skin.ui.bgToolbar) || "#1a1f24",
      bgPane: (skin.ui && skin.ui.bgPane) || "#101316",
      gradient: (skin.ui && skin.ui.backgroundGradient) || "none",
      colorScheme: (skin.ui && skin.ui.colorScheme) || "dark",
    });
  }

  items.sort((a, b) => {
    if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    return a.name.localeCompare(b.name, "zh");
  });

  return items;
}

/**
 * 筛选商城条目
 * @param {{ category?: string, group?: string, query?: string, hasCustomImage?: boolean }} filters
 */
function filterShopItems(filters = {}) {
  const category = filters.category || "all";
  const group = filters.group || "all";
  const q = String(filters.query || "")
    .trim()
    .toLowerCase();
  return getShopItems({ hasCustomImage: filters.hasCustomImage }).filter((item) => {
    if (category !== "all" && item.category !== category) return false;
    if (group !== "all" && item.group !== group) return false;
    if (!q) return true;
    const hay = [item.name, item.description, item.id, item.groupName, ...(item.tags || [])]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

/**
 * 按合集分组，供商城分块渲染
 * @returns {Array<{ id: string, name: string, description: string, order: number, items: object[] }>}
 */
function groupShopItems(filters = {}) {
  const items = filterShopItems(filters);
  const map = new Map();
  for (const item of items) {
    const gid = item.group || "misc";
    if (!map.has(gid)) {
      map.set(gid, {
        id: gid,
        name: item.groupName || gid,
        description: item.groupDescription || "",
        order: item.groupOrder != null ? item.groupOrder : 50,
        items: [],
      });
    }
    map.get(gid).items.push(item);
  }
  return [...map.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "zh"));
}

function resolveBackgroundImage(ui, customImageDataUrl) {
  if (customImageDataUrl && (ui.backgroundImage === "__custom__" || !ui.backgroundImage)) {
    return customImageDataUrl;
  }
  if (!ui.backgroundImage || ui.backgroundImage === "__custom__") return "";
  // 相对 renderer 的路径
  if (/^(file:|data:|https?:|blob:)/i.test(ui.backgroundImage)) {
    return ui.backgroundImage;
  }
  return ui.backgroundImage;
}

/**
 * 把皮肤应用到 document + 返回 xterm theme。
 * @param {string} skinId
 * @param {{ customImage?: string, glassLevel?: number, sessionCount?: number }} [options]
 */
function applySkinToDocument(skinId, options = {}) {
  const skin = getSkin(skinId);
  const ui = { ...skin.ui };
  const root = document.documentElement;
  const body = document.body;

  let bgImage = resolveBackgroundImage(ui, options.customImage);
  // wallpaper 皮肤若用户有自定义图，优先用自定义
  if (skinId === "wallpaper" && options.customImage) {
    bgImage = options.customImage;
  }

  const glassLevel =
    options.glassLevel != null ? options.glassLevel : typeof loadGlassLevel === "function" ? loadGlassLevel() : DEFAULT_GLASS_LEVEL;
  const glass = bgImage ? glassLevelToParams(glassLevel) : null;

  // 图片皮肤间距固定：勿随终端数量变化，否则 3→4 全局 reflow 会打乱 TUI
  let gridGap = "4px";
  let gridPad = "4px";
  if (bgImage) {
    gridGap = "14px";
    gridPad = "14px";
  }

  const cssMap = {
    "--color-scheme": ui.colorScheme,
    "--bg-app": ui.bgApp,
    "--bg-toolbar": ui.bgToolbar,
    "--bg-grid": ui.bgGrid,
    "--bg-pane": ui.bgPane,
    "--bg-pane-header": ui.bgPaneHeader,
    "--bg-control": ui.bgControl,
    "--bg-menu": ui.bgMenu,
    "--bg-empty": ui.bgEmpty,
    "--text": ui.text,
    "--text-muted": ui.textMuted,
    "--text-soft": ui.textSoft,
    "--text-path": ui.textPath,
    "--border": ui.border,
    "--border-strong": ui.borderStrong,
    "--border-pane": ui.borderPane,
    "--accent": ui.accent,
    "--accent-hover": ui.accentHover,
    "--accent-strong": ui.accentStrong,
    "--accent-border": ui.accentBorder,
    "--accent-soft": ui.accentSoft,
    "--accent-bright": ui.accentBright,
    "--accent-glow": ui.accentGlow,
    "--accent-active-bg": ui.accentActiveBg,
    "--accent-drop": ui.accentDrop,
    "--status-live": ui.statusLive,
    "--status-exit": ui.statusExit,
    "--danger": ui.danger,
    "--danger-border": ui.dangerBorder,
    "--menu-hover": ui.menuHover,
    "--menu-border": ui.menuBorder,
    "--menu-sep": ui.menuSep,
    "--empty-text": ui.emptyText,
    "--resize-grip": ui.resizeGrip,
    "--pane-opacity": glass ? glass.paneOpacity : ui.paneOpacity,
    "--pane-opacity-inactive": glass ? glass.paneOpacityInactive : ui.paneOpacity,
    "--pane-blur": glass ? `${glass.blurPx}px` : "0px",
    "--pane-header-mix": glass ? glass.headerMix : "92%",
    "--toolbar-opacity": glass ? glass.toolbarOpacity : ui.toolbarOpacity,
    "--skin-overlay": ui.overlay,
    "--skin-bg-gradient": ui.backgroundGradient || "none",
    "--skin-grid-gap": bgImage ? gridGap : "4px",
    "--skin-grid-pad": bgImage ? gridPad : "4px",
    // 突出感：光晕与氛围底色
    "--skin-hero-glow": ui.heroGlow || "rgba(255, 176, 196, 0.42)",
    "--skin-hero-glow-soft": ui.heroGlowSoft || "rgba(255, 214, 228, 0.28)",
    "--skin-ambient-top": ui.ambientTop || ui.bgApp || "#2a2030",
    "--skin-ambient-bottom": ui.ambientBottom || ui.bgApp || "#141018",
  };

  for (const [key, value] of Object.entries(cssMap)) {
    root.style.setProperty(key, value);
  }

  if (bgImage) {
    const url = bgImage.startsWith("url(") ? bgImage : `url("${bgImage.replace(/"/g, '\\"')}")`;
    root.style.setProperty("--skin-bg-image", url);
    body.classList.add("has-skin-image");
  } else {
    root.style.setProperty("--skin-bg-image", "none");
    body.classList.remove("has-skin-image");
  }

  root.style.colorScheme = ui.colorScheme === "light" ? "light" : "dark";
  body.dataset.skin = skin.id;

  // 有背景图时：xterm 用玻璃通透度驱动的 alpha，避免与面板双重遮罩
  const xtermTheme = { ...skin.xterm };
  if (bgImage && glass) {
    xtermTheme.background = makeRgba(glass.xtermAlpha);
    xtermTheme._glass = glass;
    xtermTheme._glassLevel = glassLevel;
  }

  return xtermTheme;
}

function loadSavedSkinId() {
  try {
    return localStorage.getItem(SKIN_STORAGE_KEY) || "matrix";
  } catch {
    return "matrix";
  }
}

function saveSkinId(id) {
  try {
    localStorage.setItem(SKIN_STORAGE_KEY, id);
  } catch {
    // ignore quota / private mode
  }
}

function loadCustomImage() {
  try {
    return localStorage.getItem(CUSTOM_IMAGE_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function saveCustomImage(dataUrl) {
  try {
    if (dataUrl) localStorage.setItem(CUSTOM_IMAGE_STORAGE_KEY, dataUrl);
    else localStorage.removeItem(CUSTOM_IMAGE_STORAGE_KEY);
    return true;
  } catch {
    // 大图可能超 localStorage 配额
    return false;
  }
}
