/**
 * ═══════════════════════════════════════════════════════════
 *  皮肤商城 · 分组与模板配置
 * ═══════════════════════════════════════════════════════════
 *
 * 设计（两层）：
 *   1) 大类 category —— 顶栏筛选：全部 / 二次元 / 街景 / 纯色 …
 *   2) 合集 group   —— 商城内分块标题：动漫风格、经典人物 …
 *
 * 文件夹约定（推荐）：
 *   renderer/skins/{合集id}/xxx.png
 *   例：skins/donman/mao.png  → 自动归入合集「动漫风格」
 *
 * 根目录散图 skins/xxx.png 会进合集「散图」或 catalog 指定 group。
 */

/** 顶栏大类 */
const SKIN_SHOP_CATEGORIES = [
  { id: "all", name: "全部" },
  { id: "anime", name: "二次元" },
  { id: "scene", name: "街景人物" },
  { id: "theme", name: "纯色主题" },
  { id: "nature", name: "自然风光" },
  { id: "abstract", name: "抽象光影" },
  { id: "custom", name: "我的" },
];

/**
 * 合集（分组）
 * - id       唯一；若与文件夹同名，该文件夹下图片自动归入
 * - name     分块标题
 * - category 默认大类（自动扫描时用）
 * - order    越小越靠前
 * - folder   可选，对应 skins 下子目录名（默认同 id）
 */
const SKIN_SHOP_GROUPS = [
  {
    id: "donman",
    name: "动漫风格",
    category: "anime",
    description: "二次元角色合集",
    order: 10,
    folder: "donman",
  },
  {
    id: "classic",
    name: "经典人物",
    category: "anime",
    description: "古风、学院、洛丽塔等",
    order: 20,
  },
  {
    id: "street",
    name: "街景写真",
    category: "scene",
    description: "实景 / 街拍风",
    order: 30,
  },
  {
    id: "theme",
    name: "纯色主题",
    category: "theme",
    description: "无背景图，仅配色",
    order: 80,
  },
  {
    id: "custom",
    name: "我的",
    category: "custom",
    description: "本地上传",
    order: 90,
  },
  {
    id: "misc",
    name: "其他",
    category: "all",
    description: "未归组散图",
    order: 100,
  },
];

/**
 * 可选精修：指定 name / group / category / 推荐等
 * image 相对 renderer/，如 "skins/donman/mao.png"
 * 未写的磁盘图片仍会自动上架，并按文件夹归组。
 */
const SKIN_SHOP_TEMPLATES = [
  // ── 动漫风格 · donman/ ───────────────────────────
  {
    id: "donman-jingling",
    name: "精灵",
    group: "donman",
    category: "anime",
    tags: ["精灵", "动漫"],
    description: "动漫合集 · 精灵",
    image: "skins/donman/jingling.png",
    featured: true,
  },
  {
    id: "donman-mao",
    name: "猫",
    group: "donman",
    category: "anime",
    tags: ["猫", "动漫"],
    description: "动漫合集 · 猫",
    image: "skins/donman/mao.png",
    featured: true,
  },
  {
    id: "donman-saibo",
    name: "赛博",
    group: "donman",
    category: "anime",
    tags: ["赛博", "动漫"],
    description: "动漫合集 · 赛博",
    image: "skins/donman/saibo.png",
    featured: true,
  },
  {
    id: "donman-xiar",
    name: "夏日",
    group: "donman",
    category: "anime",
    tags: ["夏日", "动漫"],
    description: "动漫合集 · 夏日",
    image: "skins/donman/xiar.png",
    featured: false,
  },
  {
    id: "donman-saleifen",
    name: "萨勒芬",
    group: "donman",
    category: "anime",
    tags: ["萨勒芬", "动漫"],
    description: "动漫合集 · 萨勒芬",
    image: "skins/donman/萨勒芬.png",
    featured: true,
  },

  // ── 经典人物（根目录） ───────────────────────────
  {
    id: "gufeng",
    name: "古风",
    group: "classic",
    category: "anime",
    tags: ["古风", "人物"],
    description: "古风人物背景",
    image: "skins/gufeng.png",
    featured: true,
  },
  {
    id: "luolita",
    name: "洛丽塔",
    group: "classic",
    category: "anime",
    tags: ["洛丽塔", "人物"],
    description: "洛丽塔风格背景",
    image: "skins/luolita.png",
    featured: true,
  },
  {
    id: "xueyuan",
    name: "学院",
    group: "classic",
    category: "anime",
    tags: ["学院", "校服"],
    description: "学院风背景",
    image: "skins/xueyuan.png",
    featured: false,
  },
  {
    id: "chuangbian-shuangmawei",
    name: "窗边双马尾",
    group: "classic",
    category: "anime",
    tags: ["双马尾", "窗边"],
    description: "窗边双马尾",
    image: "skins/窗边双马尾.png",
    featured: true,
  },
  {
    id: "qinglvse-xianling",
    name: "青绿色仙灵",
    group: "classic",
    category: "anime",
    tags: ["仙灵", "青绿"],
    description: "青绿色仙灵",
    image: "skins/青绿色仙灵.png",
    featured: true,
  },

  // ── 街景写真 ─────────────────────────────────────
  {
    id: "preset-1",
    name: "街景少女",
    group: "street",
    category: "scene",
    tags: ["人物", "室内", "日系"],
    description: "MUJI 店内街景",
    image: "skins/new.png",
    featured: true,
    heroGlow: "rgba(255, 170, 190, 0.48)",
    heroGlowSoft: "rgba(255, 210, 225, 0.32)",
    ambientTop: "#322430",
    ambientBottom: "#161018",
  },
  {
    id: "preset-1-alt",
    name: "街景备选",
    group: "street",
    category: "scene",
    tags: ["街景", "人物"],
    description: "街景备选图",
    image: "skins/preset-1.png",
    featured: false,
  },
];
