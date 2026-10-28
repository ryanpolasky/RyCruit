import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import WebSocket from "ws";
import { openStore } from "../server/store.js";
import { createPad, startServer, stopServer } from "./helpers.js";

const directory = `./data/expiry-${Date.now()}`;
mkdirSync(directory);
let at = 100000;
const retentionMs = 86400000;
const options = { now: () => at, retentionMs };
let store = openStore(directory, options);
const unused = store.createPad("test@example.com");
const invite = store.createInvite({ kind: "single-use" }, "test@example.com");
store.seeUser("test@example.com");
at += retentionMs - 1;
store.touch(unused);
assert(store.exists(unused));
assert.deepEqual(store.sweepPads(), []);
at++;
assert(!store.exists(unused));
assert.deepEqual(store.sweepPads(), [unused]);
assert.equal(store.load(unused), undefined);
assert.equal(store.listPads().length, 0);
assert(store.getInvite(invite.token));
assert.equal(store.listUsers().length, 1);
console.log(
  "PASS expiry fake clock: never-joined pads expire exactly at 24h; reads/touches do not extend retention; state and registry deleted, people/invites retained",
);

const joined = store.createPad("test@example.com");
store.connectPad(joined);
at += retentionMs * 3;
assert.deepEqual(store.sweepPads(), []);
assert(store.exists(joined));
store.disconnectPad(joined);
const originalExpiry = at + retentionMs;
at += 100;
store.close();
store = openStore(directory, options);
assert.equal(store.listPads()[0].expiresAt, originalExpiry);
assert(store.exists(joined));
store.connectPad(joined);
at = originalExpiry + 1;
assert.deepEqual(store.sweepPads(), []);
store.disconnectPad(joined);
store.close();
at += retentionMs;
store = openStore(directory, options);
assert.deepEqual(store.sweepPads(), [joined]);
assert.equal(store.load(joined), undefined);
console.log(
  "PASS expiry fake clock: connected pads survive; reconnect resets final-disconnect deadline; restart preserves deadline and expired content cannot resurrect",
);
const crashed = store.createPad("test@example.com");
store.connectPad(crashed);
at += 100;
store.touch(crashed);
store.close();
store = openStore(directory, options);
assert.equal(store.listPads()[0].expiresAt, at + retentionMs);
store.close();
console.log(
  "PASS expiry fake clock: interrupted connections recover from persisted activity timestamp",
);

const liveDirectory = `${directory}/live`;
let server = await startServer(3112, {
  DATA_DIR: liveDirectory,
  ALLOW_UNAUTHENTICATED: "true",
  PAD_TTL_MS: "3000",
});
const pad = await createPad("http://127.0.0.1:3112");
function connect() {
  const doc = new Y.Doc();
  const provider = new WebsocketProvider("ws://127.0.0.1:3112/ws", pad, doc, {
    WebSocketPolyfill: WebSocket,
    disableBc: true,
  });
  return { doc, provider };
}
async function until(predicate) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > 5000)
      throw new Error("Timed out waiting for expiry state");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
const a = connect(),
  b = connect();
let db;
try {
  await until(() => a.provider.synced && b.provider.synced);
  db = new DatabaseSync(`${liveDirectory}/rycruit.sqlite`);
  const row = () =>
    db.prepare("SELECT * FROM pad_registry WHERE id=?").get(pad);
  await new Promise((resolve) => setTimeout(resolve, 3200));
  assert.equal(row().expiresAt, null);
  a.provider.destroy();
  a.doc.destroy();
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(row().expiresAt, null);
  b.doc.getText("stdin").insert(0, "retained until expiry");
  b.provider.destroy();
  b.doc.destroy();
  await until(() => row().expiresAt !== null);
  const expiry = row().expiresAt;
  await stopServer(server);
  server = await startServer(3112, {
    DATA_DIR: liveDirectory,
    ALLOW_UNAUTHENTICATED: "true",
    PAD_TTL_MS: "3000",
  });
  assert.equal(row().expiresAt, expiry);
  assert.equal(
    (await fetch(`http://127.0.0.1:3112/api/pads/${pad}`)).status,
    200,
  );
  await until(() => Date.now() >= expiry);
  await stopServer(server);
  server = await startServer(3112, {
    DATA_DIR: liveDirectory,
    ALLOW_UNAUTHENTICATED: "true",
    PAD_TTL_MS: "3000",
  });
  assert.equal(
    (await fetch(`http://127.0.0.1:3112/api/pads/${pad}`)).status,
    404,
  );
  assert.equal(row(), undefined);
  assert.equal(db.prepare("SELECT * FROM pads WHERE id=?").get(pad), undefined);
  console.log(
    "PASS expiry websocket/startup: two connected clients outlive TTL; only last disconnect starts countdown; restart retains unexpired pad and sweeps expired state/registry",
  );
} finally {
  a.provider.destroy();
  a.doc.destroy();
  b.provider.destroy();
  b.doc.destroy();
  db?.close();
  await stopServer(server);
}
