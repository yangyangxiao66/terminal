const fs = require("node:fs");
const path = require("node:path");

/**
 * Strip unused native binaries after pack to shrink the Windows x64 build.
 * Keeps only node-pty win32-x64 (+ its conpty), drops darwin / arm64 copies.
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") return;

  const unpacked = path.join(
    context.appOutDir,
    "resources",
    "app.asar.unpacked",
    "node_modules",
    "node-pty"
  );

  const removeAll = (target) => {
    if (!fs.existsSync(target)) return;
    fs.rmSync(target, { recursive: true, force: true });
  };

  // prebuilds for other platforms / arches
  const prebuilds = path.join(unpacked, "prebuilds");
  if (fs.existsSync(prebuilds)) {
    for (const name of fs.readdirSync(prebuilds)) {
      if (name !== "win32-x64") {
        removeAll(path.join(prebuilds, name));
      }
    }
  }

  // conpty third_party: keep win10-x64 only
  const conptyRoot = path.join(unpacked, "third_party", "conpty");
  if (fs.existsSync(conptyRoot)) {
    for (const version of fs.readdirSync(conptyRoot)) {
      const versionDir = path.join(conptyRoot, version);
      if (!fs.statSync(versionDir).isDirectory()) continue;
      for (const arch of fs.readdirSync(versionDir)) {
        if (arch !== "win10-x64") {
          removeAll(path.join(versionDir, arch));
        }
      }
    }
  }

  // Drop node-pty source / build cruft if present
  for (const extra of ["src", "deps", "build", "scripts", "third_party/winpty"]) {
    removeAll(path.join(unpacked, ...extra.split("/")));
  }
};
