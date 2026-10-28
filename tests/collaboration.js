import assert from "node:assert/strict";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import WebSocket from "ws";
const port = process.env.PORT || 3001;
const padId = "test-" + Date.now().toString(36);
function client() {
  const doc = new Y.Doc();
  const provider = new WebsocketProvider(
    `ws://127.0.0.1:${port}/ws`,
    padId,
    doc,
    { WebSocketPolyfill: WebSocket, disableBc: true },
  );
  return { doc, provider };
}
async function until(predicate) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > 20000)
      throw new Error("Timed out waiting for sync");
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
}
const a = client(),
  b = client();
try {
  await until(() => a.provider.synced && b.provider.synced);
  a.doc.transact(() => {
    const code = a.doc.getText("python");
    code.delete(0, code.length);
    code.insert(0, 'print("shared result from A")');
  });
  await until(
    () =>
      b.doc.getText("python").toString() === 'print("shared result from A")',
  );
  console.log("PASS two clients: edit from A appears in B");
  a.provider.awareness.setLocalStateField("user", {
    name: "Alice",
    color: "#ff0000",
  });
  await until(() =>
    [...b.provider.awareness.getStates().values()].some(
      (state) => state.user?.name === "Alice",
    ),
  );
  console.log("PASS two clients: named presence from A appears in B");
  const response = await fetch(`http://127.0.0.1:${port}/api/run`, {
    method: "POST",
    body: JSON.stringify({ padId, by: "Alice", code: 'print("untrusted")' }),
  });
  assert.equal(response.status, 202);
  await until(() => b.doc.getArray("results").length > 0);
  const result = b.doc.getArray("results").get(0);
  assert.equal(result.stdout, "shared result from A\n");
  assert.equal(result.by, "Alice");
  console.log(
    "PASS two clients: run triggered by A shows result in B (server-owned code)",
  );
  assert.equal(b.doc.getMap("meta").get("running"), undefined);
  a.doc.getMap("meta").set("language", "cpp");
  a.doc.getMap("meta").set("startedAt", 123456);
  await until(
    () =>
      b.doc.getMap("meta").get("language") === "cpp" &&
      b.doc.getMap("meta").get("startedAt") === 123456,
  );
  console.log("PASS two clients: language and timer synchronized");
} finally {
  a.provider.destroy();
  b.provider.destroy();
  a.doc.destroy();
  b.doc.destroy();
}
