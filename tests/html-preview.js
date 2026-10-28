import assert from "node:assert/strict";
import { globSync } from "node:fs";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import WebSocket from "ws";
import { chromium } from "playwright-core";
import { startServer, stopServer, createPad } from "./helpers.js";
const base = "http://127.0.0.1:3118";
const server = await startServer(3118, {
  ALLOW_UNAUTHENTICATED: "true",
  RUNNER: "docker",
});
const browser = await chromium.launch({
  executablePath: globSync(
    "/opt/.devin/chrome/chrome/*/chrome-linux64/chrome",
  )[0],
  headless: process.env.HEADED !== "true",
  args: ["--no-sandbox", "--window-size=1440,1000"],
});
const doc = new Y.Doc();
let provider;
async function until(predicate) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > 20000)
      throw new Error("Timed out waiting for HTML test");
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
}
try {
  const pad = await createPad(base);
  provider = new WebsocketProvider("ws://127.0.0.1:3118/ws", pad, doc, {
    WebSocketPolyfill: WebSocket,
    disableBc: true,
  });
  await until(() => provider.synced);
  const contexts = await Promise.all(
    ["dark", "light"].map(async (theme) => {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        colorScheme: theme,
      });
      await context.addInitScript(
        (name) => {
          if (window === window.top) localStorage.setItem("rycruit.name", name);
        },
        theme === "dark" ? "Ryan" : "Alex",
      );
      return context;
    }),
  );
  const [a, b, light] = await Promise.all([
    contexts[0].newPage(),
    contexts[0].newPage(),
    contexts[1].newPage(),
  ]);
  await Promise.all([a, b, light].map((page) => page.goto(`${base}/p/${pad}`)));
  await a.getByText("● Live", { exact: true }).waitFor();
  await a.locator('.presence small[aria-label="2 tabs"]').waitFor();
  await a.locator(".presence > span").filter({ hasText: "Alex" }).waitFor();
  assert.equal(await a.locator(".presence > span").count(), 2);
  await b.locator(".code-pane .cm-line").nth(3).click();
  await b.keyboard.press("Home");
  await light.locator(".code-pane .cm-line").nth(2).click();
  await light.keyboard.press("Home");
  await a.waitForFunction(
    () =>
      document.querySelectorAll(".code-pane .cm-ySelectionCaret").length === 2,
  );
  await a.bringToFront();
  await a.screenshot({ path: "shots/presence-tabs-dark.png" });
  await b.reload();
  await b.getByText("● Live", { exact: true }).waitFor();
  await a.locator('.presence small[aria-label="2 tabs"]').waitFor();
  assert.equal(await a.locator(".presence > span").count(), 2);
  await b.close();
  await a.waitForFunction(
    () =>
      document.querySelectorAll(".presence > span").length === 2 &&
      !document.querySelector(".presence small"),
  );
  console.log(
    "PASS presence: two tabs share one identity/chip with ×2, another user stays separate, both remote cursors render; reload preserves identity and closing a tab updates count",
  );
  const second = await contexts[0].newPage();
  await second.goto(`${base}/p/${pad}`);
  await second.getByText("● Live", { exact: true }).waitFor();
  assert.equal(
    await a.locator('select[aria-label="Language"] option').count(),
    8,
  );
  await a.getByLabel("Language", { exact: true }).selectOption("go");
  await a.getByText("main.go", { exact: true }).waitFor();
  await a.locator("button.run").click();
  await a.locator(".output pre").filter({ hasText: "Hello, world!" }).waitFor();
  await a.bringToFront();
  await a.screenshot({ path: "shots/pad-go-dark.png" });
  console.log(
    "PASS Go browser: versioned dropdown, main.go starter runs in Docker and shared output is visible",
  );
  await a.getByLabel("Language", { exact: true }).selectOption("html");
  await Promise.all(
    [a, second, light].map((page) =>
      page.locator('iframe[title="HTML preview"]').waitFor(),
    ),
  );
  assert.equal(
    await a.locator("iframe").getAttribute("sandbox"),
    "allow-scripts allow-modals",
  );
  assert.equal(
    await a.getByRole("button", { name: "Stdin", exact: true }).count(),
    0,
  );
  assert.equal(await a.locator(".tabs button").count(), 1);
  assert.equal(await a.getByRole("button", { name: /^Output/ }).count(), 0);
  assert.equal(await a.locator(".output").count(), 0);
  await a
    .frameLocator("iframe")
    .getByRole("button", { name: "Say hello" })
    .click();
  await a
    .locator(".console-lines")
    .getByText("Hello from the button!", { exact: true })
    .waitFor();
  await second
    .frameLocator("iframe")
    .getByRole("heading", { name: "Hello, web!" })
    .waitFor();
  await a.bringToFront();
  await a.screenshot({ path: "shots/pad-html-dark.png" });
  await light
    .locator(".console-lines")
    .getByText("Page ready", { exact: true })
    .waitFor();
  await light.bringToFront();
  await light.screenshot({ path: "shots/pad-html-light.png" });
  const result = await fetch(`${base}/api/run`, {
    method: "POST",
    body: JSON.stringify({ padId: pad, by: "Ryan" }),
  });
  assert.equal(result.status, 400);
  assert.match((await result.json()).error, /HTML uses the live preview/);
  await a.locator("button.run").click();
  await a
    .frameLocator("iframe")
    .getByRole("heading", { name: "Hello, web!" })
    .waitFor();
  assert.equal(
    await a
      .locator(".console-lines")
      .getByText("Hello from the button!", { exact: true })
      .count(),
    0,
  );
  const html = doc.getText("html");
  doc.transact(() => {
    html.delete(0, html.length);
    html.insert(
      0,
      '<style>h1{color:rgb(12,34,56)}</style><h1>Shared HTML</h1><script>console.log("Shared script"); console.error("Teaching error");</script>',
    );
  });
  await Promise.all(
    [a, light].map((page) =>
      page
        .frameLocator("iframe")
        .getByRole("heading", { name: "Shared HTML" })
        .waitFor(),
    ),
  );
  assert.equal(
    await a
      .frameLocator("iframe")
      .locator("h1")
      .evaluate((node) => getComputedStyle(node).color),
    "rgb(12, 34, 56)",
  );
  console.log(
    "PASS HTML collaboration: two isolated browser clients render shared edits/styles/scripts; console stays local; Refresh resets scripts; server rejects HTML runs",
  );
  let sourceRequests = 0;
  await a.route("**/preview-forbidden", (route) => {
    sourceRequests++;
    return route.abort();
  });
  doc.transact(() => {
    html.delete(0, html.length);
    html.insert(
      0,
      `<h1>Security check</h1><img src="${base}/preview-forbidden"><script>
    try { parent.localStorage.getItem('rycruit.name'); console.error('parent read allowed'); } catch { console.log('Parent storage blocked'); }
    fetch('${base}/preview-forbidden').then(()=>console.error('fetch allowed')).catch(()=>console.log('Fetch blocked'));
    Promise.reject('Teaching rejection'); setTimeout(()=>{throw new Error('Teaching exception')},20);
  </script>`,
    );
  });
  for (const message of [
    "Parent storage blocked",
    "Fetch blocked",
    "Teaching rejection",
  ])
    await a
      .locator(".console-lines")
      .getByText(message, { exact: true })
      .waitFor();
  await a
    .locator(".console-lines")
    .getByText(/Teaching exception/)
    .waitFor();
  assert.equal(sourceRequests, 0);
  const blockedNavigation = a.waitForEvent("console", {
    predicate: (message) => message.text().includes("frame-src"),
  });
  await a
    .frameLocator("iframe")
    .locator("h1")
    .evaluate((_, url) => {
      location.href = url;
    }, `${base}/preview-forbidden`);
  await blockedNavigation;
  assert.equal(sourceRequests, 0);
  const before = await a.locator(".console-lines pre").count();
  await a.evaluate(() =>
    window.postMessage(
      { type: "rycruit-console", level: "log", text: "forged", token: "fake" },
      "*",
    ),
  );
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(await a.locator(".console-lines pre").count(), before);
  console.log(
    "PASS HTML isolation: exact sandbox attributes, no parent storage access, CSP blocks same-server image/fetch/navigation, errors/rejections captured, forged parent messages ignored",
  );
  doc.transact(() => {
    html.delete(0, html.length);
  });
  await until(() => doc.getText("html").length === 0);
  await a.frameLocator("iframe").locator("h1").waitFor({ state: "detached" });
  assert.equal(await a.frameLocator("iframe").locator("h1").count(), 0);
  console.log(
    "PASS HTML empty source: preview clears without retaining the previous document",
  );
  await a.getByLabel("Language", { exact: true }).selectOption("python");
  assert.equal(
    await a.getByRole("button", { name: "Preview", exact: true }).count(),
    0,
  );
  await a.getByRole("button", { name: "Stdin", exact: true }).waitFor();
  await a.getByRole("button", { name: /^Output/ }).waitFor();
  await a.locator(".output pre").filter({ hasText: "Hello, world!" }).waitFor();
  assert.equal(await a.locator(".output article").count(), 1);
  console.log(
    "PASS language switching: HTML shows only Preview/console; runnable mode restores Output/Stdin with the original Go history intact",
  );
  const { starters } = await import("../server/store.js");
  doc.transact(() => {
    html.insert(0, starters.html);
    doc.getMap("meta").set("language", "html");
  });
  await a
    .frameLocator("iframe")
    .getByRole("heading", { name: "Hello, web!" })
    .waitFor();
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: "light",
  });
  await mobile.addInitScript(() => {
    if (window === window.top) localStorage.setItem("rycruit.name", "Sam");
  });
  const phone = await mobile.newPage();
  await phone.goto(`${base}/p/${pad}`);
  await phone
    .frameLocator("iframe")
    .getByRole("heading", { name: "Hello, web!" })
    .waitFor();
  assert.equal(
    await phone.locator("select option:checked").textContent(),
    "HTML",
  );
  for (const width of [320, 390]) {
    await phone.setViewportSize({ width, height: 844 });
    for (const lang of [
      "python",
      "cpp",
      "java",
      "javascript",
      "typescript",
      "go",
      "ruby",
      "html",
    ]) {
      await phone.getByLabel("Language", { exact: true }).selectOption(lang);
      assert(
        await phone.locator("select").evaluate((select) => {
          const style = getComputedStyle(select),
            canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          context.font = style.font;
          return (
            context.measureText(select.selectedOptions[0].text).width <=
            select.clientWidth -
              parseFloat(style.paddingLeft) -
              parseFloat(style.paddingRight) -
              18
          );
        }),
        `${lang} mobile label fits`,
      );
      assert(
        await phone.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    }
  }
  await phone
    .frameLocator("iframe")
    .getByRole("heading", { name: "Hello, web!" })
    .waitFor();
  await phone.bringToFront();
  await phone.screenshot({
    path: "shots/pad-html-mobile-light.png",
    fullPage: true,
  });
  assert(
    await phone.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  if (process.env.HEADED === "true") {
    await a.bringToFront();
    await a.getByLabel("Language", { exact: true }).focus();
    await a.keyboard.press("Space");
    console.log(
      "READY native language dropdown screenshot; press Enter to finish",
    );
    await new Promise((resolve) => process.stdin.once("data", resolve));
    process.stdin.pause();
  }
  console.log(
    "PASS HTML mobile: all eight short labels fit at 320px/390px without overflow; light preview and console captured at 390x844",
  );
} catch (error) {
  console.error(error);
  const page = browser.contexts()[0]?.pages()[0];
  if (page) {
    console.error(
      "HTML test frame diagnostics",
      await page
        .locator("iframe")
        .getAttribute("srcdoc", { timeout: 1000 })
        .catch(() => "no iframe"),
    );
    for (const frame of page.frames().slice(1))
      console.error(
        "HTML frame body",
        await frame
          .locator("body")
          .innerHTML()
          .catch(() => "no body"),
      );
    await page
      .screenshot({ path: "shots/html-test-failure.png", timeout: 5000 })
      .catch(() => {});
  }
  throw error;
} finally {
  provider?.destroy();
  doc.destroy();
  await browser.close();
  await stopServer(server);
}
