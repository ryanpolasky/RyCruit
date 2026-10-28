import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import * as Y from "yjs";
import { openStore } from "../server/store.js";
import { randomBytes } from "node:crypto";
import WebSocket from "ws";
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from "jose";
import { createAdminVerifier } from "../server/auth.js";
import { startServer, stopServer, createPad } from "./helpers.js";

const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwk = await exportJWK(publicKey);
jwk.kid = "test";
const verify = createAdminVerifier({
  team: "test-team",
  audience: "test-audience",
  emails: " Ryan@Example.com, other@example.com ",
  bypass: false,
  keySet: createLocalJWKSet({ keys: [jwk] }),
});
async function jwt(overrides = {}) {
  return new SignJWT({
    email: "ryan@example.com",
    sub: "user",
    iss: "https://test-team.cloudflareaccess.com",
    aud: "test-audience",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300,
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .sign(privateKey);
}
const valid = await jwt();
assert.equal(
  await verify({ headers: { "cf-access-jwt-assertion": valid } }),
  "ryan@example.com",
);
assert.equal(
  await verify({
    headers: { cookie: `other=value; CF_Authorization=${valid}` },
  }),
  "ryan@example.com",
);
for (const token of [
  "fake.jwt.value",
  await jwt({ aud: "wrong" }),
  await jwt({ iss: "https://wrong.cloudflareaccess.com" }),
  await jwt({ exp: 1 }),
  await jwt({ email: "stranger@example.com" }),
  await jwt({ exp: undefined }),
  await jwt({ nbf: Math.floor(Date.now() / 1000) + 600 }),
]) {
  assert.equal(
    await verify({ headers: { "cf-access-jwt-assertion": token } }),
    null,
  );
}
const forged = new SignJWT({ email: "ryan@example.com" }).setProtectedHeader({
  alg: "HS256",
});
assert.equal(
  await verify({
    headers: { "cf-access-jwt-assertion": await forged.sign(randomBytes(32)) },
  }),
  null,
);
const { privateKey: attacker } = await generateKeyPair("RS256");
const tampered = await new SignJWT({
  email: "ryan@example.com",
  sub: "user",
  iss: "https://test-team.cloudflareaccess.com",
  aud: "test-audience",
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 300,
})
  .setProtectedHeader({ alg: "RS256", kid: "test" })
  .sign(attacker);
assert.equal(
  await verify({ headers: { "cf-access-jwt-assertion": tampered } }),
  null,
);
assert.equal(
  await verify({
    headers: { "cf-access-authenticated-user-email": "ryan@example.com" },
  }),
  null,
);
assert.equal(
  await createAdminVerifier({ bypass: false, team: "", audience: "" })({
    headers: {},
  }),
  null,
);
console.log(
  "PASS JWT: signed admin header/cookie accepted; forged signature, algorithm, issuer, audience, expiry, future nbf, missing claims and unlisted email rejected; missing config fails closed",
);

const migrationDirectory = `./data/migration-test-${Date.now()}`;
mkdirSync(migrationDirectory);
const legacy = new DatabaseSync(`${migrationDirectory}/rycruit.sqlite`);
legacy.exec("CREATE TABLE pads (id TEXT PRIMARY KEY, state BLOB NOT NULL)");
const legacyDoc = new Y.Doc();
legacyDoc.getText("stdin").insert(0, "legacy input");
legacy
  .prepare("INSERT INTO pads VALUES (?, ?)")
  .run("old-pad", Y.encodeStateAsUpdate(legacyDoc));
legacy.close();
legacyDoc.destroy();
let migrated = openStore(migrationDirectory);
assert(migrated.exists("old-pad"));
assert.equal(migrated.listPads()[0].createdBy, "legacy");
const restored = new Y.Doc();
Y.applyUpdate(restored, migrated.load("old-pad").state);
assert.equal(restored.getText("stdin").toString(), "legacy input");
restored.destroy();
migrated.deletePad("old-pad");
migrated.close();
migrated = openStore(migrationDirectory);
assert(!migrated.exists("old-pad"));
migrated.close();
console.log(
  "PASS migration: existing pad state registered and preserved; deleted pad stays deleted after restart",
);

const locked = await startServer(3100);
try {
  for (const path of [
    "/new",
    "/admin",
    "/api/admin/pads",
    "/api/admin/invites",
  ]) {
    for (const headers of [
      {},
      { "Cf-Access-Jwt-Assertion": "fake.jwt.value" },
      { cookie: "CF_Authorization=fake.jwt.value" },
    ])
      assert.equal(
        (
          await fetch(`http://127.0.0.1:3100${path}`, {
            headers,
            redirect: "manual",
          })
        ).status,
        403,
      );
  }
  for (const [path, method] of [
    ["/api/admin/invites", "POST"],
    ["/api/admin/pads/missingpad", "DELETE"],
  ])
    assert.equal(
      (await fetch(`http://127.0.0.1:3100${path}`, { method })).status,
      403,
    );
  console.log(
    "PASS locked server: /new, /admin and admin read/write APIs return 403 without auth and with fake JWTs",
  );
} finally {
  await stopServer(locked);
}

const directory = `./data/registry-tests-${Date.now()}`;
const child = await startServer(3101, {
  ALLOW_UNAUTHENTICATED: "true",
  DATA_DIR: directory,
});
const base = "http://127.0.0.1:3101";
const db = new DatabaseSync(`${directory}/rycruit.sqlite`);
const get = (path) => fetch(`${base}${path}`, { redirect: "manual" });
const post = (path, value) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
async function rejectedSocket(id) {
  await new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:3101/ws/${id}`);
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error("Websocket rejection timed out"));
    }, 5000);
    ws.on("error", () => {});
    ws.on("open", () => {
      clearTimeout(timer);
      ws.terminate();
      reject(new Error("Unknown websocket accepted"));
    });
    ws.on("unexpected-response", (_req, res) => {
      clearTimeout(timer);
      res.resume();
      ws.terminate();
      try {
        assert.equal(res.statusCode, 404);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}
async function invite(options) {
  const response = await post("/api/admin/invites", options);
  assert.equal(response.status, 201);
  return (await response.json()).invite;
}
try {
  const unknown = "unknown-pad-not-created";
  assert.equal((await get(`/p/${unknown}`)).status, 404);
  assert.equal((await get(`/api/pads/${unknown}`)).status, 404);
  assert.equal(
    (await post("/api/run", { padId: unknown, by: "Test" })).status,
    404,
  );
  await rejectedSocket(unknown);
  assert.equal(db.prepare("SELECT count(*) AS n FROM pads").get().n, 0);
  assert.equal(db.prepare("SELECT count(*) AS n FROM pad_registry").get().n, 0);
  console.log(
    "PASS unknown pad: HTTP/API 404, run 404, websocket rejected, no state or registry row created",
  );
  const id = await createPad(base);
  const pad = (await (await get("/api/admin/pads")).json()).pads[0];
  assert.equal(pad.id, id);
  assert.equal(pad.createdBy, "ryan@local");
  assert(pad.createdAt > 0 && pad.lastActive >= pad.createdAt);
  assert.equal((await get(`/api/pads/${id}`)).status, 200);
  assert.equal((await get(`/p/${id}`)).status, 200);
  console.log(
    "PASS admin creates registered pad: random 24-character ID, owner and activity timestamps stored; public link opens",
  );
  const single = await invite({ label: "Shua", kind: "single-use" });
  const unlabeled = await invite({ kind: "single-use" });
  assert.equal(unlabeled.label, "");
  const attempts = await Promise.all([
    get(`/i/${single.token}`),
    get(`/i/${single.token}`),
  ]);
  assert.deepEqual(attempts.map((r) => r.status).sort(), [303, 410]);
  const invitePad = attempts
    .find((r) => r.status === 303)
    .headers.get("location")
    .slice(3);
  assert.equal(
    db.prepare("SELECT uses FROM invites WHERE token=?").get(single.token).uses,
    1,
  );
  assert.equal(
    db.prepare("SELECT inviteLabel FROM pad_registry WHERE id=?").get(invitePad)
      .inviteLabel,
    "Shua",
  );
  assert.equal((await get(`/i/${single.token}`)).status, 410);
  console.log(
    "PASS single-use invite: concurrent redemption creates exactly one pad, records label and one use, then returns 410",
  );
  const timed = await invite({ label: "Practice", kind: "expiring", days: 2 });
  assert.equal((await get(`/i/${timed.token}`)).status, 303);
  assert.equal((await get(`/i/${timed.token}`)).status, 303);
  assert.equal(
    db.prepare("SELECT uses FROM invites WHERE token=?").get(timed.token).uses,
    2,
  );
  db.prepare("UPDATE invites SET expiresAt=? WHERE token=?").run(
    Date.now() - 1,
    timed.token,
  );
  assert.equal((await get(`/i/${timed.token}`)).status, 410);
  const revoked = await invite({ label: "Revoked", kind: "single-use" });
  assert.equal(
    (await post(`/api/admin/invites/${revoked.token}/revoke`, {})).status,
    200,
  );
  assert.equal((await get(`/i/${revoked.token}`)).status, 410);
  assert.equal((await get("/i/not-a-token")).status, 410);
  console.log(
    "PASS expiring invite: reusable with usage count; expired, revoked and unknown invites fail with 410",
  );
  for (const value of [
    { label: "x", kind: "expiring", days: 0 },
    { label: "x", kind: "expiring", days: 366 },
    { label: "x", kind: "unknown" },
    { label: "x".repeat(81), kind: "single-use" },
  ])
    assert.equal((await post("/api/admin/invites", value)).status, 400);
  assert.equal(
    (
      await fetch(`${base}/api/admin/invites`, {
        method: "POST",
        headers: {
          Origin: "https://evil.example",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ label: "x", kind: "single-use" }),
      })
    ).status,
    403,
  );
  assert.equal(
    (await fetch(`${base}/api/admin/invites`, { method: "POST", body: "{}" }))
      .status,
    415,
  );
  console.log(
    "PASS invite validation: invalid options, cross-site mutations and non-JSON creation rejected",
  );
  const ws = new WebSocket(`ws://127.0.0.1:3101/ws/${id}`);
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  const closed = new Promise((resolve) => ws.once("close", resolve));
  assert.equal(
    (await fetch(`${base}/api/admin/pads/${id}`, { method: "DELETE" })).status,
    200,
  );
  await closed;
  await rejectedSocket(id);
  assert.equal((await get(`/api/pads/${id}`)).status, 404);
  assert.equal((await post("/api/run", { padId: id, by: "Test" })).status, 404);
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(
    db.prepare("SELECT count(*) AS n FROM pads WHERE id=?").get(id).n,
    0,
  );
  console.log(
    "PASS pad deletion: disconnects clients, rejects reconnect/run, deletes persisted state without resurrection",
  );
} finally {
  db.close();
  await stopServer(child);
}
