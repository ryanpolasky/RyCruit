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
        ({ name, id }) => {
          if (window === window.top) {
            localStorage.setItem("rycruit.name", name);
            localStorage.setItem("rycruit.userId", id);
          }
        },
        theme === "dark"
          ? { name: "Ryan", id: "selection-test-ryan" }
          : { name: "Alex", id: "selection-test-alex" },
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
  async function assertSelection(page, color) {
    const selection = page.locator(".code-pane .cm-selectionBackground");
    await selection.first().waitFor();
    const details = await selection.first().evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        color: getComputedStyle(element).backgroundColor,
        width: rect.width,
        height: rect.height,
      };
    });
    assert.equal(details.color, color);
    assert(details.width > 0);
    assert(details.height > 0);
    assert.equal(
      await page
        .locator(".code-pane .cm-activeLine")
        .evaluate((element) => getComputedStyle(element).backgroundColor),
      "rgba(0, 0, 0, 0)",
    );
  }
  for (const [page, theme, color] of [
    [a, "dark", "rgb(33, 66, 131)"],
    [light, "light", "rgb(166, 210, 255)"],
  ]) {
    await page.bringToFront();
    const line = page.locator(".code-pane .cm-line").first();
    await line.dblclick({ position: { x: 15, y: 10 } });
    await assertSelection(page, color);
    await line.click();
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+ArrowRight");
    await assertSelection(page, color);
    const box = await line.boundingBox();
    assert(box);
    await page.mouse.move(box.x + 7, box.y + box.height - 10);
    await page.mouse.down();
    await page.mouse.move(box.x + 45, box.y + box.height - 10);
    await page.mouse.up();
    await assertSelection(page, color);
    await page.screenshot({ path: `shots/selection-single-${theme}.png` });
  }
  await b.locator(".code-pane .cm-line").first().click();
  await b.keyboard.press("Home");
  await light.locator(".code-pane .cm-line").nth(2).click();
  await light.keyboard.press("Home");
  await light.keyboard.press("Shift+ArrowRight");
  await assertSelection(light, "rgb(166, 210, 255)");
  await a.waitForFunction(
    () =>
      document.querySelectorAll(".code-pane .cm-ySelectionCaret").length === 2,
  );
  for (const page of [a, light]) {
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".code-pane .cm-ySelectionInfo")].every(
        (element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          const scroller = element
            .closest(".cm-scroller")
            .getBoundingClientRect();
          const caret = element.parentElement.getBoundingClientRect();
          return (
            style.opacity === "1" &&
            rect.width > 0 &&
            rect.height > 0 &&
            rect.left >= scroller.left &&
            rect.top >= scroller.top &&
            rect.bottom <= caret.top + 1
          );
        },
      ),
    );
  }
  await a.bringToFront();
  assert(
    await a
      .locator(".cm-ySelection")
      .evaluateAll((elements) =>
        elements.some(
          (element) =>
            element.getBoundingClientRect().width > 0 &&
            getComputedStyle(element).backgroundColor !== "rgba(0, 0, 0, 0)",
        ),
      ),
  );
  await a.screenshot({ path: "shots/cursor-names-dark.png" });
  await light.bringToFront();
  await light.screenshot({ path: "shots/cursor-names-light.png" });
  await a.bringToFront();
  await a.screenshot({ path: "shots/presence-tabs-dark.png" });
  console.log(
    "PASS editor selections: drag, shift-arrow and double-click single-line selections render in both themes; remote selections and cursor labels are visible",
  );
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
  const html = doc.getText("html");
  for (const burst of ["first", "second"]) {
    doc.transact(() => {
      html.delete(0, html.length);
      html.insert(
        0,
        `<script>for (let i = 0; i < 45; i++) console.log('${burst} ' + i)</script>`,
      );
    });
    await a
      .locator(".console-lines")
      .getByText(`${burst} 44`, { exact: true })
      .waitFor();
    assert(
      await a
        .locator(".console-lines")
        .evaluate(
          (element) =>
            element.scrollHeight > element.clientHeight &&
            element.scrollTop + element.clientHeight >=
              element.scrollHeight - 1,
        ),
    );
  }
  console.log("PASS HTML console: each burst stays pinned to the newest line");
  const { starters } = await import("../server/store.js");
  doc.transact(() => {
    html.delete(0, html.length);
    html.insert(0, starters.html);
  });
  await a
    .frameLocator("iframe")
    .getByRole("heading", { name: "Hello, web!" })
    .waitFor();
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
  for (const burst of [30, 12]) {
    await a.locator(".output").evaluate((element) => {
      element.scrollTop = 0;
    });
    const results = doc.getArray("results");
    doc.transact(() => {
      results.push(
        Array.from({ length: burst }, (_, index) => ({
          at: Date.now() + index,
          by: "Ryan",
          compileError: false,
          exitCode: 0,
          lang: "python",
          stderr: "",
          stdout: `${"output line ".repeat(12)}${burst}:${index}\n`,
          timeMs: 1,
        })),
      );
    });
    await a
      .locator(".output article")
      .nth(Math.min(19, burst - 1))
      .waitFor();
    await a
      .locator(".output article")
      .last()
      .getByText(new RegExp(`${burst}:${burst - 1}`))
      .waitFor();
    assert(
      await a
        .locator(".output")
        .evaluate(
          (element) =>
            element.scrollHeight > element.clientHeight &&
            element.scrollTop + element.clientHeight >=
              element.scrollHeight - 1,
        ),
    );
    await a.getByRole("button", { name: "Stdin", exact: true }).click();
    await a.getByRole("button", { name: /^Output/ }).click();
    assert(
      await a
        .locator(".output")
        .evaluate(
          (element) =>
            element.scrollTop + element.clientHeight >=
            element.scrollHeight - 1,
        ),
    );
  }
  console.log(
    "PASS runnable output: each result burst stays pinned to the newest run",
  );
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
              parseFloat(style.paddingRight)
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
