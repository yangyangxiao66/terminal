const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const posixPath = path.posix;
const { Client } = require("ssh2");

const MAX_TEXT_BYTES = 2 * 1024 * 1024;

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function fingerprintKey(key) {
  return crypto.createHash("sha256").update(key).digest("hex");
}

function knownHostNames(host, port) {
  return port === 22 ? [host] : [`[${host}]:${port}`];
}

function knownHostPatternMatches(pattern, wanted) {
  if (!pattern.startsWith("|1|")) return wanted.has(pattern);
  const parts = pattern.split("|");
  if (parts.length !== 4) return false;
  try {
    const salt = Buffer.from(parts[2], "base64");
    const expected = Buffer.from(parts[3], "base64");
    for (const name of wanted) {
      const actual = crypto.createHmac("sha1", salt).update(name).digest();
      if (actual.length === expected.length && crypto.timingSafeEqual(actual, expected)) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

function loadKnownHostFingerprints(host, port) {
  const file = path.join(os.homedir(), ".ssh", "known_hosts");
  if (!fs.existsSync(file)) return new Set();
  const wanted = new Set(knownHostNames(host, port));
  const fingerprints = new Set();
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const fields = trimmed.split(/\s+/);
    if (fields.length < 3) continue;
    const names = fields[0].split(",");
    if (!names.some((name) => knownHostPatternMatches(name, wanted))) continue;
    try {
      fingerprints.add(fingerprintKey(Buffer.from(fields[2], "base64")));
    } catch {
      // Ignore malformed known_hosts entries.
    }
  }
  return fingerprints;
}

function defaultRemoteRoot(user) {
  return user === "root" ? "/root" : `/home/${user}`;
}

class RemoteSshSession {
  constructor(config) {
    let authMethod = String(config.authMethod || "").trim().toLowerCase();
    if (!["password", "key", "ask"].includes(authMethod)) {
      authMethod = config.identityFile ? "key" : "password";
    }
    this.config = {
      host: String(config.host || "").trim(),
      port: Number(config.port) || 22,
      user: String(config.user || "").trim(),
      authMethod,
      password: typeof config.password === "string" ? config.password : "",
      passphrase: typeof config.passphrase === "string" ? config.passphrase : "",
      identityFile: config.identityFile ? path.resolve(config.identityFile) : "",
      remoteRoot: String(config.remoteRoot || "").trim(),
    };
    if (!this.config.host || !this.config.user) {
      throw new Error("SSH 主机和用户名不能为空");
    }
    if (this.config.authMethod === "key" && !this.config.identityFile) {
      throw new Error("秘钥登录需要选择私钥文件");
    }
    this.config.remoteRoot = posixPath.normalize(
      this.config.remoteRoot || defaultRemoteRoot(this.config.user)
    );
    if (!this.config.remoteRoot.startsWith("/")) {
      throw new Error("远端根目录必须是绝对路径");
    }
    this.client = null;
    this.connecting = null;
    this.sftpClient = null;
  }

  info() {
    return {
      host: this.config.host,
      port: this.config.port,
      user: this.config.user,
      remoteRoot: this.config.remoteRoot,
      label:
        this.config.port === 22
          ? `${this.config.user}@${this.config.host}`
          : `${this.config.user}@${this.config.host}:${this.config.port}`,
    };
  }

  resolvePath(input) {
    const value = String(input || ".").trim() || ".";
    const candidate = value.startsWith("/")
      ? posixPath.normalize(value)
      : posixPath.resolve(this.config.remoteRoot, value);
    const root = this.config.remoteRoot;
    if (candidate !== root && !candidate.startsWith(`${root}/`)) {
      throw new Error(`路径超出允许的远端根目录：${root}`);
    }
    return candidate;
  }

  async connect() {
    if (this.client) return this.client;
    if (this.connecting) return this.connecting;
    this.connecting = new Promise((resolve, reject) => {
      const client = new Client();
      const known = loadKnownHostFingerprints(this.config.host, this.config.port);
      if (!known.size) {
        reject(
          new Error(
            "本机 known_hosts 中没有该服务器的主机密钥。请先用终端矩阵 SSH 连接并确认主机指纹。"
          )
        );
        return;
      }
      const options = {
        host: this.config.host,
        port: this.config.port,
        username: this.config.user,
        readyTimeout: 15_000,
        keepaliveInterval: 20_000,
        keepaliveCountMax: 3,
        hostHash: "sha256",
        hostVerifier: (hash) => known.has(hash),
      };
      const fail = (error) => {
        client.removeAllListeners();
        try {
          client.end();
        } catch {
          // Ignore cleanup races.
        }
        reject(error);
      };
      try {
        if (this.config.authMethod === "password") {
          if (this.config.password) options.password = this.config.password;
          // Many cloud hosts use keyboard-interactive instead of raw password.
          options.tryKeyboard = true;
          if (this.config.password) {
            options.onKeyboardInteractive = (_name, _instructions, _lang, prompts, finish) => {
              finish(prompts.map(() => this.config.password));
            };
          }
        } else if (this.config.authMethod === "key") {
          options.privateKey = fs.readFileSync(this.config.identityFile);
          if (this.config.passphrase) options.passphrase = this.config.passphrase;
        } else {
          // ask: use whatever credentials were provided.
          if (this.config.identityFile) {
            options.privateKey = fs.readFileSync(this.config.identityFile);
            if (this.config.passphrase) options.passphrase = this.config.passphrase;
          }
          if (this.config.password) {
            options.password = this.config.password;
            options.tryKeyboard = true;
          }
          if (!options.password && !options.privateKey && process.env.SSH_AUTH_SOCK) {
            options.agent = process.env.SSH_AUTH_SOCK;
          }
        }
      } catch (error) {
        fail(new Error(`准备 SSH 认证失败：${error?.message || error}`));
        return;
      }
      client.once("ready", () => {
        client.removeListener("error", fail);
        this.client = client;
        client.on("close", () => {
          if (this.client === client) this.client = null;
          this.sftpClient = null;
        });
        resolve(client);
      });
      client.once("error", fail);
      client.connect(options);
    }).finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  async sftp() {
    if (this.sftpClient) return this.sftpClient;
    const client = await this.connect();
    this.sftpClient = await new Promise((resolve, reject) => {
      client.sftp((error, sftp) => (error ? reject(error) : resolve(sftp)));
    });
    return this.sftpClient;
  }

  async exec(command, { cwd, timeoutMs = 60_000 } = {}) {
    const client = await this.connect();
    const workdir = this.resolvePath(cwd || this.config.remoteRoot);
    const fullCommand = `cd -- ${shellQuote(workdir)} && ${String(command || "")}`;
    return new Promise((resolve, reject) => {
      let settled = false;
      let stdout = "";
      let stderr = "";
      let activeStream = null;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          activeStream?.close();
        } catch {
          // The channel may already be closing.
        }
        reject(new Error(`远端命令执行超时（${timeoutMs}ms）`));
      }, Math.max(1_000, Math.min(300_000, Number(timeoutMs) || 60_000)));
      client.exec(fullCommand, (error, stream) => {
        if (error) {
          clearTimeout(timer);
          settled = true;
          reject(error);
          return;
        }
        activeStream = stream;
        stream.setEncoding("utf8");
        stream.stderr.setEncoding("utf8");
        stream.on("data", (chunk) => {
          if (stdout.length < MAX_TEXT_BYTES) stdout += chunk;
        });
        stream.stderr.on("data", (chunk) => {
          if (stderr.length < MAX_TEXT_BYTES) stderr += chunk;
        });
        stream.on("close", (code, signal) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({
            stdout: stdout.slice(0, MAX_TEXT_BYTES),
            stderr: stderr.slice(0, MAX_TEXT_BYTES),
            exitCode: typeof code === "number" ? code : null,
            signal: signal || null,
            cwd: workdir,
          });
        });
      });
    });
  }

  async list(input = ".") {
    const remotePath = this.resolvePath(input);
    const sftp = await this.sftp();
    const entries = await new Promise((resolve, reject) => {
      sftp.readdir(remotePath, (error, list) => (error ? reject(error) : resolve(list)));
    });
    return {
      path: remotePath,
      entries: entries.map((entry) => ({
        name: entry.filename,
        longname: entry.longname,
        size: entry.attrs.size,
        mode: entry.attrs.mode,
        uid: entry.attrs.uid,
        gid: entry.attrs.gid,
        mtime: entry.attrs.mtime,
        type: entry.attrs.isDirectory()
          ? "directory"
          : entry.attrs.isSymbolicLink()
            ? "symlink"
            : "file",
      })),
    };
  }

  async stat(input) {
    const remotePath = this.resolvePath(input);
    const sftp = await this.sftp();
    const attrs = await new Promise((resolve, reject) => {
      sftp.stat(remotePath, (error, value) => (error ? reject(error) : resolve(value)));
    });
    return {
      path: remotePath,
      size: attrs.size,
      mode: attrs.mode,
      uid: attrs.uid,
      gid: attrs.gid,
      atime: attrs.atime,
      mtime: attrs.mtime,
      type: attrs.isDirectory() ? "directory" : attrs.isSymbolicLink() ? "symlink" : "file",
    };
  }

  async readFile(input, encoding = "utf8") {
    const remotePath = this.resolvePath(input);
    const sftp = await this.sftp();
    const data = await new Promise((resolve, reject) => {
      sftp.readFile(remotePath, (error, value) => (error ? reject(error) : resolve(value)));
    });
    if (data.length > MAX_TEXT_BYTES) {
      throw new Error(`远端文件超过 ${MAX_TEXT_BYTES} 字节限制`);
    }
    const normalizedEncoding = encoding === "base64" ? "base64" : "utf8";
    return {
      path: remotePath,
      encoding: normalizedEncoding,
      size: data.length,
      content: data.toString(normalizedEncoding),
    };
  }

  async writeFile(input, content, { encoding = "utf8", mode = 0o600 } = {}) {
    const remotePath = this.resolvePath(input);
    const sftp = await this.sftp();
    const data = Buffer.from(String(content ?? ""), encoding === "base64" ? "base64" : "utf8");
    if (data.length > MAX_TEXT_BYTES) {
      throw new Error(`写入内容超过 ${MAX_TEXT_BYTES} 字节限制`);
    }
    const tempPath = `${remotePath}.terminal-matrix-${crypto.randomUUID()}.tmp`;
    try {
      await new Promise((resolve, reject) => {
        sftp.writeFile(tempPath, data, { mode }, (error) => (error ? reject(error) : resolve()));
      });
      await new Promise((resolve, reject) => {
        sftp.rename(tempPath, remotePath, (error) => (error ? reject(error) : resolve()));
      });
    } catch (error) {
      try {
        sftp.unlink(tempPath, () => {});
      } catch {
        // Best-effort cleanup only.
      }
      throw error;
    }
    return { path: remotePath, size: data.length, mode };
  }

  async mkdir(input) {
    const remotePath = this.resolvePath(input);
    const result = await this.exec(`mkdir -p -- ${shellQuote(remotePath)}`, {
      cwd: this.config.remoteRoot,
    });
    if (result.exitCode !== 0) throw new Error(result.stderr || "创建远端目录失败");
    return { path: remotePath };
  }

  close() {
    const client = this.client;
    this.client = null;
    this.sftpClient = null;
    if (client) client.end();
  }
}

module.exports = { RemoteSshSession, shellQuote, loadKnownHostFingerprints };
