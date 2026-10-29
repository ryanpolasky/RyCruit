import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, globSync, readFileSync } from "node:fs";
import { chromium } from "playwright-core";
import { startServer, stopServer, createPad } from "./helpers.js";

const phase = process.env.SELECT_PHASE === "before" ? "before" : "after";
let beforeCss;
if (phase === "before") {
  assert.equal(
    execFileSync("git", ["rev-parse", "--is-shallow-repository"], {
      encoding: "utf8",
    }).trim(),
    "false",
  );
  beforeCss = execFileSync("git", ["show", "HEAD:src/style.css"], {
    encoding: "utf8",
  });
}
const base = "http://127.0.0.1:3120";
const server = await startServer(3120, { ALLOW_UNAUTHENTICATED: "true" });
const browser = await chromium.launch({
  executablePath: globSync(
    "/opt/.devin/chrome/chrome/*/chrome-linux64/chrome",
  )[0],
  args: ["--no-sandbox"],
});
const cases = [
  ["desktop-dark", 1440, "dark"],
  ["desktop-light", 1440, "light"],
  ["mobile-dark", 390, "dark"],
  ["mobile-light", 390, "light"],
];
try {
  const pad = await createPad(base);
  for (const [name, width, theme] of cases) {
    const page = await browser.newPage({
      viewport: { width, height: 900 },
      colorScheme: theme,
    });
    await page.addInitScript(() =>
      localStorage.setItem("rycruit.name", "Ryan"),
    );
    if (beforeCss) {
      await page.route("**/*.css", async (route) => {
        const result = await route.fetch();
        const fonts =
          (await result.text()).match(/@font-face\s*\{[^}]+\}/g) ?? [];
        await route.fulfill({
          response: result,
          body: fonts.join("\n") + beforeCss,
        });
      });
    }
    await page.goto(`${base}/p/${pad}`);
    await page.getByText("● Live", { exact: true }).waitFor();
    await page.waitForFunction(() => !document.querySelector(".overlay"));
    await page.evaluate(() => document.fonts.ready);
    const select = page.getByLabel("Language", { exact: true });
    if (phase === "after") {
      for (const viewportWidth of width === 390 ? [320, 390] : [1440]) {
        await page.setViewportSize({ width: viewportWidth, height: 900 });
        for (const language of await select
          .locator("option")
          .evaluateAll((options) => options.map((option) => option.value))) {
          await select.selectOption(language);
          assert(
            await select.evaluate((element) => {
              const style = getComputedStyle(element);
              const context = document.createElement("canvas").getContext("2d");
              context.font = style.font;
              return (
                style.appearance === "none" &&
                parseFloat(style.paddingRight) === 28 &&
                parseFloat(style.paddingLeft) === 8 &&
                style.backgroundPosition === "right 8px 50%" &&
                context.measureText(element.selectedOptions[0].text).width <=
                  element.clientWidth -
                    parseFloat(style.paddingLeft) -
                    parseFloat(style.paddingRight)
              );
            }),
            `${theme} ${viewportWidth}px ${language}: text fits clear of inset arrow`,
          );
          assert(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          );
        }
      }
      console.log(
        `PASS ${name}: all eight labels fit; 8px left/inset, 28px reserved right padding; no overflow`,
      );
    } else {
      assert.equal(
        await select.evaluate(
          (element) => getComputedStyle(element).appearance,
        ),
        "auto",
      );
    }
    await select.selectOption("html");
    await select.evaluate((element) => element.blur());
    const box = await select.boundingBox();
    await page.screenshot({
      path: `shots/select-${phase}-${name}.png`,
      clip: {
        x: Math.max(0, box.x - 12),
        y: Math.max(0, box.y - 12),
        width: box.width + 24,
        height: box.height + 24,
      },
    });
    await page.close();
  }
  if (
    phase === "after" &&
    cases.every(([name]) => existsSync(`shots/select-before-${name}.png`))
  ) {
    const page = await browser.newPage({
      viewport: { width: 760, height: 650 },
    });
    const rows = cases.map(([name]) => {
      const images = ["before", "after"].map((state) => {
        const source = readFileSync(
          `shots/select-${state}-${name}.png`,
        ).toString("base64");
        return `<div><small>${state}</small><img src="data:image/png;base64,${source}"></div>`;
      });
      return `<section><h2>${name}</h2><article>${images.join("")}</article></section>`;
    });
    await page.setContent(
      `<style>body{margin:24px;background:#e9eaee;color:#212326;font:14px Arial}h2{font-size:14px;margin:0 0 8px}section{margin-bottom:24px}article{display:grid;grid-template-columns:1fr 1fr;gap:16px}small{display:block;margin-bottom:6px}img{display:block;max-width:100%}</style><h1>Language select inset</h1>${rows.join("")}`,
    );
    await page
      .locator("img")
      .evaluateAll((images) =>
        Promise.all(images.map((image) => image.decode())),
      );
    await page.screenshot({ path: "shots/select-compare.png", fullPage: true });
    console.log(
      "PASS screenshots: select-before/after-*.png and select-compare.png",
    );
  } else if (phase === "before") {
    console.log(
      "PASS before screenshots: current main native language select captured",
    );
  }
} finally {
  await browser.close();
  await stopServer(server);
}
