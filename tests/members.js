import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { globSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { chromium } from "playwright-core";
import { startServer, stopServer } from "./helpers.js";

const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), kid: "members" };
const directory = `./data/members-test-${Date.now()}`;
const env = {
  DATA_DIR: directory,
  NODE_OPTIONS: "--import=./tests/jwks-fixture.js",
  TEST_JWKS: JSON.stringify({ keys: [jwk] }),
};
const base = "http://127.0.0.1:3104";
let server = await startServer(3104, env);
async function token(email, aud = "member-audience") {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "RS256", kid: "members" })
    .setSubject(email)
    .setIssuer("https://test-team.cloudflareaccess.com")
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(privateKey);
}
const admin = await token("ryan@example.com", "test-audience");
const member = await token("shua@example.com");
const stranger = await token("other@example.com");
async function request(path, jwt = member, options = {}) {
  return fetch(`${base}${path}`, {
    redirect: "manual",
    ...options,
    headers: { "Cf-Access-Jwt-Assertion": jwt, ...options.headers },
  });
}
async function setStatus(email, status, extra = {}) {
  return request(`/api/admin/users/${encodeURIComponent(email)}`, admin, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, ...extra }),
  });
}
let browser;
try {
  const pending = await request("/new");
  assert.equal(pending.status, 403);
  const html = await pending.text();
  assert.match(html, /Waiting on Ryan/);
  assert.match(html, /shua@example.com/);
  assert.deepEqual(await (await request("/api/me")).json(), {
    email: "shua@example.com",
    status: "pending",
    isAdmin: false,
  });
  const db = new DatabaseSync(`${directory}/rycruit.sqlite`);
  const first = db
    .prepare("SELECT * FROM users WHERE email=?")
    .get("shua@example.com");
  assert.equal(first.status, "pending");
  assert(first.firstSeen <= first.lastSeen);
  assert.equal(first.approvedAt, null);
  assert.equal(db.prepare("SELECT count(*) AS n FROM pads").get().n, 0);
  db.close();
  console.log(
    "PASS member sign-in: unknown email gets pending page and user row; /api/me reports identity/status; no pad created",
  );
  for (const jwt of [
    member,
    await token("ryan@example.com"),
    await token("other@example.com", "test-audience"),
    await token("ryan@example.com", "wrong-audience"),
  ]) {
    for (const path of [
      "/admin",
      "/api/admin",
      "/api/admin/users",
      "/api/admin/pads",
    ])
      assert.equal((await request(path, jwt)).status, 403);
    assert.equal(
      (
        await request("/api/admin/users/shua%40example.com", jwt, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: '{"status":"allowed"}',
        })
      ).status,
      403,
    );
  }
  assert.equal(
    (
      await request(
        "/api/me",
        await token("shua@example.com", "wrong-audience"),
      )
    ).status,
    403,
  );
  assert.equal(
    (await request("/new", await token("shua@example.com", "wrong-audience")))
      .status,
    403,
  );
  assert.equal((await request("/api/admin/users", admin)).status, 200);
  const adminMember = await request("/api/me", await token("ryan@example.com"));
  assert.deepEqual(await adminMember.json(), {
    email: "ryan@example.com",
    status: "allowed",
    isAdmin: false,
  });
  assert.equal(
    (await request("/new", await token("ryan@example.com"))).status,
    303,
  );
  assert.deepEqual(await (await request("/api/me", admin)).json(), {
    email: "ryan@example.com",
    status: "allowed",
    isAdmin: true,
  });
  console.log(
    "PASS route audiences: members cannot administer, even with admin email; admin requires admin AUD plus allowlisted email; wrong AUD fails; admins always allowed",
  );
  assert.equal(
    (
      await setStatus("shua@example.com", "allowed", {
        note: "Practice partner",
      })
    ).status,
    200,
  );
  const created = await request("/new");
  assert.equal(created.status, 303);
  const id = created.headers.get("location").slice(3);
  const pads = await (await request("/api/admin/pads", admin)).json();
  assert.equal(
    pads.pads.find((p) => p.id === id).createdBy,
    "shua@example.com",
  );
  assert.equal((await fetch(`${base}/api/pads/${id}`)).status, 200);
  let people = (await (await request("/api/admin/users", admin)).json()).users;
  const allowed = people.find((p) => p.email === "shua@example.com");
  assert.equal(allowed.note, "Practice partner");
  assert(allowed.approvedAt > 0);
  assert.equal(allowed.firstSeen, first.firstSeen);
  assert.equal((await setStatus("shua@example.com", "blocked")).status, 200);
  const blocked = await request("/new");
  assert.equal(blocked.status, 403);
  assert.match(await blocked.text(), /No access/);
  assert.equal((await (await request("/api/me")).json()).status, "blocked");
  assert.equal((await setStatus("ryan@example.com", "blocked")).status, 409);
  assert.equal((await setStatus("missing@example.com", "allowed")).status, 404);
  assert.equal((await setStatus("shua@example.com", "invalid")).status, 400);
  assert.equal(
    (await setStatus("shua@example.com", "allowed", { note: "x".repeat(501) }))
      .status,
    400,
  );
  assert.equal(
    (
      await request("/api/admin/users/shua%40example.com", admin, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://evil.example",
        },
        body: '{"status":"allowed"}',
      })
    ).status,
    403,
  );
  console.log(
    "PASS approvals: allow enables pad creation attributed to email; block prevents creation; admin immutable; invalid, missing and cross-site updates rejected",
  );
  await stopServer(server);
  server = await startServer(3104, env);
  assert.equal((await (await request("/api/me")).json()).status, "blocked");
  assert.equal((await setStatus("shua@example.com", "pending")).status, 200);
  assert.match(await (await request("/new")).text(), /Waiting on Ryan/);
  people = (await (await request("/api/admin/users", admin)).json()).users;
  assert.equal(
    people.find((p) => p.email === "shua@example.com").approvedAt,
    null,
  );
  console.log(
    "PASS user persistence: status survives restart; Remove returns to pending and clears approval",
  );
  await request("/api/me", stranger);
  await request("/api/me", await token("allowed@example.com"));
  await setStatus("allowed@example.com", "allowed");
  const escaped = await request("/new", await token("<script>@example.com"));
  assert.match(await escaped.text(), /&lt;script&gt;@example.com/);
  browser = await chromium.launch({
    executablePath: globSync(
      "/opt/.devin/chrome/chrome/*/chrome-linux64/chrome",
    )[0],
    args: ["--headless=new", "--no-sandbox"],
  });
  const shots = new URL("../shots/", import.meta.url);
  await mkdir(shots, { recursive: true });
  const errors = [];
  const guest = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "dark",
    extraHTTPHeaders: { "Cf-Access-Jwt-Assertion": member },
  });
  const page = await guest.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/new`);
  await page
    .getByRole("heading", { name: "Waiting on Ryan", exact: true })
    .waitFor();
  await page.screenshot({ path: new URL("waiting-dark.png", shots).pathname });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: new URL("waiting-mobile-dark.png", shots).pathname,
  });
  const host = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "dark",
    extraHTTPHeaders: { "Cf-Access-Jwt-Assertion": admin },
  });
  const adminPage = await host.newPage();
  adminPage.on("pageerror", (error) => errors.push(error.message));
  await adminPage.goto(`${base}/admin`);
  const shua = adminPage.getByRole("row").filter({
    has: adminPage.getByRole("cell", {
      name: "shua@example.com",
      exact: true,
    }),
  });
  await shua.getByRole("button", { name: "Allow", exact: true }).click();
  await shua.getByRole("cell", { name: "Allowed", exact: true }).waitFor();
  await shua
    .getByRole("button", { name: "Remove (pending)", exact: true })
    .click();
  await shua.getByRole("cell", { name: "Pending", exact: true }).waitFor();
  await shua.getByRole("button", { name: "Block", exact: true }).click();
  await shua.getByRole("cell", { name: "Blocked", exact: true }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: "No access", exact: true }).waitFor();
  await adminPage.screenshot({
    path: new URL("admin-people-dark.png", shots).pathname,
    fullPage: true,
  });
  await adminPage.route("**/api/admin/users/shua%40example.com", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Could not update person" }),
    }),
  );
  await shua.getByRole("button", { name: "Allow", exact: true }).click();
  await adminPage
    .getByRole("alert")
    .filter({ hasText: "Could not update person" })
    .waitFor();
  await shua.getByRole("cell", { name: "Blocked", exact: true }).waitFor();
  console.log(
    "PASS People UI: allow, remove-to-pending and block update status; waiting dark/mobile and People dark screenshots captured",
  );
  const inviteRes = await request("/api/admin/invites", admin, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label: "Browser guest", kind: "single-use" }),
  });
  const { invite } = await inviteRes.json();
  const anon = await browser.newContext();
  const invitePage = await anon.newPage();
  await invitePage.goto(`${base}/i/${invite.token}`);
  await invitePage
    .getByRole("heading", {
      name: "Ryan invited you to make a pad",
      exact: true,
    })
    .waitFor();
  const redemption = invitePage.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes(`/i/${invite.token}`),
  );
  await invitePage
    .getByRole("button", { name: "Create pad", exact: true })
    .click();
  const redeemed = await redemption;
  assert.equal(redeemed.status(), 303);
  await invitePage.waitForURL(/\/p\/[a-zA-Z0-9_-]{16,}$/);
  await invitePage
    .getByRole("heading", { name: "Join pad", exact: true })
    .waitFor();
  console.log(
    "PASS anonymous invite UI: GET confirmation followed by same-origin form POST creates pad without sign-in",
  );
  assert.deepEqual(errors, []);
  await browser.close();
  browser = null;
} finally {
  if (browser) await browser.close();
  await stopServer(server);
}
