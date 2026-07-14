const pet = document.getElementById("pet");
const badge = document.getElementById("countBadge");
const bubble = document.getElementById("bubble");
const bubbleText = document.getElementById("bubbleText");
const promptFace = document.getElementById("promptFace");
const menu = document.getElementById("menu");

let bubbleTimer = 0;
let moodTimer = 0;
let currentMood = "idle";
let status = { terminalCount: 0, activeShell: "powershell", mood: "idle" };

const LINES = {
  idle: ["矩阵在线", "等你开终端…", ">_ ready", "摸我一下？"],
  happy: ["终端又加一格！", "矩阵变强了", "好耶～", "继续冲！"],
  busy: ["终端好多…", "矩阵满负荷", "我在盯盘", "别关掉我"],
  sleep: ["zZ…", "主窗口睡着了", "叫我一声"],
  poke: ["嘿嘿", "再摸一下！", ">_ soft", "收到指令"],
  greet: ["我是矩阵仔", "桌面守护中", "双击打开主窗口"],
};

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function setMood(mood, { stickyMs = 0 } = {}) {
  const next = mood || "idle";
  currentMood = next;
  pet.classList.remove("mood-idle", "mood-happy", "mood-busy", "mood-sleep", "mood-wave");
  pet.classList.add(`mood-${next === "wave" ? "wave" : next}`);
  if (!pet.classList.contains("mood-wave") && next !== "wave") {
    // keep base mood class
  }
  if (next === "sleep") {
    promptFace.textContent = "zZ";
  } else if (next === "busy") {
    promptFace.textContent = ">>";
  } else if (next === "happy") {
    promptFace.textContent = "^_^";
  } else {
    promptFace.textContent = ">_";
  }

  if (moodTimer) clearTimeout(moodTimer);
  if (stickyMs > 0 && next !== "busy" && next !== "sleep") {
    moodTimer = window.setTimeout(() => applyStatusMood(status), stickyMs);
  }
}

function showBubble(text, ms = 2600) {
  bubbleText.textContent = text;
  bubble.hidden = false;
  if (bubbleTimer) clearTimeout(bubbleTimer);
  bubbleTimer = window.setTimeout(() => {
    bubble.hidden = true;
  }, ms);
}

function applyStatusMood(next) {
  status = next || status;
  const count = Math.max(0, Number(status.terminalCount) || 0);
  badge.textContent = String(count);

  if (status.mood === "sleep") {
    setMood("sleep");
    return;
  }
  if (count >= 6) setMood("busy");
  else if (count >= 1) setMood("idle");
  else setMood("idle");
}

function hideMenu() {
  menu.hidden = true;
}

function showMenu() {
  menu.hidden = false;
}

// Drag to move desktop window
let dragging = false;
let lastX = 0;
let lastY = 0;
let moved = false;

pet.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  if (event.target.closest(".menu")) return;
  hideMenu();
  dragging = true;
  moved = false;
  lastX = event.screenX;
  lastY = event.screenY;
  pet.classList.add("dragging");
  pet.setPointerCapture(event.pointerId);
});

pet.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  const dx = event.screenX - lastX;
  const dy = event.screenY - lastY;
  if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
  if (dx || dy) window.matrixPet.moveBy(dx, dy);
  lastX = event.screenX;
  lastY = event.screenY;
});

function endDrag(event) {
  if (!dragging) return;
  dragging = false;
  pet.classList.remove("dragging");
  try {
    pet.releasePointerCapture(event.pointerId);
  } catch {
    // ignore
  }
}

pet.addEventListener("pointerup", endDrag);
pet.addEventListener("pointercancel", endDrag);

pet.addEventListener("dblclick", (event) => {
  event.preventDefault();
  if (moved) return;
  hideMenu();
  window.matrixPet.showMain();
  showBubble(pick(LINES.greet));
  setMood("happy", { stickyMs: 1200 });
});

pet.addEventListener("click", (event) => {
  if (moved || dragging) return;
  if (event.detail > 1) return;
  // single click: poke
  setMood("happy", { stickyMs: 900 });
  pet.classList.add("mood-wave");
  showBubble(pick(LINES.poke));
  window.setTimeout(() => pet.classList.remove("mood-wave"), 600);
});

pet.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  showMenu();
});

document.addEventListener("pointerdown", (event) => {
  if (!menu.hidden && !menu.contains(event.target) && !pet.contains(event.target)) {
    hideMenu();
  }
});

menu.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  hideMenu();
  if (action === "show-main") {
    window.matrixPet.showMain();
    showBubble("打开主窗口");
  } else if (action === "new-terminal") {
    window.matrixPet.newTerminal();
    showBubble("新建终端中…");
    setMood("happy", { stickyMs: 1000 });
  } else if (action === "poke") {
    setMood("happy", { stickyMs: 1000 });
    showBubble(pick(LINES.poke));
  } else if (action === "hide-pet") {
    window.matrixPet.hidePet();
  } else if (action === "quit") {
    window.matrixPet.quitApp();
  }
});

window.matrixPet.onStatus((payload) => {
  const prev = status.terminalCount;
  applyStatusMood(payload);
  if (payload.terminalCount > prev) {
    setMood("happy", { stickyMs: 1400 });
    showBubble(pick(LINES.happy));
  } else if (payload.terminalCount < prev) {
    showBubble(payload.terminalCount === 0 ? "终端清空了" : "少了一个终端");
  } else if (payload.mood === "sleep") {
    showBubble(pick(LINES.sleep), 3200);
  }
});

// Idle chatter
window.setInterval(() => {
  if (dragging || !bubble.hidden) return;
  if (Math.random() > 0.35) return;
  if (currentMood === "busy") showBubble(pick(LINES.busy), 2200);
  else if (currentMood === "sleep") showBubble(pick(LINES.sleep), 2200);
  else showBubble(pick(LINES.idle), 2200);
}, 14000);

(async () => {
  try {
    const state = await window.matrixPet.getState();
    if (state && state.status) applyStatusMood(state.status);
  } catch {
    applyStatusMood(status);
  }
  showBubble(pick(LINES.greet), 3000);
})();
