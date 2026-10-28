import assert from "node:assert/strict";
import { globSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
import { runCode } from "../server/runner.js";
import { startServer, stopServer } from "./helpers.js";

const server = await startServer(3113);
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
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install();
  await page.goto("http://127.0.0.1:3113");
  await page.evaluate(() => document.fonts.ready);
  const active = page.locator('.preview-slide[data-active="true"]');
  let bounds;
  for (const [language, filename] of [
    ["java", "Main.java"],
    ["cpp", "main.cpp"],
    ["python", "main.py"],
  ]) {
    await active.getByText(filename, { exact: true }).waitFor();
    await page.waitForTimeout(300);
    const box = await page.locator(".pad-preview").boundingBox();
    if (bounds) assert.deepEqual(box, bounds);
    else bounds = box;
    assert.equal(await active.locator(".demo-cursor").count(), 2);
    const code = (await active.locator(".cm-line").allTextContents())
      .map((line) => line.replace(/Ryan|Alex/g, ""))
      .join("\n");
    const result = await runCode({ lang: language, code }, "local");
    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(result.stdout.trim(), await active.locator("pre").innerText());
    await page.screenshot({
      path: new URL(`landing-${language}-dark.png`, shots).pathname,
    });
    await page.clock.fastForward(6000);
  }
  await active.getByText("Main.java", { exact: true }).waitFor();
  assert.equal(await page.locator(".landing-footer a").count(), 0);
  assert.match(
    await page.locator(".landing-footer").innerText(),
    /deleted 24 hours after everyone leaves/,
  );
  assert.equal(
    await page.getByRole("link", { name: "By Ryan Polasky" }).count(),
    1,
  );
  console.log(
    "PASS landing cycle: Java/C++/Python rotate every 6s; actual two-sum output matches; two cursors, correct filenames, fixed desktop bounds and no footer link",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.fastForward(18000);
  await active.getByText("Main.java", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Cycle example language" }).click();
  await active.getByText("main.cpp", { exact: true }).waitFor();
  assert.equal(
    await active.evaluate((el) => getComputedStyle(el).transitionDuration),
    "0s",
  );
  console.log(
    "PASS reduced motion: no auto-cycle or fade; language button still cycles manually",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.reload();
  let mobileBounds;
  for (const filename of ["Main.java", "main.cpp", "main.py"]) {
    await active.getByText(filename, { exact: true }).waitFor();
    const box = await page.locator(".pad-preview").boundingBox();
    if (mobileBounds) assert.deepEqual(box, mobileBounds);
    else mobileBounds = box;
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    if (filename === "main.py")
      await page.screenshot({
        path: new URL("landing-mobile-light.png", shots).pathname,
        fullPage: true,
      });
    else
      await page
        .getByRole("button", { name: "Cycle example language" })
        .click();
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS landing mobile light: fixed bounds for all languages, no horizontal overflow or browser errors",
  );
  console.log(
    "PASS screenshots: shots/landing-java-dark.png, shots/landing-cpp-dark.png, shots/landing-python-dark.png, shots/landing-mobile-light.png",
  );
} finally {
  if (browser) await browser.close();
  await stopServer(server);
}
