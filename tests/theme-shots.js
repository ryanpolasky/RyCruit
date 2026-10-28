import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { mkdir, readFile } from "node:fs/promises";
import { globSync } from "node:fs";
import { createPad } from "./helpers.js";

const chrome = globSync("/opt/.devin/chrome/chrome/*/chrome-linux64/chrome")[0];
const browser = await chromium.launch({
  executablePath: chrome,
  args: ["--headless=new", "--no-sandbox"],
});
const base = process.env.BASE_URL || "http://localhost:5173";
const shots = new URL("../shots/", import.meta.url);
await mkdir(shots, { recursive: true });
const code = `import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;

public class Main {
    static int[] twoSum(int[] nums, int target) {
        Map<Integer, Integer> seen = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            int complement = target - nums[i];
            if (seen.containsKey(complement)) {
                return new int[] { seen.get(complement), i };
            }
            seen.put(nums[i], i);
        }
        return new int[] {};
    }

    public static void main(String[] args) {
        int[] nums = { 2, 7, 11, 15 };
        System.out.println("Two sum / target = 9");
        System.out.println("Input: " + Arrays.toString(nums));
        System.out.println("Indices: " + Arrays.toString(twoSum(nums, 9)));
    }
}`;
const contexts = await Promise.all(
  ["Ryan", "Alex"].map(async (name, i) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      colorScheme: i === 0 ? "dark" : "light",
    });
    await context.addInitScript(
      (name) => localStorage.setItem("rycruit.name", name),
      name,
    );
    return context;
  }),
);
const [a, b] = await Promise.all(contexts.map((context) => context.newPage()));
const errors = [];
for (const page of [a, b])
  page.on("pageerror", (error) => errors.push(error.message));
const pad = await createPad(base);
try {
  await Promise.all([a.goto(`${base}/p/${pad}`), b.goto(`${base}/p/${pad}`)]);
  await a.getByText("● Live", { exact: true }).waitFor();
  assert.equal(await a.locator("html").getAttribute("data-theme"), "dark");
  assert.equal(await b.locator("html").getAttribute("data-theme"), "light");
  console.log(
    "PASS theme defaults: independent browsers follow dark/light system preferences",
  );
  await a.getByLabel("Language").selectOption("java");
  await b.waitForFunction(
    () => document.querySelector("select").value === "java",
  );
  await a.locator(".code-pane .cm-content").click();
  await a.keyboard.press("Control+a");
  await a.keyboard.insertText(code);
  await b
    .getByText("int complement = target - nums[i];", { exact: false })
    .waitFor();
  await a.locator("button.run").click();
  await a.getByText("Completed", { exact: true }).waitFor();
  await a.getByText("Indices: [0, 1]", { exact: false }).waitFor();
  async function showCursor() {
    await b.locator(".code-pane .cm-line").nth(5).click();
    await b.keyboard.press("Home");
    await b.keyboard.press("ArrowRight");
    const caret = a.locator(".cm-ySelectionCaret").first();
    await caret.waitFor();
    await caret.hover({ force: true });
    await a.waitForFunction(() => {
      const info = document.querySelector(".cm-ySelectionInfo");
      return info && getComputedStyle(info).opacity === "1";
    });
  }
  for (const theme of ["dark", "light"]) {
    if (theme === "light")
      await a.getByRole("button", { name: "Switch to light theme" }).click();
    await a.evaluate(() => document.fonts.ready);
    await showCursor();
    assert.equal(await a.locator(".wordmark").textContent(), "RyCruit");
    assert.equal(await a.locator("select").inputValue(), "java");
    assert.equal(await a.locator("html").getAttribute("data-theme"), theme);
    assert.equal(
      await a.evaluate(() => localStorage.getItem("rycruit.theme")),
      theme === "dark" ? null : theme,
    );
    await a.screenshot({
      path: new URL(`islands-${theme}.png`, shots).pathname,
    });
    console.log(
      `PASS ${theme}: Java, two peers, real remote cursor, completed run captured at 1440x900`,
    );
  }
  assert.equal(
    await b.evaluate(() => localStorage.getItem("rycruit.theme")),
    null,
  );
  await a.reload();
  assert.equal(await a.locator("html").getAttribute("data-theme"), "light");
  console.log(
    "PASS theme toggle: saved across reload, never changes the other browser's preference",
  );
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await a.getByRole("button", { name: "Switch to dark theme" }).click();
    await a.setViewportSize({ width: 390, height: 844 });
    await a.getByText("Completed", { exact: true }).waitFor();
    await a.evaluate(() => document.fonts.ready);
    await showCursor();
    assert.equal(
      await a.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    const boxes = await a
      .locator(".code-pane,.side-pane,header,footer")
      .evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        }),
      );
    assert(
      boxes.every(
        (r) => r.left >= 0 && r.right <= 390 && r.top >= 0 && r.bottom <= 844,
      ),
    );
    await a.screenshot({
      path: new URL(`mobile-${theme}.png`, shots).pathname,
    });
    console.log(
      `PASS mobile ${theme}: 390x844, stacked panes, all panels within viewport, no horizontal page overflow`,
    );
  }
  const invalid = await browser.newContext({ colorScheme: "light" });
  await invalid.addInitScript(() =>
    localStorage.setItem("rycruit.theme", "invalid"),
  );
  const landing = await invalid.newPage();
  await landing.goto(base);
  assert.equal(
    await landing.locator("html").getAttribute("data-theme"),
    "light",
  );
  console.log(
    "PASS invalid saved theme: falls back to system preference on landing",
  );
  await invalid.close();
  const images = await Promise.all(
    ["dark", "light"].map(async (theme) =>
      (await readFile(new URL(`islands-${theme}.png`, shots))).toString(
        "base64",
      ),
    ),
  );
  const sheet = await contexts[0].newPage();
  await sheet.setViewportSize({ width: 2160, height: 731 });
  await sheet.setContent(
    `<html><head><style>body{margin:0;background:#e9eaee;color:#26282c;font:16px system-ui}main{display:grid;grid-template-columns:repeat(2,1080px)}h2{font-size:18px;font-weight:600;height:56px;box-sizing:border-box;margin:0;padding:16px 20px}img{display:block;width:1080px;height:675px}</style></head><body><main>${["Dark", "Light"].map((label, i) => `<section><h2>${label}</h2><img src="data:image/png;base64,${images[i]}" /></section>`).join("")}</main></body></html>`,
  );
  await sheet
    .locator("img")
    .evaluateAll((images) => Promise.all(images.map((img) => img.decode())));
  await sheet.screenshot({
    path: new URL("islands-sheet.png", shots).pathname,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS screenshot sheet: shots/islands-sheet.png; mobile: shots/mobile-dark.png, shots/mobile-light.png; no browser errors",
  );
} finally {
  await browser.close();
}
