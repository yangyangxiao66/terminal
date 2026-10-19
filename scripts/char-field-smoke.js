const assert = require("node:assert/strict");
const CF = require("../renderer/char-field.js");

// 网格尺寸
const g = CF.computeGrid(1272, 848, 7.15, 13);
assert.equal(g.cellW, 8);
assert.equal(g.cellH, 18);
assert.equal(g.cols, 159);
assert.equal(g.rows, 48);
assert.deepEqual(CF.computeGrid(0, 100, 8, 13).cols, 0);
assert.ok(CF.computeGrid(10, 10, 1, 2).cellW >= 4, "最小格宽");

// 随机数可复现且在 [0,1)
const a = CF.createRng(42);
const b = CF.createRng(42);
for (let i = 0; i < 1000; i += 1) {
  const x = a();
  assert.equal(x, b());
  assert.ok(x >= 0 && x < 1);
}

// 变异调度：长期平均符合速率，小数累积，长帧封顶
let carry = 0;
let total = 0;
for (let i = 0; i < 240; i += 1) {
  const r = CF.mutationCount(1000, 0.05, 1000 / 24, carry);
  carry = r.carry;
  total += r.count;
  assert.ok(r.count >= 0 && r.carry >= 0 && r.carry < 1);
}
assert.ok(Math.abs(total - 500) <= 1, `10 秒约 500 次，实际 ${total}`);
assert.equal(CF.mutationCount(1000, 0.05, 60000, 0).count, 12, "长间隔按 250ms 封顶");
assert.equal(CF.mutationCount(0, 0.05, 40, 0).count, 0);
assert.equal(CF.mutationCount(100, 0, 40, 0).count, 0);

// 亮斑强度：中心最亮、远处为 0、强调色占比
const waves = [{ x: 0.5, y: 0.5, vx: 0.01, vy: 0, rx: 0.2, ry: 0.1, amp: 1, freq: 0, phase: Math.PI / 2, accent: true }];
const center = CF.waveIntensity(0.5, 0.5, 0, waves);
assert.ok(Math.abs(center.value - 1) < 1e-9);
assert.equal(center.accent, 1);
const near = CF.waveIntensity(0.6, 0.5, 0, waves).value;
assert.ok(near > 0 && near < center.value);
assert.equal(CF.waveIntensity(0.95, 0.95, 0, waves).value, 0);
const mixed = CF.waveIntensity(0.5, 0.5, 0, [...waves, { ...waves[0], accent: false }]);
assert.equal(mixed.value, 1, "叠加后封顶为 1");
assert.ok(Math.abs(mixed.accent - 0.5) < 1e-9);

// 亮斑移动与绕回
const moving = [{ ...waves[0], x: 1.29, vx: 0.1 }];
CF.stepWaves(moving, 1000);
assert.ok(moving[0].x < 0, "右侧出界后从左侧绕回");
const made = CF.makeWaves(5, CF.createRng(7));
assert.equal(made.length, 5);
for (const w of made) assert.ok(w.rx > 0 && w.ry > 0 && w.amp > 0);

// 中心遮罩：中心暗、边缘亮、单调
const m0 = CF.centerMask(0.5, 0.5);
const m1 = CF.centerMask(0.7, 0.5);
const m2 = CF.centerMask(0.98, 0.98);
assert.ok(Math.abs(m0 - 0.1) < 1e-9);
assert.ok(m0 <= m1 && m1 < m2);
assert.ok(Math.abs(m2 - 1) < 1e-9);

// 亮度量化与单格亮度
assert.equal(CF.quantizeLevel(0), 0);
assert.equal(CF.quantizeLevel(1), CF.LEVELS);
assert.equal(CF.quantizeLevel(2), CF.LEVELS);
assert.equal(CF.cellAlpha(0, 0.2, 1, CF.PRESETS.mid), 0, "无亮斑、低颗粒 → 不显示");
assert.ok(CF.cellAlpha(1, 0.5, 1, CF.PRESETS.mid) <= CF.PRESETS.mid.maxAlpha);
assert.ok(CF.cellAlpha(1, 0.5, 0.1, CF.PRESETS.mid) < CF.cellAlpha(1, 0.5, 1, CF.PRESETS.mid), "遮罩压暗");
assert.ok(CF.PRESETS.low.maxAlpha < CF.PRESETS.mid.maxAlpha && CF.PRESETS.mid.maxAlpha < CF.PRESETS.high.maxAlpha);
assert.equal(CF.getPreset("nope"), CF.PRESETS.mid);

// 颜色工具
assert.equal(CF.toRgba("#101316", 0.5), "rgba(16, 19, 22, 0.5)");
assert.equal(CF.toRgba("#fff", 1), "rgba(255, 255, 255, 1)");
assert.equal(CF.toRgba("rgb(1, 2, 3)", 0.2), "rgba(1, 2, 3, 0.2)");
assert.equal(CF.toRgba("rgba(12, 14, 16, 0.16)", 0.3), "rgba(12, 14, 16, 0.3)");
assert.equal(CF.toRgba("color-mix(in srgb, red, blue)", 1), null);
assert.ok(CF.luminance("#eef1f4") > 0.6, "纸白算浅色");
assert.ok(CF.luminance("#0d1012") < 0.2, "深色皮肤");
assert.equal(CF.CHARSET.length, 62);

console.log("char field smoke ok");
