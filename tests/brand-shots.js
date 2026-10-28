import assert from "node:assert/strict";
import { globSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
import { startServer, stopServer } from "./helpers.js";
import { checkBrand } from "./brand-appearance.js";

const server = await startServer(3105, { ALLOW_UNAUTHENTICATED: "true" });
const base = "http://127.0.0.1:3105";
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
  const errors = [];
  for (const theme of ["dark", "light"]) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: theme,
    });
    await context.addInitScript(() =>
      localStorage.setItem("rycruit.name", "Ryan"),
    );
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base);
    await page.locator(".cm-content").first().waitFor();
    await checkBrand(page, theme);
    await page.screenshot({
      path: new URL(`brand-landing-${theme}.png`, shots).pathname,
    });
    await page.getByRole("link", { name: "New pad", exact: true }).click();
    await page.waitForURL(/\/p\/[a-zA-Z0-9_-]{16,}$/);
    await page.getByText("● Live", { exact: true }).waitFor();
    await page.getByLabel("Language").selectOption("java");
    await page.locator("button.run").click();
    await page.getByText("Completed", { exact: true }).waitFor();
    await checkBrand(page, theme);
    if (theme === "dark")
      await page.screenshot({
        path: new URL("brand-pad-dark.png", shots).pathname,
      });
    await page.setViewportSize({ width: 390, height: 844 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page
      .getByRole("button", {
        name: `Switch to ${theme === "dark" ? "light" : "dark"} theme`,
      })
      .click();
    await checkBrand(page, theme === "dark" ? "light" : "dark");
    await page.reload();
    assert.equal(
      await page.locator("html").getAttribute("data-theme"),
      theme === "dark" ? "light" : "dark",
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${base}/admin`);
    await page.getByRole("heading", { name: "People", exact: false }).waitFor();
    await checkBrand(page, theme === "dark" ? "light" : "dark");
    await context.close();
    console.log(
      `PASS Run green ${theme}: landing, pad/Run, admin, favicon, focus rings, text/button/hover contrast, saved theme and mobile bounds`,
    );
  }
  const page = await browser.newPage();
  await page.goto(base);
  assert.equal(await page.locator(".new-pad").getAttribute("href"), "/new");
  assert.equal(await page.locator(".wordmark").getAttribute("href"), "/");
  assert.equal(await page.locator("html").getAttribute("data-brand"), null);
  assert.deepEqual(errors, []);
  console.log(
    "PASS final brand: no brand selector or redirect query; no browser errors",
  );
  console.log(
    "PASS screenshots: shots/brand-landing-dark.png, shots/brand-landing-light.png, shots/brand-pad-dark.png",
  );
} finally {
  if (browser) await browser.close();
  await stopServer(server);
}
