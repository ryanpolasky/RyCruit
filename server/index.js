import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname } from "node:path";
import * as Y from "yjs";
import { WebSocketServer } from "ws";
import {
  setupWSConnection,
  setContentInitializor,
  getYDoc,
  docs,
} from "@y/websocket-server/utils";
import { runCode } from "./runner.js";
import { createAccessVerifier } from "./auth.js";
import { accessPage, invitePage } from "./access-page.js";
import { openStore, starters, validId } from "./store.js";

const store = openStore(process.env.DATA_DIR || "./data");
const authenticate = createAccessVerifier();
const adminEmails = new Set(
  (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);
if (process.env.ALLOW_UNAUTHENTICATED === "true") adminEmails.add("ryan@local");
const pending = new Map();
setContentInitializor((doc) => {
  if (!store.exists(doc.name)) throw new Error("Pad not found");
  Y.applyUpdate(doc, store.load(doc.name).state);
  doc.getMap("meta").delete("running");
  doc.on("update", () => {
    clearTimeout(pending.get(doc.name));
    pending.set(
      doc.name,
      setTimeout(() => {
        store.save(doc.name, Y.encodeStateAsUpdate(doc));
        store.touch(doc.name);
        pending.delete(doc.name);
      }, 400),
    );
  });
  return Promise.resolve();
});
const busy = new Set();
const queue = [];
let active = 0;
function drain() {
  while (active < 2 && queue.length) {
    active++;
    const job = queue.shift();
    job().finally(() => {
      active--;
      drain();
    });
  }
}
function enqueue(padId, by) {
  if (busy.has(padId)) return false;
  const doc = getYDoc(padId),
    meta = doc.getMap("meta");
  const lang = meta.get("language");
  if (!Object.hasOwn(starters, lang)) throw new Error("Invalid language");
  const input = {
    lang,
    code: doc.getText(lang).toString(),
    stdin: doc.getText("stdin").toString(),
  };
  if (input.code.length + input.stdin.length > 300000)
    throw new Error("Pad exceeds run size limit");
  busy.add(padId);
  meta.set("running", { by });
  queue.push(async () => {
    let result;
    try {
      result = await runCode(input);
    } catch (error) {
      result = { stdout: "", stderr: error.message, exitCode: 1, timeMs: 0 };
    }
    doc.transact(() => {
      const results = doc.getArray("results");
      results.push([{ ...result, lang, by, at: Date.now() }]);
      if (results.length > 20) results.delete(0, results.length - 20);
      meta.delete("running");
    });
    busy.delete(padId);
  });
  drain();
  return true;
}
function json(res, status, value) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(value));
}
async function body(req, limit = 2048) {
  let text = "";
  for await (const chunk of req) {
    text += chunk;
    if (text.length > limit) throw new Error("Request too large");
  }
  return JSON.parse(text);
}
function redirect(res, id) {
  res.writeHead(303, { Location: `/p/${id}` });
  res.end();
}
function crossSite(req) {
  const origin = req.headers.origin;
  return (
    (origin &&
      ![`https://${req.headers.host}`, `http://${req.headers.host}`].includes(
        origin,
      )) ||
    req.headers["sec-fetch-site"] === "cross-site"
  );
}
const server = http.createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname;
  const adminPath = path.startsWith("/admin") || path.startsWith("/api/admin");
  const memberPath = path === "/new" || path === "/api/me";
  const identity =
    adminPath || memberPath
      ? await authenticate(req, adminPath ? "admin" : "member")
      : null;
  if ((adminPath || memberPath) && !identity)
    return json(res, 403, {
      error: adminPath ? "Admin access required" : "Sign-in required",
    });
  const email = identity?.email;
  if (adminPath) store.seeUser(email, true);
  if (memberPath) {
    if (req.method !== "GET")
      return json(res, 405, { error: "Method not allowed" });
    const user = store.seeUser(email, identity.isAdminEmail);
    if (path === "/api/me")
      return json(res, 200, {
        email,
        status: user.status,
        isAdmin: identity.isAdmin,
      });
    if (user.status !== "allowed") {
      res.writeHead(403, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(accessPage(email, user.status === "blocked"));
    }
    return redirect(res, store.createPad(email));
  }
  if (path.startsWith("/i/")) {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.setHeader("Referrer-Policy", "same-origin");
    if (!["GET", "HEAD", "POST"].includes(req.method))
      return json(res, 405, { error: "Method not allowed" });
    const token = path.slice(3);
    if (req.method === "GET" || req.method === "HEAD") {
      const invite = store.getInvite(token);
      res.writeHead(invite ? 200 : 410, {
        "Content-Type": "text/html; charset=utf-8",
      });
      return res.end(req.method === "HEAD" ? undefined : invitePage(invite));
    }
    if (crossSite(req))
      return json(res, 403, { error: "Cross-site request rejected" });
    const id = store.redeemInvite(token);
    if (!id) {
      res.writeHead(410, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(invitePage(null));
    }
    return redirect(res, id);
  }
  if (path.startsWith("/api/admin")) {
    if (req.method === "GET" && path === "/api/admin/users")
      return json(res, 200, {
        users: store.listUsers().map((user) => ({
          ...user,
          status: adminEmails.has(user.email) ? "allowed" : user.status,
          isAdmin: adminEmails.has(user.email),
        })),
      });
    if (req.method === "GET" && path === "/api/admin/pads")
      return json(res, 200, { pads: store.listPads() });
    if (req.method === "GET" && path === "/api/admin/invites")
      return json(res, 200, { invites: store.listInvites() });
    if (crossSite(req))
      return json(res, 403, { error: "Cross-site request rejected" });
    try {
      const person = path.match(/^\/api\/admin\/users\/([^/]+)$/);
      if (req.method === "PATCH" && person) {
        if (!req.headers["content-type"]?.startsWith("application/json"))
          return json(res, 415, { error: "Expected JSON" });
        const target = decodeURIComponent(person[1]).trim().toLowerCase();
        if (adminEmails.has(target))
          return json(res, 409, { error: "Admin accounts are always allowed" });
        const { status, note } = await body(req);
        if (!store.setUserStatus(target, status, note))
          return json(res, 404, { error: "Person not found" });
        return json(res, 200, { ok: true });
      }
      if (req.method === "POST" && path === "/api/admin/invites") {
        if (!req.headers["content-type"]?.startsWith("application/json"))
          return json(res, 415, { error: "Expected JSON" });
        const invite = store.createInvite(await body(req), email);
        return json(res, 201, { invite });
      }
      const revoke = path.match(
        /^\/api\/admin\/invites\/([a-zA-Z0-9_-]{43})\/revoke$/,
      );
      if (req.method === "POST" && revoke)
        return json(res, store.revokeInvite(revoke[1]) ? 200 : 404, {
          ok: true,
        });
      const pad = path.match(/^\/api\/admin\/pads\/([a-zA-Z0-9_-]{4,32})$/);
      if (req.method === "DELETE" && pad) {
        const id = pad[1];
        if (busy.has(id))
          return json(res, 409, {
            error: "Pad is running. Try again when it finishes.",
          });
        if (!store.exists(id))
          return json(res, 404, { error: "Pad not found" });
        const doc = docs.get(id);
        if (doc) {
          for (const conn of doc.conns.keys()) conn.close(1008, "Pad deleted");
          docs.delete(id);
          doc.destroy();
        }
        clearTimeout(pending.get(id));
        pending.delete(id);
        store.deletePad(id);
        return json(res, 200, { ok: true });
      }
      return json(res, 404, { error: "Not found" });
    } catch (error) {
      return json(res, 400, { error: error.message });
    }
  }
  const padInfo = path.match(/^\/api\/pads\/([a-zA-Z0-9_-]{4,32})$/);
  if (req.method === "GET" && padInfo) {
    if (!store.exists(padInfo[1]))
      return json(res, 404, { error: "Pad not found" });
    store.touch(padInfo[1]);
    return json(res, 200, { id: padInfo[1] });
  }
  if (path === "/api/run" && req.method === "POST") {
    try {
      const { padId, by } = await body(req);
      if (
        !validId(padId) ||
        typeof by !== "string" ||
        !by.trim() ||
        by.length > 40
      )
        throw new Error("Invalid pad or name");
      if (!store.exists(padId))
        return json(res, 404, { error: "Pad not found" });
      store.touch(padId);
      const accepted = enqueue(padId, by);
      return json(res, accepted ? 202 : 409, { accepted });
    } catch (error) {
      return json(res, 400, { error: error.message });
    }
  }
  if (path.startsWith("/api/")) return json(res, 404, { error: "Not found" });
  if (path.startsWith("/p/") && !store.exists(path.slice(3)))
    res.statusCode = 404;
  try {
    let file = resolve("dist", "." + decodeURIComponent(url.pathname));
    if (!file.startsWith(resolve("dist") + "/"))
      file = resolve("dist/index.html");
    try {
      if (!(await stat(file)).isFile()) file = resolve("dist/index.html");
    } catch {
      file = resolve("dist/index.html");
    }
    const content = await readFile(file);
    res.setHeader(
      "Content-Type",
      {
        ".html": "text/html",
        ".js": "application/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
      }[extname(file)] || "application/octet-stream",
    );
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Build the client with pnpm build, or use Vite on port 5173.");
  }
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
server.on("upgrade", (req, socket, head) => {
  const id = req.url?.split("?")[0].replace(/^\/ws\//, "");
  if (!req.url?.startsWith("/ws/") || !store.exists(id)) {
    socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
    return;
  }
  store.touch(id);
  wss.handleUpgrade(req, socket, head, (ws) =>
    setupWSConnection(ws, req, { docName: id }),
  );
});
server.listen(Number(process.env.PORT || 3001), "0.0.0.0", () =>
  console.log(
    `RyCruit server listening on ${process.env.PORT || 3001} (${process.env.RUNNER || "docker"} runner)`,
  ),
);
function shutdown() {
  for (const timer of pending.values()) clearTimeout(timer);
  for (const [id, doc] of docs) store.save(id, Y.encodeStateAsUpdate(doc));
  store.close();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
