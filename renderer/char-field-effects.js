/**
 * 字符流动背景的动效（亮度场）
 *
 * 每个动效只决定「哪些字符亮、亮多少、带不带强调色」，字符本身仍由 char-field.js 绘制。
 * 坐标约定：x ∈ [0, aspect]，y ∈ [0, 1]，单位是画布高度，所以圆 / 爱心不会被等宽格子拉扁。
 *
 * 动效接口：
 *   init(rng, ctx)                         → state      ctx = { timeSec, density, aspect }
 *   update(state, dtSec, timeSec, rng, frame)            每帧一次：移动 / 生成 / 预计算
 *   sample(state, x, y, col, row, out)                   每格一次：写 out.value / accent / warm / boost
 * frame = { cols, rows, aspect, colX: Float32Array }
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CharFieldEffects = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const TAU = Math.PI * 2;

  function clamp(v, lo = 0, hi = 1) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
  }

  function resetOut(out) {
    out.value = 0;
    out.accent = 0;
    out.warm = 0;
    out.boost = 0;
    return out;
  }

  function newOut() {
    return resetOut({});
  }

  // ───────────── 漂移光斑（原有效果） ─────────────

  /** 生成亮斑：坐标为 0..1 归一化 */
  function makeWaves(count, rng) {
    const waves = [];
    for (let i = 0; i < count; i += 1) {
      const dir = rng() < 0.5 ? -1 : 1;
      waves.push({
        x: rng(),
        y: rng(),
        vx: dir * (0.008 + rng() * 0.02),
        vy: (rng() - 0.5) * 0.012,
        rx: 0.1 + rng() * 0.18,
        ry: 0.05 + rng() * 0.1,
        amp: 0.55 + rng() * 0.45,
        freq: 0.15 + rng() * 0.35,
        phase: rng() * TAU,
        accent: rng() < 0.3,
      });
    }
    return waves;
  }

  /** 推进亮斑位置；出界后从另一侧绕回（留出半径的余量） */
  function stepWaves(waves, dtMs) {
    const dt = Math.min(dtMs, 250) / 1000;
    for (const w of waves) {
      w.x += w.vx * dt;
      w.y += w.vy * dt;
      const mx = w.rx * 1.5;
      const my = w.ry * 1.5;
      if (w.x > 1 + mx) w.x = -mx;
      else if (w.x < -mx) w.x = 1 + mx;
      if (w.y > 1 + my) w.y = -my;
      else if (w.y < -my) w.y = 1 + my;
    }
    return waves;
  }

  /** 某点（归一化坐标）的亮斑强度：{ value: 0..1, accent: 强调色占比 } */
  function waveIntensity(nx, ny, timeSec, waves) {
    let total = 0;
    let accent = 0;
    for (const w of waves) {
      const dx = (nx - w.x) / w.rx;
      const dy = (ny - w.y) / w.ry;
      const d2 = dx * dx + dy * dy;
      if (d2 > 9) continue;
      const breathe = 0.7 + 0.3 * Math.sin(timeSec * w.freq + w.phase);
      const v = w.amp * breathe * Math.exp(-d2);
      total += v;
      if (w.accent) accent += v;
    }
    return { value: clamp(total), accent: total > 0 ? accent / total : 0 };
  }

  const drift = {
    id: "drift",
    label: "漂移光斑",
    baseScale: 1,
    peak: 1,
    init(rng, ctx) {
      const count = Math.max(2, Math.round(7 * (ctx.density || 1)));
      return { waves: makeWaves(count, rng), time: ctx.timeSec || 0, aspect: ctx.aspect || 1.5 };
    },
    update(state, dtSec, timeSec, rng, frame) {
      stepWaves(state.waves, dtSec * 1000);
      state.time = timeSec;
      state.aspect = frame.aspect;
    },
    sample(state, x, y, col, row, out) {
      const r = waveIntensity(x / state.aspect, y, state.time, state.waves);
      out.value = r.value;
      out.accent = r.accent;
    },
  };

  // ───────────── 随机水波 ─────────────

  /** 环形波前：距离 d 处、半径 radius、半宽 width 的高斯亮度 */
  function ringFalloff(d, radius, width) {
    const t = (d - radius) / width;
    return Math.exp(-t * t);
  }

  /** 一圈水波（主波前 + 向内衰减的几道余波），返回 { value, front } */
  function rippleValue(d, radius, width, spacing, rings) {
    let value = 0;
    let front = 0;
    let amp = 1;
    for (let k = 0; k < rings; k += 1) {
      const r = radius - k * spacing;
      if (r <= 0) break;
      const v = amp * ringFalloff(d, r, width);
      if (k === 0) front = v;
      value += v;
      amp *= 0.55;
    }
    return { value, front };
  }

  const RIPPLE_WIDTH = 0.03;
  const RIPPLE_SPACING = 0.055;
  const RIPPLE_RINGS = 3;

  function spawnRipple(state, rng, timeSec, ageSec = 0) {
    const life = 5 + rng() * 2.5;
    state.ripples.push({
      x: 0.05 * state.aspect + rng() * 0.9 * state.aspect,
      y: 0.05 + rng() * 0.9,
      t0: timeSec - ageSec,
      speed: 0.11 + rng() * 0.09,
      life,
      amp: 0.9 + rng() * 0.1,
      accent: rng() < 0.3,
      radius: 0,
      decay: 0,
      rMin2: 0,
      rMax2: 0,
    });
  }

  const ripple = {
    id: "ripple",
    label: "随机水波",
    // 形状类动效压低底噪，让轮廓更清楚
    baseScale: 0.35,
    peak: 1.3,
    init(rng, ctx) {
      const density = ctx.density || 1;
      const state = {
        ripples: [],
        maxRipples: Math.max(2, Math.round(6 * density)),
        interval: 1.3 / density,
        nextAt: 0,
        aspect: ctx.aspect || 1.5,
      };
      const t = ctx.timeSec || 0;
      // 预热：一开始就有几圈正在扩散（静态帧 / 轮播切入时也有内容）
      for (let i = 0; i < Math.min(3, state.maxRipples); i += 1) spawnRipple(state, rng, t, 0.6 + i * 1.4);
      state.nextAt = t + state.interval * (0.5 + rng());
      return state;
    },
    update(state, dtSec, timeSec, rng, frame) {
      state.aspect = frame.aspect;
      state.ripples = state.ripples.filter((r) => timeSec - r.t0 < r.life);
      if (timeSec >= state.nextAt) {
        if (state.ripples.length < state.maxRipples) spawnRipple(state, rng, timeSec);
        state.nextAt = timeSec + state.interval * (0.4 + rng() * 1.2);
      }
      for (const r of state.ripples) {
        const age = timeSec - r.t0;
        const p = age / r.life;
        r.radius = r.speed * age;
        // 淡入 0.3s，随时间和半径衰减
        r.decay = (r.amp * Math.min(1, age / 0.3) * Math.pow(1 - p, 1.1)) / (1 + 0.6 * r.radius);
        const outer = r.radius + 3 * RIPPLE_WIDTH;
        const inner = r.radius - (RIPPLE_RINGS - 1) * RIPPLE_SPACING - 3 * RIPPLE_WIDTH;
        r.rMax2 = outer * outer;
        r.rMin2 = inner > 0 ? inner * inner : 0;
      }
    },
    sample(state, x, y, col, row, out) {
      let total = 0;
      let accent = 0;
      let boost = 0;
      for (const r of state.ripples) {
        const dx = x - r.x;
        const dy = y - r.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > r.rMax2 || d2 < r.rMin2) continue;
        const rv = rippleValue(Math.sqrt(d2), r.radius, RIPPLE_WIDTH, RIPPLE_SPACING, RIPPLE_RINGS);
        const v = rv.value * r.decay;
        total += v;
        if (r.accent) accent += v;
        boost += rv.front * r.decay;
      }
      out.value = clamp(total);
      out.accent = total > 0 ? accent / total : 0;
      out.boost = clamp(boost);
    },
  };

  // ───────────── 爱心扩散 ─────────────

  /** 心形隐函数 (X²+Y²−1)³ − X²Y³：≤ 0 在心形内 */
  function heartImplicit(X, Y) {
    const q = X * X + Y * Y - 1;
    return q * q * q - X * X * Y * Y * Y;
  }

  function heartContains(X, Y) {
    return heartImplicit(X, Y) <= 0;
  }

  /** 到心形轮廓的近似距离（单位：心形坐标）：|f| / |∇f| */
  function heartDistance(X, Y) {
    const q = X * X + Y * Y - 1;
    const f = q * q * q - X * X * Y * Y * Y;
    const q2 = q * q;
    const fx = 6 * X * q2 - 2 * X * Y * Y * Y;
    const fy = 6 * Y * q2 - 3 * X * X * Y * Y;
    const g = Math.sqrt(fx * fx + fy * fy);
    return Math.abs(f) / Math.max(g, 0.05);
  }

  /** 心形轮廓发光：scale 为心形半宽（画布高度单位），width 为光带半宽 */
  function heartGlow(X, Y, scale, width) {
    const d = heartDistance(X, Y) * scale;
    const t = d / width;
    return Math.exp(-t * t);
  }

  // 心形在 Y 方向大约 [-1, 1.25]，视觉中心上移一点
  const HEART_Y_OFFSET = 0.12;

  function spawnHeart(state, rng, timeSec, ageSec = 0, centered = false) {
    state.hearts.push({
      // 随机爱心避开中心（欢迎页中心有渐隐遮罩）
      x: centered ? 0.5 * state.aspect : (rng() < 0.5 ? 0.12 + rng() * 0.22 : 0.66 + rng() * 0.22) * state.aspect,
      y: centered ? 0.5 : 0.28 + rng() * 0.44,
      t0: timeSec - ageSec,
      life: 4.5 + rng() * 2,
      s0: 0.03,
      s1: 0.16 + rng() * 0.1,
      amp: 0.85 + rng() * 0.15,
      scale: 0.04,
      fade: 0,
      width: 0.02,
    });
  }

  const heart = {
    id: "heart",
    label: "爱心扩散",
    baseScale: 0.35,
    peak: 1.3,
    init(rng, ctx) {
      const density = ctx.density || 1;
      const state = {
        hearts: [],
        maxHearts: density < 0.9 ? 2 : 3,
        interval: 1.9 / density,
        nextAt: 0,
        count: 0,
        aspect: ctx.aspect || 1.5,
      };
      const t = ctx.timeSec || 0;
      spawnHeart(state, rng, t, 2.2, false);
      spawnHeart(state, rng, t, 0.8, false);
      state.count = 2;
      state.nextAt = t + state.interval;
      return state;
    },
    update(state, dtSec, timeSec, rng, frame) {
      state.aspect = frame.aspect;
      state.hearts = state.hearts.filter((h) => timeSec - h.t0 < h.life);
      if (timeSec >= state.nextAt) {
        if (state.hearts.length < state.maxHearts) {
          // 大约每三颗有一颗从中心升起，其余随机位置
          spawnHeart(state, rng, timeSec, 0, state.count % 3 === 0);
          state.count += 1;
        }
        state.nextAt = timeSec + state.interval * (0.7 + rng() * 0.8);
      }
      for (const h of state.hearts) {
        const p = clamp((timeSec - h.t0) / h.life);
        const ease = 1 - (1 - p) * (1 - p);
        h.scale = h.s0 + (h.s1 - h.s0) * ease;
        // 快速淡入，中段保持，最后 40% 淡出
        h.fade = h.amp * Math.min(1, p * 6) * Math.min(1, (1 - p) * 2.5);
        h.width = 0.022 + 0.01 * p;
      }
    },
    sample(state, x, y, col, row, out) {
      let total = 0;
      for (const h of state.hearts) {
        const X = (x - h.x) / h.scale;
        const Y = (h.y - y) / h.scale + HEART_Y_OFFSET;
        const margin = 0.35 + (3 * h.width) / h.scale;
        if (X > 1.15 + margin || X < -1.15 - margin || Y > 1.25 + margin || Y < -1 - margin) continue;
        let v = heartGlow(X, Y, h.scale, h.width);
        if (heartContains(X, Y)) v += 0.14;
        total += v * h.fade;
      }
      out.value = clamp(total);
      out.warm = total > 0 ? 1 : 0;
      out.boost = clamp(total) * 0.5;
    },
  };

  // ───────────── 圆圈缩放 ─────────────

  /** 同心圆环：phase 增加时圆环向外扩，spacing 变化时整体缩放；返回 0..1 */
  function concentricRing(d, spacing, phase) {
    const c = 0.5 + 0.5 * Math.cos(TAU * (d / spacing - phase));
    const c2 = c * c;
    const c4 = c2 * c2;
    return c4 * c4;
  }

  const circle = {
    id: "circle",
    label: "圆圈缩放",
    baseScale: 0.4,
    peak: 1.3,
    init(rng, ctx) {
      const density = ctx.density || 1;
      const aspect = ctx.aspect || 1.5;
      const centers = [{ x: 0.5 * aspect, y: 0.5, ox: 0.5, oy: 0.5, phase: 0, amp: 1, drift: 0 }];
      // 中档只有一个中心（多中心的圆环互相干涉会糊成噪点）
      const extra = density > 1.1 ? 1 : 0;
      for (let i = 0; i < extra; i += 1) {
        const ox = rng() < 0.5 ? 0.15 + rng() * 0.15 : 0.7 + rng() * 0.15;
        const oy = 0.2 + rng() * 0.6;
        centers.push({ x: ox * aspect, y: oy, ox, oy, phase: rng(), amp: 0.6, drift: 0.02 + rng() * 0.03 });
      }
      return {
        centers,
        time: ctx.timeSec || 0,
        spacing: 0.09,
        phase: 0,
        breathe: 1,
        aspect,
        period: 6 + rng() * 2,
      };
    },
    update(state, dtSec, timeSec, rng, frame) {
      state.aspect = frame.aspect;
      state.time = timeSec;
      const w = (TAU * timeSec) / state.period;
      // 圆环间距随呼吸节奏放大 / 缩小，整体缓慢向外推
      state.spacing = 0.15 * (1 + 0.35 * Math.sin(w));
      state.phase = timeSec * 0.22;
      state.breathe = 0.75 + 0.25 * Math.sin(w + Math.PI / 2);
      for (const c of state.centers) {
        c.x = (c.ox + c.drift * Math.sin(timeSec * 0.13 + c.phase * TAU)) * frame.aspect;
        c.y = c.oy + c.drift * Math.cos(timeSec * 0.11 + c.phase * TAU);
      }
    },
    sample(state, x, y, col, row, out) {
      let total = 0;
      let accent = 0;
      for (const c of state.centers) {
        const dx = x - c.x;
        const dy = y - c.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > 1.4) continue;
        const ring = concentricRing(d, state.spacing, state.phase + c.phase);
        const v = ring * c.amp * state.breathe * Math.exp(-d * 0.7);
        total += v;
        // 相邻圆环交替使用强调色
        if ((Math.floor(d / state.spacing - state.phase - c.phase) & 1) === 1) accent += v;
      }
      out.value = clamp(total);
      out.accent = total > 0 ? (accent / total) * 0.9 : 0;
    },
  };

  // ───────────── 曲线波动 ─────────────

  function makeCurves(count, rng) {
    const curves = [];
    for (let i = 0; i < count; i += 1) {
      const comps = [];
      const n = 2 + (rng() < 0.5 ? 1 : 0);
      for (let k = 0; k < n; k += 1) {
        comps.push({
          amp: (0.025 + rng() * 0.06) / (k + 1),
          freq: (1.5 + rng() * 3) * (k + 1),
          speed: (0.25 + rng() * 0.5) * (rng() < 0.5 ? -1 : 1),
          phase: rng() * TAU,
        });
      }
      curves.push({
        baseY: 0.12 + ((i + 0.5) / count) * 0.76 + (rng() - 0.5) * 0.06,
        comps,
        width: 0.014 + rng() * 0.012,
        amp: 0.7 + rng() * 0.3,
        modFreq: 0.08 + rng() * 0.12,
        modPhase: rng() * TAU,
        accent: rng() < 0.35,
        ys: null,
        ks: null,
        gain: 1,
      });
    }
    return curves;
  }

  /** 曲线在 x 处的 y 与斜率 dy/dx */
  function curveAt(curve, x, timeSec) {
    const mod = 0.7 + 0.3 * Math.sin(timeSec * curve.modFreq + curve.modPhase);
    let y = curve.baseY;
    let slope = 0;
    for (const c of curve.comps) {
      const a = c.freq * x + c.phase + c.speed * timeSec;
      y += c.amp * mod * Math.sin(a);
      slope += c.amp * mod * c.freq * Math.cos(a);
    }
    return { y, slope };
  }

  /** 点到曲线的近似距离：竖直距离按斜率修正 */
  function curveDistance(y, curveY, slope) {
    return Math.abs(y - curveY) / Math.sqrt(1 + slope * slope);
  }

  const curve = {
    id: "curve",
    label: "曲线波动",
    baseScale: 0.45,
    peak: 1.2,
    init(rng, ctx) {
      const count = Math.max(2, Math.round(4 * (ctx.density || 1)));
      return { curves: makeCurves(count, rng), cols: 0 };
    },
    update(state, dtSec, timeSec, rng, frame) {
      const { cols, colX } = frame;
      for (const c of state.curves) {
        if (!c.ys || c.ys.length !== cols) {
          c.ys = new Float32Array(cols);
          c.ks = new Float32Array(cols);
        }
        // 每帧按列预计算曲线位置，逐格只做减法和一次 exp
        for (let i = 0; i < cols; i += 1) {
          const r = curveAt(c, colX[i], timeSec);
          c.ys[i] = r.y;
          c.ks[i] = 1 / Math.sqrt(1 + r.slope * r.slope);
        }
        c.gain = c.amp * (0.75 + 0.25 * Math.sin(timeSec * 0.3 + c.modPhase));
      }
      state.cols = cols;
    },
    sample(state, x, y, col, row, out) {
      let total = 0;
      let accent = 0;
      for (const c of state.curves) {
        if (!c.ys) continue;
        const d = Math.abs(y - c.ys[col]) * c.ks[col];
        if (d > c.width * 6) continue;
        const t = d / c.width;
        const t2 = t / 3;
        // 亮芯 + 柔和外晕
        const v = c.gain * (Math.exp(-t * t) + 0.22 * Math.exp(-t2 * t2));
        total += v;
        if (c.accent) accent += v;
      }
      out.value = clamp(total);
      out.accent = total > 0 ? accent / total : 0;
    },
  };

  // ───────────── 注册表 / 自动轮播 ─────────────

  const EFFECTS = { drift, ripple, heart, circle, curve };
  const EFFECT_ORDER = ["drift", "ripple", "heart", "circle", "curve"];
  const EFFECT_OPTIONS = [
    ...EFFECT_ORDER.map((id) => ({ id, label: EFFECTS[id].label })),
    { id: "auto", label: "自动轮播" },
  ];
  const ROTATION_PERIOD = 20;
  const ROTATION_FADE = 3;

  function isEffectId(id) {
    return id === "auto" || Object.prototype.hasOwnProperty.call(EFFECTS, id);
  }

  /**
   * 自动轮播：每 period 秒换一个，最后 fade 秒与下一个交叉淡化。
   * 返回 { index, next, mix }，mix 为下一个动效的权重 0..1。
   */
  function rotationAt(timeSec, count, period = ROTATION_PERIOD, fade = ROTATION_FADE) {
    if (!(count > 1)) return { index: 0, next: 0, mix: 0 };
    const t = Math.max(0, timeSec);
    const index = Math.floor(t / period) % count;
    const local = t - Math.floor(t / period) * period;
    const mix = local > period - fade ? smoothstep(period - fade, period, local) : 0;
    return { index, next: (index + 1) % count, mix };
  }

  /** 两个采样结果按权重混合，写回 a */
  function blendOut(a, b, mix) {
    const va = a.value * (1 - mix);
    const vb = b.value * mix;
    const total = va + vb;
    a.accent = total > 0 ? (a.accent * va + b.accent * vb) / total : 0;
    a.warm = total > 0 ? (a.warm * va + b.warm * vb) / total : 0;
    a.boost = a.boost * (1 - mix) + b.boost * mix;
    a.value = total;
    return a;
  }

  /**
   * 动效运行器：管理单个动效或自动轮播。
   * runner.update(dtSec, frame) 每帧一次；runner.sample(x, y, col, row, out) 每格一次。
   */
  function createRunner(mode, rng, options = {}) {
    const density = options.density || 1;
    const ids = mode === "auto" ? EFFECT_ORDER.slice() : [EFFECTS[mode] ? mode : "drift"];
    const states = new Map();
    let time = options.timeSec || 0;
    let aspect = options.aspect || 1.5;
    let current = { index: 0, next: 0, mix: 0 };
    const tmp = newOut();

    function stateFor(id) {
      let s = states.get(id);
      if (!s) {
        s = EFFECTS[id].init(rng, { timeSec: time, density, aspect });
        states.set(id, s);
      }
      return s;
    }

    function activeIds() {
      if (ids.length === 1) return [ids[0]];
      const list = [ids[current.index]];
      if (current.mix > 0) list.push(ids[current.next]);
      return list;
    }

    return {
      mode: ids.length === 1 ? ids[0] : "auto",
      update(dtSec, frame) {
        time += dtSec;
        aspect = frame.aspect || aspect;
        if (ids.length > 1) {
          const prev = current.index;
          current = rotationAt(time, ids.length);
          // 已轮播走的动效释放状态，再轮到时重新生成
          if (prev !== current.index) states.delete(ids[prev]);
        }
        for (const id of activeIds()) EFFECTS[id].update(stateFor(id), dtSec, time, rng, frame);
      },
      sample(x, y, col, row, out) {
        resetOut(out);
        if (ids.length === 1) {
          EFFECTS[ids[0]].sample(stateFor(ids[0]), x, y, col, row, out);
          return out;
        }
        EFFECTS[ids[current.index]].sample(stateFor(ids[current.index]), x, y, col, row, out);
        if (current.mix > 0) {
          resetOut(tmp);
          EFFECTS[ids[current.next]].sample(stateFor(ids[current.next]), x, y, col, row, tmp);
          blendOut(out, tmp, current.mix);
        }
        return out;
      },
      /** 当前底噪系数（轮播淡化时插值） */
      baseScale() {
        if (ids.length === 1) return EFFECTS[ids[0]].baseScale;
        const a = EFFECTS[ids[current.index]].baseScale;
        const b = EFFECTS[ids[current.next]].baseScale;
        return a + (b - a) * current.mix;
      },
      /** 当前峰值亮度系数（形状类动效略亮，轮廓更清楚） */
      peak() {
        if (ids.length === 1) return EFFECTS[ids[0]].peak;
        const a = EFFECTS[ids[current.index]].peak;
        const b = EFFECTS[ids[current.next]].peak;
        return a + (b - a) * current.mix;
      },
      currentId() {
        return ids.length === 1 ? ids[0] : ids[current.index];
      },
      time() {
        return time;
      },
    };
  }

  return {
    EFFECTS,
    EFFECT_ORDER,
    EFFECT_OPTIONS,
    ROTATION_PERIOD,
    ROTATION_FADE,
    isEffectId,
    makeWaves,
    stepWaves,
    waveIntensity,
    ringFalloff,
    rippleValue,
    heartImplicit,
    heartContains,
    heartDistance,
    heartGlow,
    concentricRing,
    makeCurves,
    curveAt,
    curveDistance,
    rotationAt,
    blendOut,
    createRunner,
    newOut,
    resetOut,
  };
});
