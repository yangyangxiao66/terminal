/**
 * 字符流动背景（char field）
 * 等宽字符网格：字符低频随机变化，由「动效」（char-field-effects.js：漂移光斑 / 随机水波 /
 * 爱心扩散 / 圆圈缩放 / 曲线波动 / 自动轮播）决定哪些字符亮起；少量强调色字符，中心渐隐保证前景可读。
 *
 * 纯逻辑（网格尺寸、随机数、变异调度、亮斑强度、遮罩）可在 Node 中测试；
 * create() 只在浏览器里使用 canvas。
 */
(function (root, factory) {
  const isNode = typeof module === "object" && module.exports;
  const effects = isNode ? require("./char-field-effects.js") : root.CharFieldEffects;
  const api = factory(effects);
  if (isNode) module.exports = api;
  else root.CharField = api;
})(typeof self !== "undefined" ? self : this, function (FX) {
  "use strict";

  const { makeWaves, stepWaves, waveIntensity } = FX;

  const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const LEVELS = 12;

  /** 强度预设：淡 / 中 / 强 */
  const PRESETS = {
    low: { label: "淡", maxAlpha: 0.3, grain: 0.16, waves: 5, density: 0.75, mutationRate: 0.025, accentRate: 0.02 },
    mid: { label: "中", maxAlpha: 0.46, grain: 0.22, waves: 7, density: 1, mutationRate: 0.05, accentRate: 0.035 },
    high: { label: "强", maxAlpha: 0.64, grain: 0.28, waves: 9, density: 1.3, mutationRate: 0.09, accentRate: 0.05 },
  };

  function getPreset(name) {
    return PRESETS[name] || PRESETS.mid;
  }

  function clamp(v, lo = 0, hi = 1) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
  }

  /** 可复现的伪随机（mulberry32） */
  function createRng(seed = 1) {
    let a = seed >>> 0;
    return function rng() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** 根据画布 CSS 尺寸和字符宽高算网格；格子取整像素避免缝隙 */
  function computeGrid(width, height, charWidth, fontSize, lineHeight = 1.36) {
    const cellW = Math.max(4, Math.ceil(charWidth));
    const cellH = Math.max(6, Math.round(fontSize * lineHeight));
    const w = Math.max(0, Math.floor(width));
    const h = Math.max(0, Math.floor(height));
    return {
      cellW,
      cellH,
      cols: w > 0 ? Math.ceil(w / cellW) : 0,
      rows: h > 0 ? Math.ceil(h / cellH) : 0,
    };
  }

  /**
   * 本帧要随机变化的格子数。累积小数部分，低速率下也均匀。
   * 返回 { count, carry }
   */
  function mutationCount(cellCount, ratePerSec, dtMs, carry = 0) {
    if (!(cellCount > 0) || !(ratePerSec > 0) || !(dtMs > 0)) return { count: 0, carry: carry || 0 };
    // 单帧间隔过长（如切回窗口）时封顶，避免一次性全屏乱跳
    const dt = Math.min(dtMs, 250) / 1000;
    const exact = cellCount * ratePerSec * dt + (carry || 0);
    const count = Math.min(cellCount, Math.floor(exact));
    return { count, carry: exact - count };
  }

  /** 中心渐隐：中心 minValue，向外平滑升到 1 */
  function centerMask(nx, ny, options = {}) {
    const rx = options.rx || 0.36;
    const ry = options.ry || 0.34;
    const minValue = options.minValue == null ? 0.1 : options.minValue;
    const d = Math.hypot((nx - 0.5) / rx, (ny - 0.5) / ry);
    return minValue + (1 - minValue) * smoothstep(0.55, 1.2, d);
  }

  /** 0..1 → 0..LEVELS 的整数亮度档；0 档不绘制 */
  function quantizeLevel(alpha, levels = LEVELS) {
    return Math.round(clamp(alpha) * levels);
  }

  /** 单格最终亮度（0..1），grain 为格子固定随机值 0..1 */
  function cellAlpha(waveValue, grain, mask, preset, baseScale = 1) {
    const p = preset || PRESETS.mid;
    // 平方让亮斑边缘更利落，斑块之间留出暗区
    const lit = Math.pow(waveValue, 1.5) * (0.6 + 0.8 * grain);
    // 底噪：大部分格子极暗，少数略亮，形成颗粒感
    const base = grain < 0.35 ? 0 : (0.05 + (grain - 0.35) * p.grain) * baseScale;
    return clamp((lit + base) * mask) * p.maxAlpha;
  }

  /** "#rrggbb" / "#rgb" / "rgb(a)(...)" → "rgba(r, g, b, alpha)"；无法解析返回 null */
  function toRgba(color, alpha) {
    if (typeof color !== "string") return null;
    const s = color.trim();
    let r;
    let g;
    let b;
    let m = /^#([0-9a-f]{3})$/i.exec(s);
    if (m) {
      [r, g, b] = m[1].split("").map((c) => parseInt(c + c, 16));
    } else if ((m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(s))) {
      r = parseInt(m[1].slice(0, 2), 16);
      g = parseInt(m[1].slice(2, 4), 16);
      b = parseInt(m[1].slice(4, 6), 16);
    } else if ((m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(s))) {
      r = Math.round(Number(m[1]));
      g = Math.round(Number(m[2]));
      b = Math.round(Number(m[3]));
    } else {
      return null;
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /** 颜色相对亮度 0..1（用于判断浅色皮肤），无法解析返回 null */
  function luminance(color) {
    const rgba = toRgba(color, 1);
    if (!rgba) return null;
    const [r, g, b] = rgba.match(/[\d.]+/g).slice(0, 3).map(Number);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }

  // ───────────── 浏览器渲染 ─────────────

  /**
   * options:
   *   mask: "center" | "none"
   *   fps: 活动时帧率（默认 24）
   *   idleFps: 窗口失焦时帧率（默认 8）
   *   alphaScale: 整体亮度系数
   *   fontSize: 字号（默认 13）
   *   effect: 动效 id（drift / ripple / heart / circle / curve / auto）
   *   heartTint: 爱心颜色 "pink" | "accent"
   */
  function create(canvas, options = {}) {
    const ctx = canvas.getContext("2d");
    const fontSize = options.fontSize || 13;
    const font = `${fontSize}px "Cascadia Mono", Consolas, "DejaVu Sans Mono", monospace`;
    const rng = createRng((Date.now() ^ (Math.random() * 1e9)) >>> 0);
    const reduceQuery =
      typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;

    let preset = getPreset(options.intensity);
    let alphaScale = options.alphaScale == null ? 1 : options.alphaScale;
    let grid = { cols: 0, rows: 0, cellW: 8, cellH: 18 };
    let cssW = 0;
    let cssH = 0;
    let chars = new Uint8Array(0);
    let grain = new Float32Array(0);
    let accentSeed = new Float32Array(0);
    let maskCache = new Float32Array(0);
    let drawnKey = new Int16Array(0);
    let effectId = FX.isEffectId(options.effect) ? options.effect : "drift";
    let heartTint = options.heartTint === "accent" ? "accent" : "pink";
    let runner = null;
    let frame = { cols: 0, rows: 0, aspect: 1.5, colX: new Float32Array(0), rowY: new Float32Array(0) };
    const sampleOut = FX.newOut();
    let baseColor = "rgb(200, 208, 216)";
    let accentColor = "rgb(117, 167, 216)";
    let warmColor = "rgb(255, 134, 176)";
    let carry = 0;
    let wanted = false;
    let raf = 0;
    let lastFrame = 0;
    let lastStep = 0;

    function rebuildRunner() {
      runner = FX.createRunner(effectId, rng, { density: preset.density || 1, aspect: frame.aspect });
      if (frame.cols) runner.update(0, frame);
      drawnKey.fill(-1);
    }
    let focused = typeof document !== "undefined" && document.hasFocus ? document.hasFocus() : true;

    const styleCache = new Map();
    /** colorIdx：0 字符色 / 1 强调色 / 2 暖色（爱心） */
    function styleFor(colorIdx, level) {
      const key = colorIdx * 100 + level;
      let s = styleCache.get(key);
      if (!s) {
        const color = colorIdx === 2 ? warmColor : colorIdx === 1 ? accentColor : baseColor;
        s = toRgba(color, (level / LEVELS).toFixed(3)) || baseColor;
        styleCache.set(key, s);
      }
      return s;
    }

    function readTheme() {
      const cs = getComputedStyle(canvas);
      baseColor = cs.color || baseColor;
      accentColor = cs.outlineColor || accentColor;
      // 浅色皮肤用深一些的玫红，深色皮肤用柔和粉色；也可改用皮肤强调色
      const lum = luminance(cs.textDecorationColor);
      const light = lum != null && lum > 0.6;
      warmColor = heartTint === "accent" ? accentColor : light ? "rgb(194, 65, 122)" : "rgb(255, 134, 176)";
      styleCache.clear();
      drawnKey.fill(-1);
    }

    function rebuildMask() {
      const { cols, rows } = grid;
      maskCache = new Float32Array(cols * rows);
      for (let r = 0; r < rows; r += 1) {
        const ny = (r + 0.5) / rows;
        for (let c = 0; c < cols; c += 1) {
          const nx = (c + 0.5) / cols;
          maskCache[r * cols + c] = options.mask === "center" ? centerMask(nx, ny) : 1;
        }
      }
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (w === cssW && h === cssH && chars.length) return w > 0 && h > 0;
      cssW = w;
      cssH = h;
      if (!w || !h) return false;
      const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = font;
      const charWidth = ctx.measureText("M").width || fontSize * 0.6;
      grid = computeGrid(w, h, charWidth, fontSize);
      const n = grid.cols * grid.rows;
      // 动效坐标：以画布高度为单位，保证圆 / 爱心不被格子拉扁
      const colX = new Float32Array(grid.cols);
      const rowY = new Float32Array(grid.rows);
      for (let c = 0; c < grid.cols; c += 1) colX[c] = ((c + 0.5) * grid.cellW) / h;
      for (let r = 0; r < grid.rows; r += 1) rowY[r] = ((r + 0.5) * grid.cellH) / h;
      frame = { cols: grid.cols, rows: grid.rows, aspect: w / h, colX, rowY };
      chars = new Uint8Array(n);
      grain = new Float32Array(n);
      accentSeed = new Float32Array(n);
      drawnKey = new Int16Array(n).fill(-1);
      for (let i = 0; i < n; i += 1) {
        chars[i] = Math.floor(rng() * CHARSET.length);
        grain[i] = rng();
        accentSeed[i] = rng();
      }
      rebuildMask();
      readTheme();
      ctx.clearRect(0, 0, w, h);
      if (!runner) rebuildRunner();
      else runner.update(0, frame);
      return true;
    }

    function mutate(dtMs) {
      const n = chars.length;
      const res = mutationCount(n, preset.mutationRate, dtMs, carry);
      carry = res.carry;
      for (let k = 0; k < res.count; k += 1) {
        const i = Math.floor(rng() * n);
        chars[i] = Math.floor(rng() * CHARSET.length);
      }
    }

    /** 只重画亮度档 / 字符 / 颜色有变化的格子 */
    function draw() {
      const { cols, rows, cellW, cellH } = grid;
      if (!cols || !rows) return;
      const buckets = new Map();
      const clears = [];
      if (!runner) return;
      const p = { ...preset, maxAlpha: Math.min(0.85, preset.maxAlpha * alphaScale * runner.peak()) };
      const { colX, rowY } = frame;
      const out = sampleOut;
      const nChars = CHARSET.length;
      const baseScale = runner.baseScale();
      for (let r = 0; r < rows; r += 1) {
        const y = rowY[r];
        for (let c = 0; c < cols; c += 1) {
          const i = r * cols + c;
          runner.sample(colX[c], y, c, r, out);
          // 波前经过时字符加速变化（水波 / 爱心）
          if (out.boost > 0.35 && rng() < out.boost * 0.22) chars[i] = Math.floor(rng() * nChars);
          const level = quantizeLevel(cellAlpha(out.value, grain[i], maskCache[i], p, baseScale));
          let colorIdx = 0;
          if (level > 0) {
            if (out.warm > 0.5 && accentSeed[i] < 0.8) colorIdx = 2;
            else if (accentSeed[i] < preset.accentRate || (out.accent > 0.55 && accentSeed[i] < 0.5)) colorIdx = 1;
          }
          const key = level === 0 ? 0 : colorIdx * 1024 + level * 64 + chars[i];
          if (key === drawnKey[i]) continue;
          drawnKey[i] = key;
          clears.push(i);
          if (level === 0) continue;
          const sk = colorIdx * 100 + level;
          let list = buckets.get(sk);
          if (!list) buckets.set(sk, (list = []));
          list.push(i);
        }
      }
      if (!clears.length) return;
      for (const i of clears) {
        ctx.clearRect((i % cols) * cellW, Math.floor(i / cols) * cellH, cellW, cellH);
      }
      ctx.font = font;
      ctx.textBaseline = "middle";
      for (const [sk, list] of buckets) {
        ctx.fillStyle = styleFor(Math.floor(sk / 100), sk % 100);
        for (const i of list) {
          ctx.fillText(CHARSET[chars[i]], (i % cols) * cellW, Math.floor(i / cols) * cellH + cellH / 2);
        }
      }
    }

    function staticDraw() {
      if (!resize()) return;
      // 静态帧也让动效先跑一小段，水波 / 爱心等形状已经展开
      if (runner && runner.time() < 0.5) runner.update(1.5, frame);
      draw();
    }

    function reducedMotion() {
      return Boolean(reduceQuery && reduceQuery.matches);
    }

    function pageHidden() {
      return typeof document !== "undefined" && document.visibilityState === "hidden";
    }

    function tick(now) {
      raf = 0;
      if (!wanted || pageHidden() || reducedMotion()) return;
      const fps = focused ? options.fps || 24 : options.idleFps || 8;
      if (now - lastFrame >= 1000 / fps - 2) {
        const dt = lastStep ? now - lastStep : 1000 / fps;
        lastFrame = now;
        lastStep = now;
        mutate(dt);
        if (resize()) {
          runner.update(Math.min(dt, 250) / 1000, frame);
          draw();
        }
      }
      raf = requestAnimationFrame(tick);
    }

    function schedule() {
      if (raf || !wanted) return;
      if (pageHidden()) return;
      if (reducedMotion()) {
        // 减少动态效果：只画一帧静态画面
        staticDraw();
        return;
      }
      lastStep = 0;
      raf = requestAnimationFrame(tick);
    }

    function stopLoop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    const onVisibility = () => (pageHidden() ? stopLoop() : schedule());
    const onFocus = () => {
      focused = true;
    };
    const onBlur = () => {
      focused = false;
    };
    const onReduce = () => {
      stopLoop();
      schedule();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    if (reduceQuery && reduceQuery.addEventListener) reduceQuery.addEventListener("change", onReduce);

    let resizeObserver = null;
    if (typeof ResizeObserver === "function") {
      resizeObserver = new ResizeObserver(() => {
        if (!wanted) return;
        if (resize()) {
          if (reducedMotion()) staticDraw();
        }
      });
      resizeObserver.observe(canvas);
    }

    return {
      /** 开始 / 停止（不可见时调用 setActive(false)，零开销） */
      setActive(active) {
        wanted = Boolean(active);
        canvas.classList.toggle("is-active", wanted);
        if (wanted) schedule();
        else stopLoop();
      },
      isRunning() {
        return Boolean(raf);
      },
      setIntensity(name) {
        const next = getPreset(name);
        if (next === preset) return;
        preset = next;
        rebuildRunner();
        if (wanted && reducedMotion()) staticDraw();
      },
      setEffect(id) {
        const next = FX.isEffectId(id) ? id : "drift";
        if (next === effectId) return;
        effectId = next;
        rebuildRunner();
        if (wanted && reducedMotion()) staticDraw();
      },
      setHeartTint(tint) {
        const next = tint === "accent" ? "accent" : "pink";
        if (next === heartTint) return;
        heartTint = next;
        if (chars.length) readTheme();
        if (wanted && reducedMotion()) staticDraw();
      },
      currentEffect() {
        return runner ? runner.currentId() : effectId;
      },
      setAlphaScale(value) {
        if (value === alphaScale) return;
        alphaScale = value;
        drawnKey.fill(-1);
        if (wanted && reducedMotion()) staticDraw();
      },
      refreshTheme() {
        if (!chars.length) return;
        readTheme();
        if (wanted && reducedMotion()) staticDraw();
      },
      destroy() {
        stopLoop();
        wanted = false;
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("focus", onFocus);
        window.removeEventListener("blur", onBlur);
        if (reduceQuery && reduceQuery.removeEventListener) reduceQuery.removeEventListener("change", onReduce);
        if (resizeObserver) resizeObserver.disconnect();
      },
    };
  }

  return {
    CHARSET,
    LEVELS,
    PRESETS,
    getPreset,
    clamp,
    smoothstep,
    createRng,
    computeGrid,
    mutationCount,
    makeWaves,
    stepWaves,
    waveIntensity,
    centerMask,
    quantizeLevel,
    cellAlpha,
    toRgba,
    luminance,
    create,
  };
});
