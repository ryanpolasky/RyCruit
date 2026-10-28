import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import WebSocket from "ws";
const port = 3099;
const padId = "persist-" + Date.now().toString(36);
async function start() {
  const child = spawn(process.execPath, ["server/index.js"], {
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: "./data/persistence-test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    child.stdout.on("data", (chunk) => {
      if (chunk.toString().includes("listening")) resolve();
    });
    child.on("error", reject);
    child.on("exit", (code) => reject(new Error(`Server exited: ${code}`)));
  });
  return child;
}
async function stop(child) {
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  await exited;
}
async function connect() {
  const doc = new Y.Doc();
  const provider = new WebsocketProvider(
    `ws://127.0.0.1:${port}/ws`,
    padId,
    doc,
    { WebSocketPolyfill: WebSocket, disableBc: true },
  );
  await new Promise((resolve) =>
    provider.on("sync", (synced) => {
      if (synced) resolve();
    }),
  );
  return { doc, provider };
}
let server = await start();
try {
  const a = await connect();
  a.doc.getText("stdin").insert(0, "survives restart");
  await new Promise((resolve) => setTimeout(resolve, 600));
  a.provider.destroy();
  a.doc.destroy();
  await stop(server);
  server = await start();
  const b = await connect();
  assert.equal(b.doc.getText("stdin").toString(), "survives restart");
  assert.match(b.doc.getText("java").toString(), /public class Main/);
  b.provider.destroy();
  b.doc.destroy();
  console.log(
    "PASS SQLite: shared stdin and seeded code survive server restart",
  );
} finally {
  await stop(server);
}
