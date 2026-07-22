const crypto = require("node:crypto");
const http = require("node:http");
const { RemoteSshSession } = require("./ssh-session");

const MAX_BODY_BYTES = 4 * 1024 * 1024;

function jsonResponse(response, statusCode, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": body.length,
    "cache-control": "no-store",
  });
  response.end(body);
}

function tokenMatches(expected, header) {
  const value = String(header || "").replace(/^Bearer\s+/i, "");
  const left = Buffer.from(expected);
  const right = Buffer.from(value);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function readJson(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > MAX_BODY_BYTES) throw new Error("请求体过大");
    chunks.push(chunk);
  }
  if (!length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

class RemoteBridgeServer {
  constructor() {
    this.sessions = new Map();
    this.server = null;
    this.port = 0;
    this.token = crypto.randomBytes(32).toString("base64url");
  }

  async start() {
    if (this.server) return this.clientBaseUrl();
    this.server = http.createServer((request, response) => {
      this.handle(request, response).catch((error) => {
        jsonResponse(response, 500, { ok: false, error: error?.message || String(error) });
      });
    });
    await new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(0, "127.0.0.1", () => {
        this.server.removeListener("error", reject);
        resolve();
      });
    });
    this.port = this.server.address().port;
    return this.clientBaseUrl();
  }

  clientBaseUrl() {
    if (!this.port) return "";
    return `http://127.0.0.1:${this.port}`;
  }

  register(id, config) {
    const key = String(id);
    this.unregister(key);
    this.sessions.set(key, new RemoteSshSession(config));
  }

  unregister(id) {
    const key = String(id);
    const session = this.sessions.get(key);
    if (session) session.close();
    this.sessions.delete(key);
  }

  has(id) {
    return this.sessions.has(String(id));
  }

  environment(id) {
    const key = String(id || "");
    if (!this.has(key) || !this.port) return null;
    return {
      TERMINAL_MATRIX_BRIDGE_URL: this.clientBaseUrl(),
      TERMINAL_MATRIX_BRIDGE_TOKEN: this.token,
      TERMINAL_MATRIX_REMOTE_SESSION: key,
    };
  }

  async dispatch(session, tool, args) {
    if (tool === "info") return session.info();
    if (tool === "list") return session.list(args.path);
    if (tool === "stat") return session.stat(args.path);
    if (tool === "read") return session.readFile(args.path, args.encoding);
    if (tool === "exec") {
      return session.exec(args.command, { cwd: args.cwd, timeoutMs: args.timeoutMs });
    }
    if (tool === "write") {
      return session.writeFile(args.path, args.content, {
        encoding: args.encoding,
        mode: args.mode,
      });
    }
    if (tool === "mkdir") return session.mkdir(args.path);
    throw new Error(`未知远端工具：${tool}`);
  }

  async handle(request, response) {
    if (!tokenMatches(this.token, request.headers.authorization)) {
      jsonResponse(response, 401, { ok: false, error: "未授权" });
      return;
    }
    if (request.method !== "POST") {
      jsonResponse(response, 405, { ok: false, error: "只允许 POST" });
      return;
    }
    const url = new URL(request.url, this.clientBaseUrl());
    const match = /^\/v1\/sessions\/([^/]+)\/([^/]+)$/.exec(url.pathname);
    if (!match) {
      jsonResponse(response, 404, { ok: false, error: "接口不存在" });
      return;
    }
    const id = decodeURIComponent(match[1]);
    const tool = decodeURIComponent(match[2]);
    const session = this.sessions.get(id);
    if (!session) {
      jsonResponse(response, 404, { ok: false, error: "远端会话不存在或已关闭" });
      return;
    }
    try {
      const args = await readJson(request);
      const result = await this.dispatch(session, tool, args);
      jsonResponse(response, 200, { ok: true, result });
    } catch (error) {
      jsonResponse(response, 400, { ok: false, error: error?.message || String(error) });
    }
  }

  async close() {
    for (const id of [...this.sessions.keys()]) this.unregister(id);
    const server = this.server;
    this.server = null;
    this.port = 0;
    if (server) {
      await new Promise((resolve) => server.close(() => resolve()));
    }
  }
}

module.exports = { RemoteBridgeServer };
