import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import { resolve, extname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import * as Y from "yjs";
import { WebSocketServer } from "ws";
import {
  setupWSConnection,
  setContentInitializor,
  getYDoc,
  docs,
} from "@y/websocket-server/utils";
import { runCode } from "./runner.js";

const data = process.env.DATA_DIR || "./data";
mkdirSync(data, { recursive: true });
const db = new DatabaseSync(`${data}/rycruit.sqlite`);
db.exec(
  "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS pads (id TEXT PRIMARY KEY, state BLOB NOT NULL)",
);
const load = db.prepare("SELECT state FROM pads WHERE id = ?");
const save = db.prepare(
  "INSERT INTO pads VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET state=excluded.state",
);
const pending = new Map();
const starters = {
  python:
    'import sys\n\nprint("Hello, world!")\nprint(sys.stdin.read(), end="")\n',
  cpp: '#include <iostream>\n#include <string>\n\nint main() {\n    std::cout << "Hello, world!\\n";\n    std::string line;\n    while (std::getline(std::cin, line)) std::cout << line << "\\n";\n}\n',
  java: 'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, world!");\n        Scanner in = new Scanner(System.in);\n        while (in.hasNextLine()) System.out.println(in.nextLine());\n    }\n}\n',
};
setContentInitializor((doc) => {
  const stored = load.get(doc.name);
  if (stored) Y.applyUpdate(doc, stored.state);
  else
    doc.transact(() => {
      doc.getMap("meta").set("language", "python");
      Object.entries(starters).forEach(([lang, text]) =>
        doc.getText(lang).insert(0, text),
      );
      doc.getText("stdin");
      doc.getArray("results");
    });
  doc.getMap("meta").delete("running");
  doc.on("update", () => {
    clearTimeout(pending.get(doc.name));
    pending.set(
      doc.name,
      setTimeout(() => {
        save.run(doc.name, Y.encodeStateAsUpdate(doc));
        pending.delete(doc.name);
      }, 400),
    );
  });
  save.run(doc.name, Y.encodeStateAsUpdate(doc));
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
const validId = (id) => /^[a-zA-Z0-9_-]{4,32}$/.test(id);
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/run" && req.method === "POST") {
    try {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 2048) throw new Error("Request too large");
      }
      const { padId, by } = JSON.parse(body);
      if (
        typeof padId !== "string" ||
        !validId(padId) ||
        typeof by !== "string" ||
        !by.trim() ||
        by.length > 40
      )
        throw new Error("Invalid pad or name");
      const accepted = enqueue(padId, by);
      res.writeHead(accepted ? 202 : 409, {
        "Content-Type": "application/json",
      });
      res.end(JSON.stringify({ accepted }));
    } catch (error) {
      res.writeHead(400);
      res.end(error.message);
    }
    return;
  }
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
  if (!req.url?.startsWith("/ws/") || !validId(id)) return socket.destroy();
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
  for (const [id, doc] of docs) save.run(id, Y.encodeStateAsUpdate(doc));
  db.close();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
