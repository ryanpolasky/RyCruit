import assert from "node:assert/strict";
import { globSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
import { createPad, startServer, stopServer } from "./helpers.js";

const base = process.env.BASE_URL || "http://localhost:5173";
const browser = await chromium.launch({
  executablePath: globSync(
    "/opt/.devin/chrome/chrome/*/chrome-linux64/chrome",
  )[0],
  args: ["--headless=new", "--no-sandbox"],
});
const shots = new URL("../shots/", import.meta.url);
await mkdir(shots, { recursive: true });
const errors = [];
const createdPads = [];
const createdInvites = [];
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  colorScheme: "dark",
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(error.message));
async function post(path, value) {
  const response = await fetch(`${base}/api/admin/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
  assert(response.ok);
  return response.json();
}
try {
  const id = await createPad(base);
  createdPads.push(id);
  const { invite } = await post("invites", {
    label: "Shua",
    kind: "single-use",
  });
  createdInvites.push(invite.token);
  const redeemed = await fetch(`${base}/i/${invite.token}`, {
    redirect: "manual",
  });
  assert.equal(redeemed.status, 303);
  createdPads.push(redeemed.headers.get("location").slice(3));
  const { invite: weekly } = await post("invites", {
    label: "Weekly practice",
    kind: "expiring",
    days: 7,
  });
  createdInvites.push(weekly.token);
  await page.goto(`${base}/admin`);
  await page.getByRole("heading", { name: "Invites", exact: false }).waitFor();
  await page.getByLabel("Label (optional)").fill("Interview partner");
  const newInvite = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/admin/invites") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Create invite", exact: true })
    .click();
  const created = await newInvite;
  const createdBody = await created.json();
  assert.equal(created.status(), 201, JSON.stringify(createdBody));
  const { invite: fromForm } = createdBody;
  createdInvites.push(fromForm.token);
  const formRow = page
    .getByRole("row")
    .filter({
      has: page.getByRole("cell", { name: "Interview partner", exact: true }),
    })
    .first();
  await formRow.getByRole("button", { name: "Copy link", exact: true }).click();
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    `${base}/i/${fromForm.token}`,
  );
  await formRow.getByRole("button", { name: "Revoke", exact: true }).click();
  await formRow.getByRole("cell", { name: "Revoked", exact: true }).waitFor();
  console.log(
    "PASS admin UI: create invite, copy bearer link and revoke update the list",
  );
  for (const theme of ["dark", "light"]) {
    if (theme === "light")
      await page.getByRole("button", { name: "Switch to light theme" }).click();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: new URL(`admin-${theme}.png`, shots).pathname,
      fullPage: true,
    });
    console.log(
      `PASS admin ${theme}: pads, attribution, activity, invite form, uses, expiry and revoke state captured at 1440x900`,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  console.log("PASS admin mobile: table scroll stays inside page at 390x844");
  await page.evaluate(() => {
    navigator.clipboard.writeText = async () => {
      throw new Error("Clipboard denied");
    };
  });
  const weeklyRow = page
    .getByRole("row")
    .filter({
      has: page.getByRole("cell", { name: "Weekly practice", exact: true }),
    })
    .filter({ has: page.getByRole("cell", { name: "Active", exact: true }) });
  await weeklyRow
    .getByRole("button", { name: "Copy link", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Clipboard unavailable" })
    .waitFor();
  await weeklyRow
    .getByRole("button", { name: "Link shown", exact: true })
    .waitFor();
  console.log(
    "PASS admin clipboard error: manual invite link shown without claiming it was copied",
  );
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(base);
  await page.evaluate(() => document.fonts.ready);
  assert.equal(
    await page
      .getByRole("link", { name: "New pad", exact: true })
      .getAttribute("href"),
    "/new",
  );
  assert.equal(await page.locator(".demo-cursor").count(), 2);
  await page.screenshot({ path: new URL("landing-dark.png", shots).pathname });
  await page.getByRole("link", { name: "New pad", exact: true }).click();
  await page.waitForURL(/\/p\/[a-zA-Z0-9_-]{16,}$/);
  createdPads.push(new URL(page.url()).pathname.slice(3));
  await page.getByRole("heading", { name: "Join pad", exact: true }).waitFor();
  console.log(
    "PASS product landing: dark screenshot, only landing, New pad follows server /new redirect",
  );
  await page.goto(`${base}/p/does-not-exist`);
  await page
    .getByRole("heading", { name: "Pad not found", exact: true })
    .waitFor();
  console.log(
    "PASS unknown-pad UI: Pad not found without name prompt or editor",
  );
  const padRowPage = await context.newPage();
  await padRowPage.goto(`${base}/admin`);
  const row = padRowPage
    .getByRole("row")
    .filter({ has: padRowPage.getByRole("cell", { name: id, exact: true }) });
  await row.waitFor();
  padRowPage.once("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  await row.waitFor({ state: "detached" });
  console.log("PASS admin UI: confirmed pad deletion removes its row");
  await padRowPage.close();
  const locked = await startServer(3102);
  try {
    const denied = await context.newPage();
    await denied.route("**/api/admin/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const response = await fetch(`http://127.0.0.1:3102${path}`);
      await route.fulfill({
        status: response.status,
        contentType: "application/json",
        body: await response.text(),
      });
    });
    await denied.goto(`${base}/admin`);
    await denied
      .getByRole("alert")
      .filter({ hasText: "Admin access required" })
      .waitFor();
    await denied.unrouteAll();
    await denied.route("**/api/admin/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ pads: [], invites: [] }),
      }),
    );
    await denied.reload();
    await denied.getByText("No pads yet", { exact: true }).waitFor();
    await denied.getByText("No invites yet", { exact: true }).waitFor();
    await denied.close();
    console.log(
      "PASS admin UI: server 403 shown without management controls; empty pad/invite lists render correctly",
    );
  } finally {
    await stopServer(locked);
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS screenshots: shots/admin-dark.png, shots/admin-light.png, shots/landing-dark.png; no browser errors",
  );
} finally {
  await browser.close();
  for (const token of createdInvites) await post(`invites/${token}/revoke`, {});
  for (const id of createdPads)
    await fetch(`${base}/api/admin/pads/${id}`, { method: "DELETE" });
}
