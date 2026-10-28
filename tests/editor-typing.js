import assert from "node:assert/strict";
import { globSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
import { createPad, startServer, stopServer } from "./helpers.js";

const base = "http://127.0.0.1:3106";
const server = await startServer(3106, { ALLOW_UNAUTHENTICATED: "true" });
const shots = new URL("../shots/", import.meta.url);
await mkdir(shots, { recursive: true });
let browser;
try {
  browser = await chromium.launch({
    executablePath: globSync(
      "/opt/.devin/chrome/chrome/*/chrome-linux64/chrome",
    )[0],
    args: ["--headless=new", "--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "dark",
  });
  await context.addInitScript(() =>
    localStorage.setItem("rycruit.name", "Ryan"),
  );
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const pad = await createPad(base);
  await page.goto(`${base}/p/${pad}`);
  await page.getByText("● Live", { exact: true }).waitFor();
  await page.evaluate(() => {
    window.autocompleteSeen = false;
    new MutationObserver(() => {
      if (document.querySelector(".cm-tooltip-autocomplete"))
        window.autocompleteSeen = true;
    }).observe(document.body, { childList: true, subtree: true });
  });
  const editor = page.locator(".code-pane .cm-content");
  async function clear() {
    await editor.click();
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Backspace");
  }
  for (const language of ["python", "java", "cpp"]) {
    await page.getByLabel("Language").selectOption(language);
    for (const prefix of ["pri", "def"]) {
      await clear();
      await page.keyboard.type(prefix, { delay: 80 });
      await page.waitForTimeout(600);
      assert.equal(await page.locator(".cm-tooltip-autocomplete").count(), 0);
      assert.equal(await editor.innerText(), prefix);
      await page.screenshot({
        path: new URL(`editor-${language}-${prefix}.png`, shots).pathname,
      });
      await page.keyboard.press("Control+Space");
      await page.waitForTimeout(600);
      assert.equal(await page.locator(".cm-tooltip-autocomplete").count(), 0);
    }
    await clear();
    await page.keyboard.type("(");
    assert.equal(await editor.innerText(), "()");
    await page.locator(".cm-matchingBracket").first().waitFor();
    await page.screenshot({
      path: new URL(`editor-${language}-brackets.png`, shots).pathname,
    });
    if (language === "python") {
      await clear();
      await page.keyboard.type("def interview():");
      await page.keyboard.press("Enter");
      await page.keyboard.type("pass");
      assert.match(await editor.innerText(), /def interview\(\):\n +pass/);
    }
    console.log(
      `PASS ${language}: typed pri/def and Ctrl-Space show no completion popup; ( auto-closes and brackets match`,
    );
  }
  assert.equal(await page.evaluate(() => window.autocompleteSeen), false);
  assert.deepEqual(errors, []);
  console.log(
    "PASS editor: Python auto-indent retained; no transient autocomplete tooltip or browser errors",
  );
} finally {
  if (browser) await browser.close();
  await stopServer(server);
}
