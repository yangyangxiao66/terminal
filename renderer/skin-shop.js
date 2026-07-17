/**
 * 皮肤商城 UI
 * 依赖 skins.js 的 getShopCategories / filterShopItems / getSkin
 */
(function initSkinShop() {
  const shopRoot = document.getElementById("skinShop");
  if (!shopRoot) return;

  const backdrop = shopRoot.querySelector("[data-shop-close]");
  const closeBtn = document.getElementById("skinShopClose");
  const searchInput = document.getElementById("skinShopSearch");
  const categoryBar = document.getElementById("skinShopCategories");
  const grid = document.getElementById("skinShopGrid");
  const empty = document.getElementById("skinShopEmpty");
  const countEl = document.getElementById("skinShopCount");
  const uploadBtn = document.getElementById("skinShopUpload");

  let activeCategory = "all";
  let searchQuery = "";
  let open = false;

  function getCurrentSkinId() {
    if (typeof window.__getCurrentSkinId === "function") {
      return window.__getCurrentSkinId();
    }
    return document.body.dataset.skin || "matrix";
  }

  function hasCustomImage() {
    if (typeof window.__hasCustomSkinImage === "function") {
      return window.__hasCustomSkinImage();
    }
    return false;
  }

  function applySkinFromShop(id) {
    if (typeof window.__applySkinFromShop === "function") {
      window.__applySkinFromShop(id);
    }
  }

  function uploadFromShop() {
    if (typeof window.__uploadSkinFromShop === "function") {
      window.__uploadSkinFromShop();
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function typeLabel(type) {
    if (type === "image") return "背景";
    if (type === "custom") return "本地";
    return "主题";
  }

  function renderCategories() {
    if (!categoryBar || typeof getShopCategories !== "function") return;
    const cats = getShopCategories();
    categoryBar.innerHTML = cats
      .map(
        (c) => `
      <button type="button" class="shop-chip${c.id === activeCategory ? " is-active" : ""}" data-category="${escapeHtml(c.id)}">
        ${escapeHtml(c.name)}
      </button>`
      )
      .join("");
  }

  /** 把图片路径编成可放进 HTML style 属性的 CSS 值（避免 url("...") 截断 style="..."） */
  function cssUrlValue(src) {
    const raw = String(src || "").trim();
    if (!raw) return "";
    // data: / blob: / 已是绝对 URL 时不二次编码路径
    if (/^(data:|blob:|https?:|file:)/i.test(raw)) {
      return raw.replace(/'/g, "%27");
    }
    // 相对路径：分段 encode，保留 /，支持中文文件名
    const encoded = raw
      .split("/")
      .map((seg) => encodeURIComponent(seg))
      .join("/");
    return encoded;
  }

  function themePreviewStyle(item) {
    if (item.type === "image" && item.image) {
      const u = cssUrlValue(item.image);
      // 单引号包 url，避免破坏 style="..." 双引号属性
      return `background-image:url('${u}');background-size:cover;background-position:center;background-repeat:no-repeat;`;
    }
    if (item.type === "custom" && typeof window.__getCustomSkinPreview === "function") {
      const url = window.__getCustomSkinPreview();
      if (url) {
        const u = cssUrlValue(url);
        return `background-image:url('${u}');background-size:cover;background-position:center;background-repeat:no-repeat;`;
      }
    }
    const g = item.gradient && item.gradient !== "none" ? item.gradient + "," : "";
    return `background-image:${g}linear-gradient(145deg, ${item.bgToolbar} 0%, ${item.bgApp} 48%, ${item.bgPane} 100%);`;
  }

  function renderCard(item, currentId) {
    const active = item.id === currentId;
    const tags = (item.tags || [])
      .slice(0, 3)
      .map((t) => `<span class="shop-tag">${escapeHtml(t)}</span>`)
      .join("");
    const previewStyle = themePreviewStyle(item);
    return `
      <button type="button" class="shop-card${active ? " is-active" : ""}${item.featured ? " is-featured" : ""}" data-skin-id="${escapeHtml(item.id)}" title="${escapeHtml(item.description || item.name)}">
        <div class="shop-card-preview" style="${previewStyle}">
          <div class="shop-card-preview-overlay"></div>
          <span class="shop-card-type">${typeLabel(item.type)}</span>
          ${item.featured ? '<span class="shop-card-badge">推荐</span>' : ""}
          ${active ? '<span class="shop-card-using">使用中</span>' : ""}
          <div class="shop-card-swatches" aria-hidden="true">
            <i style="background:${escapeHtml(item.accent)}"></i>
            <i style="background:${escapeHtml(item.accentSoft)}"></i>
            <i style="background:${escapeHtml(item.bgPane)}"></i>
          </div>
        </div>
        <div class="shop-card-body">
          <div class="shop-card-title-row">
            <strong class="shop-card-name">${escapeHtml(item.name)}</strong>
          </div>
          <p class="shop-card-desc">${escapeHtml(item.description || "点击应用此皮肤")}</p>
          <div class="shop-card-tags">${tags}</div>
        </div>
      </button>`;
  }

  function renderGrid() {
    if (!grid) return;
    const filters = {
      category: activeCategory,
      query: searchQuery,
      hasCustomImage: hasCustomImage(),
    };
    const groups =
      typeof groupShopItems === "function"
        ? groupShopItems(filters)
        : [
            {
              id: "all",
              name: "",
              items:
                typeof filterShopItems === "function" ? filterShopItems(filters) : [],
            },
          ];
    const currentId = getCurrentSkinId();
    const total = groups.reduce((n, g) => n + (g.items ? g.items.length : 0), 0);

    if (countEl) {
      countEl.textContent = `${total} 套`;
    }

    if (!total) {
      grid.innerHTML = "";
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    // 多组合集：分块；仅 1 组时也显示标题（方便识别「动漫风格」）
    grid.innerHTML = groups
      .map((group) => {
        const cards = (group.items || []).map((item) => renderCard(item, currentId)).join("");
        const desc = group.description
          ? `<span class="shop-group-desc">${escapeHtml(group.description)}</span>`
          : "";
        return `
      <section class="shop-group" data-group="${escapeHtml(group.id)}">
        <header class="shop-group-header">
          <div class="shop-group-title-row">
            <h3 class="shop-group-title">${escapeHtml(group.name || "皮肤")}</h3>
            <span class="shop-group-count">${(group.items || []).length} 套</span>
          </div>
          ${desc}
        </header>
        <div class="shop-group-grid">${cards}</div>
      </section>`;
      })
      .join("");
  }

  function refresh() {
    renderCategories();
    renderGrid();
  }

  function openShop() {
    open = true;
    shopRoot.hidden = false;
    document.body.classList.add("shop-open");
    refresh();
    requestAnimationFrame(() => {
      shopRoot.classList.add("is-open");
      if (searchInput) searchInput.focus();
    });
  }

  function closeShop() {
    open = false;
    shopRoot.classList.remove("is-open");
    document.body.classList.remove("shop-open");
    window.setTimeout(() => {
      if (!open) shopRoot.hidden = true;
    }, 180);
  }

  function toggleShop() {
    if (open) closeShop();
    else openShop();
  }

  // 事件
  if (closeBtn) closeBtn.addEventListener("click", closeShop);
  if (backdrop) {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop || e.target.hasAttribute("data-shop-close")) closeShop();
    });
  }

  if (categoryBar) {
    categoryBar.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-category]");
      if (!btn) return;
      activeCategory = btn.getAttribute("data-category") || "all";
      refresh();
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      searchQuery = searchInput.value || "";
      renderGrid();
    });
  }

  if (grid) {
    grid.addEventListener("click", (e) => {
      const card = e.target.closest("[data-skin-id]");
      if (!card) return;
      const id = card.getAttribute("data-skin-id");
      if (!id) return;
      applySkinFromShop(id);
      renderGrid();
    });
  }

  if (uploadBtn) {
    uploadBtn.addEventListener("click", () => {
      uploadFromShop();
    });
  }

  window.addEventListener("keydown", (e) => {
    if (!open) return;
    if (e.code === "Escape") {
      e.preventDefault();
      closeShop();
    }
  });

  // 对外 API
  window.skinShop = {
    open: openShop,
    close: closeShop,
    toggle: toggleShop,
    refresh,
    isOpen: () => open,
  };
})();
