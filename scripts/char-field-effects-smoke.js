const assert = require("node:assert/strict");
const FX = require("../renderer/char-field-effects.js");
const CF = require("../renderer/char-field.js");

const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// 注册表与设置项
assert.deepEqual(FX.EFFECT_ORDER, ["drift", "ripple", "heart", "circle", "curve"]);
assert.deepEqual(
  FX.EFFECT_OPTIONS.map((o) => o.label),
  ["漂移光斑", "随机水波", "爱心扩散", "圆圈缩放", "曲线波动", "自动轮播"]
);
assert.ok(FX.isEffectId("auto") && FX.isEffectId("heart"));
assert.ok(!FX.isEffectId("toString") && !FX.isEffectId("matrix"));
assert.equal(CF.waveIntensity, FX.waveIntensity, "char-field 仍导出漂移光斑函数");

// 水波：波前最亮、离开波前衰减、余波更弱
assert.equal(FX.ringFalloff(0.3, 0.3, 0.02), 1);
assert.ok(FX.ringFalloff(0.32, 0.3, 0.02) < 0.5);
assert.ok(FX.ringFalloff(0.4, 0.3, 0.02) < 1e-6);
assert.ok(close(FX.ringFalloff(0.28, 0.3, 0.02), FX.ringFalloff(0.32, 0.3, 0.02)), "对称");
const front = FX.rippleValue(0.3, 0.3, 0.02, 0.05, 3);
const echo = FX.rippleValue(0.25, 0.3, 0.02, 0.05, 3);
assert.ok(close(front.front, 1, 1e-3) && echo.value < front.value && echo.value > 0.3);
assert.equal(FX.rippleValue(0.01, 0.03, 0.005, 0.05, 3).value < 0.01, true, "半径小于间距时不画余波");

// 爱心：隐函数内外、轮廓发光
assert.ok(FX.heartContains(0, 0), "中心在心形内");
assert.ok(FX.heartContains(0.5, 0.5), "左右心瓣");
assert.ok(FX.heartContains(0, -0.9), "下尖附近");
assert.ok(!FX.heartContains(0, 1.1), "顶部凹口外");
assert.ok(!FX.heartContains(1.3, 0) && !FX.heartContains(0, -1.1));
assert.ok(close(FX.heartImplicit(1, 0), 0), "(1,0) 在轮廓上");
assert.ok(FX.heartDistance(1, 0) < 1e-9);
assert.ok(FX.heartDistance(1.1, 0) > FX.heartDistance(1.02, 0));
assert.ok(FX.heartGlow(1, 0, 0.4, 0.02) > 0.99);
assert.ok(FX.heartGlow(0, 0, 0.4, 0.02) < 0.01, "心形中心不在轮廓上");
assert.ok(FX.heartContains(-0.5, 0.5) === FX.heartContains(0.5, 0.5), "左右对称");

// 同心圆：环上为 1，两环之间为 0，phase 推动外扩
assert.ok(close(FX.concentricRing(0.2, 0.1, 0), 1));
assert.ok(FX.concentricRing(0.25, 0.1, 0) < 1e-9);
assert.ok(close(FX.concentricRing(0.25, 0.1, 0.5), 1), "相位半周后圆环移到原来的间隙");

// 曲线：位置 / 斜率 / 距离
const c = { baseY: 0.5, comps: [{ amp: 0.1, freq: 2, speed: 1, phase: 0 }], modFreq: 0, modPhase: Math.PI / 2 };
const at0 = FX.curveAt(c, 0, 0);
assert.ok(close(at0.y, 0.5) && close(at0.slope, 0.2));
const atQ = FX.curveAt(c, Math.PI / 4, 0);
assert.ok(close(atQ.y, 0.6) && close(atQ.slope, 0, 1e-9));
assert.ok(close(FX.curveDistance(0.7, 0.6, 0), 0.1));
assert.ok(FX.curveDistance(0.7, 0.6, 1) < 0.1, "斜坡上垂直距离更短");
assert.ok(FX.makeCurves(4, CF.createRng(1)).every((k) => k.baseY > 0 && k.baseY < 1));

// 自动轮播与交叉淡化
assert.deepEqual(FX.rotationAt(0, 5), { index: 0, next: 1, mix: 0 });
assert.equal(FX.rotationAt(10, 5).mix, 0);
assert.ok(close(FX.rotationAt(18.5, 5).mix, 0.5), "淡化中点");
assert.equal(FX.rotationAt(25, 5).index, 1);
assert.equal(FX.rotationAt(99, 5).next, 0, "最后一个之后回到第一个");
assert.equal(FX.rotationAt(5, 1).mix, 0);
const a = { value: 1, accent: 1, warm: 0, boost: 1 };
FX.blendOut(a, { value: 1, accent: 0, warm: 1, boost: 0 }, 0.25);
assert.ok(close(a.value, 1) && close(a.accent, 0.75) && close(a.warm, 0.25) && close(a.boost, 0.75));

// 每个动效都能在网格上跑起来，输出在 0..1，并真的照亮了一部分格子
const cols = 120;
const rows = 40;
const aspect = (cols * 8) / (rows * 18);
const colX = Float32Array.from({ length: cols }, (_, i) => ((i + 0.5) * 8) / (rows * 18));
const frame = { cols, rows, aspect, colX };
const out = FX.newOut();
for (const mode of [...FX.EFFECT_ORDER, "auto"]) {
  const runner = FX.createRunner(mode, CF.createRng(11), { density: 1, aspect });
  let lit = 0;
  let max = 0;
  let warm = 0;
  for (let step = 0; step < 40; step += 1) {
    runner.update(0.05, frame);
    for (let r = 0; r < rows; r += 1) {
      for (let col = 0; col < cols; col += 1) {
        runner.sample(colX[col], (r + 0.5) / rows, col, r, out);
        assert.ok(out.value >= 0 && out.value <= 1 && out.accent >= 0 && out.accent <= 1, mode);
        if (out.value > 0.3) lit += 1;
        if (out.warm > 0.5) warm += 1;
        max = Math.max(max, out.value);
      }
    }
  }
  const share = lit / (40 * rows * cols);
  assert.ok(max > 0.5, `${mode} 应有亮区`);
  assert.ok(share > 0.005 && share < 0.6, `${mode} 亮区占比 ${share.toFixed(3)}`);
  if (mode === "heart") assert.ok(warm > 0, "爱心带暖色");
  assert.equal(runner.mode, mode);
}

// 数量上限：水波、爱心不会无限增加
const rp = FX.EFFECTS.ripple.init(CF.createRng(2), { density: 1, aspect });
const ht = FX.EFFECTS.heart.init(CF.createRng(2), { density: 1, aspect });
const rng = CF.createRng(5);
for (let t = 0; t < 120; t += 0.05) {
  FX.EFFECTS.ripple.update(rp, 0.05, t, rng, frame);
  FX.EFFECTS.heart.update(ht, 0.05, t, rng, frame);
  assert.ok(rp.ripples.length <= rp.maxRipples);
  assert.ok(ht.hearts.length <= ht.maxHearts);
}

// 轮播：时间推进后切到下一个动效
const auto = FX.createRunner("auto", CF.createRng(3), { aspect });
assert.equal(auto.currentId(), "drift");
for (let i = 0; i < 21 * 20; i += 1) auto.update(0.05, frame);
assert.equal(auto.currentId(), "ripple");

console.log("char field effects smoke ok");
