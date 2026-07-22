/**
 * ssh2 interactive shell adapter with a node-pty-like surface:
 * write / resize / onData / onExit / kill / removeAllListeners
 *
 * Used for password + private-key (incl. passphrase) sessions so encrypted
 * keys unlock in-process instead of typing into OpenSSH's passphrase prompt.
 */
const fs = require("node:fs");
const { Client } = require("ssh2");
const { loadKnownHostFingerprints } = require("./ssh-session");

function buildConnectOptions(config) {
  const host = String(config.host || "").trim();
  const port = Number(config.port) || 22;
  const user = String(config.user || "").trim();
  if (!host || !user) throw new Error("SSH 主机和用户名不能为空");

  const known = loadKnownHostFingerprints(host, port);
  if (!known.size) {
    throw new Error(
      "本机 known_hosts 中没有该服务器的主机密钥。请先用「每次询问」方式连接并确认主机指纹，或手动将主机加入 ~/.ssh/known_hosts。"
    );
  }

  const options = {
    host,
    port,
    username: user,
    readyTimeout: 20_000,
    keepaliveInterval: 20_000,
    keepaliveCountMax: 3,
    hostHash: "sha256",
    hostVerifier: (hash) => known.has(hash),
  };

  const authMethod = String(config.authMethod || "password").toLowerCase();
  if (authMethod === "key") {
    if (!config.identityFile) throw new Error("秘钥登录需要选择私钥文件");
    options.privateKey = fs.readFileSync(config.identityFile);
    if (config.passphrase) options.passphrase = config.passphrase;
  } else if (authMethod === "password") {
    if (config.password) options.password = config.password;
    options.tryKeyboard = true;
    if (config.password) {
      options.onKeyboardInteractive = (_name, _instructions, _lang, prompts, finish) => {
        finish(prompts.map(() => config.password));
      };
    }
  } else {
    if (config.identityFile) {
      options.privateKey = fs.readFileSync(config.identityFile);
      if (config.passphrase) options.passphrase = config.passphrase;
    }
    if (config.password) {
      options.password = config.password;
      options.tryKeyboard = true;
    }
  }

  return options;
}

/**
 * @returns {Promise<{ write, resize, onData, onExit, kill, removeAllListeners }>}
 */
function createSsh2ShellHandle(config, { cols = 100, rows = 30 } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const client = new Client();
    const dataListeners = new Set();
    const exitListeners = new Set();
    let stream = null;
    let exited = false;
    let colsNow = Math.max(20, Math.min(400, Number(cols) || 100));
    let rowsNow = Math.max(5, Math.min(200, Number(rows) || 30));

    const fail = (error) => {
      if (settled) return;
      settled = true;
      try {
        client.end();
      } catch {
        // ignore
      }
      const message = error?.message || String(error || "SSH 连接失败");
      // Common ssh2 messages for bad passphrase / key.
      if (/encrypted|passphrase|authentication|private key/i.test(message)) {
        reject(
          new Error(
            `${message}\n\n若私钥有加密口令，请在连接对话框的「秘钥密码」中填写正确口令（不是服务器登录密码）。`
          )
        );
        return;
      }
      reject(error instanceof Error ? error : new Error(message));
    };

    const emitExit = (exitCode) => {
      if (exited) return;
      exited = true;
      for (const cb of [...exitListeners]) {
        try {
          cb({ exitCode: typeof exitCode === "number" ? exitCode : 0 });
        } catch {
          // ignore listener errors
        }
      }
      try {
        client.end();
      } catch {
        // ignore
      }
    };

    const handle = {
      write(data) {
        if (!stream || exited) return;
        try {
          stream.write(typeof data === "string" ? data : String(data ?? ""));
        } catch {
          // stream may be closing
        }
      },
      resize(nextCols, nextRows) {
        colsNow = Math.max(20, Math.min(400, Number(nextCols) || colsNow));
        rowsNow = Math.max(5, Math.min(200, Number(nextRows) || rowsNow));
        if (!stream || exited) return;
        try {
          // ssh2: setWindow(rows, cols, height, width)
          stream.setWindow(rowsNow, colsNow, 0, 0);
        } catch {
          // ignore resize races
        }
      },
      onData(callback) {
        if (typeof callback === "function") dataListeners.add(callback);
        return handle;
      },
      onExit(callback) {
        if (typeof callback === "function") exitListeners.add(callback);
        return handle;
      },
      kill() {
        try {
          stream?.close();
        } catch {
          // ignore
        }
        try {
          client.end();
        } catch {
          // ignore
        }
        emitExit(0);
      },
      removeAllListeners(event) {
        if (!event || event === "data") dataListeners.clear();
        if (!event || event === "exit") exitListeners.clear();
      },
    };

    let connectOptions;
    try {
      connectOptions = buildConnectOptions(config);
    } catch (error) {
      reject(error);
      return;
    }

    client.once("ready", () => {
      client.shell(
        {
          term: "xterm-256color",
          cols: colsNow,
          rows: rowsNow,
        },
        (error, shellStream) => {
          if (error) {
            fail(error);
            return;
          }
          stream = shellStream;
          stream.setEncoding("utf8");
          stream.on("data", (chunk) => {
            const text = typeof chunk === "string" ? chunk : String(chunk ?? "");
            for (const cb of [...dataListeners]) {
              try {
                cb(text);
              } catch {
                // ignore
              }
            }
          });
          stream.on("close", () => {
            emitExit(0);
          });
          stream.stderr?.on?.("data", (chunk) => {
            const text = typeof chunk === "string" ? chunk : String(chunk ?? "");
            for (const cb of [...dataListeners]) {
              try {
                cb(text);
              } catch {
                // ignore
              }
            }
          });
          if (!settled) {
            settled = true;
            resolve(handle);
          }
        }
      );
    });

    client.once("error", fail);
    try {
      client.connect(connectOptions);
    } catch (error) {
      fail(error);
    }
  });
}

/** Prefer in-process ssh2 when we can supply credentials (avoids OpenSSH passphrase TTY). */
function shouldUseSsh2Shell(ssh) {
  if (!ssh) return false;
  if (ssh.authMethod === "key" && ssh.identityFile) return true;
  if (ssh.authMethod === "password" && ssh.password) return true;
  if (ssh.authMethod === "ask" && (ssh.identityFile || ssh.password)) return true;
  return false;
}

module.exports = {
  createSsh2ShellHandle,
  shouldUseSsh2Shell,
  buildConnectOptions,
};
