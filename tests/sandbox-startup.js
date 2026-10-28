import assert from "node:assert/strict";
import { globSync, existsSync } from "node:fs";
import { mkdir, copyFile, chmod, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { startServer, stopServer, createPad } from "./helpers.js";

const directory = resolve(`data/sandbox-startup-${Date.now()}`);
await mkdir(`${directory}/bin`, { recursive: true });
await copyFile(
  new URL("./docker-fixture.js", import.meta.url),
  `${directory}/bin/docker`,
);
await chmod(`${directory}/bin/docker`, 0o755);
async function until(predicate) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > 10000)
      throw new Error("Timed out waiting for sandbox startup");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
const browser = await chromium.launch({
  executablePath: globSync(
    "/opt/.devin/chrome/chrome/*/chrome-linux64/chrome",
  )[0],
  args: ["--headless=new", "--no-sandbox"],
});
try {
  for (const failed of [false, true]) {
    const state = `${directory}/${failed ? "failure" : "success"}`;
    await mkdir(state);
    const server = await startServer(3115, {
      RUNNER: "docker",
      ALLOW_UNAUTHENTICATED: "true",
      PATH: `${directory}/bin:${process.env.PATH}`,
      TEST_DOCKER_DIRECTORY: state,
      TEST_DOCKER_FAILURE: String(failed),
    });
    let logs = "";
    server.stdout.on("data", (chunk) => {
      logs += chunk;
    });
    server.stderr.on("data", (chunk) => {
      logs += chunk;
    });
    const context = await browser.newContext();
    try {
      await until(() => existsSync(`${state}/build.json`));
      const build = JSON.parse(await readFile(`${state}/build.json`, "utf8"));
      assert.equal(
        build.dockerfile,
        await readFile("Dockerfile.sandbox", "utf8"),
      );
      assert.equal(build.sandbox, await readFile("server/sandbox.py", "utf8"));
      assert(build.args.includes("rycruit-sandbox"));
      const base = "http://127.0.0.1:3115";
      const pad = await createPad(base);
      const response = await fetch(`${base}/api/run`, {
        method: "POST",
        body: JSON.stringify({ padId: pad, by: "Ryan" }),
      });
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), {
        error: "Sandbox image is building, try again in a minute.",
      });
      await context.addInitScript(() =>
        localStorage.setItem("rycruit.name", "Ryan"),
      );
      const page = await context.newPage();
      await page.goto(`${base}/p/${pad}`);
      await page.getByText("● Live", { exact: true }).waitFor();
      await page.locator("button.run").click();
      await page
        .getByText("Sandbox image is building, try again in a minute.", {
          exact: true,
        })
        .waitFor();
      await writeFile(`${state}/release`, "release");
      if (failed) {
        await until(() => logs.includes("Sandbox initialization failed"));
        await page.locator("button.run").click();
        await page
          .getByText(
            "Sandbox image is unavailable. Check the server's Docker build logs and restart RyCruit.",
            { exact: true },
          )
          .waitFor();
        assert(logs.includes("registry unavailable"));
        console.log(
          "PASS controlled Docker fixture: startup build failure is logged; subsequent runs show readable unavailable message",
        );
      } else {
        await until(() =>
          logs.includes("Sandbox image rycruit-sandbox is ready"),
        );
        assert(logs.includes("Test Docker build progress"));
        await page.locator("button.run").click();
        await page
          .getByText(
            "Sandbox image is missing. Restart RyCruit to build it automatically.",
            { exact: true },
          )
          .waitFor();
        assert.equal(await page.getByText(/pull access denied/).count(), 0);
        console.log(
          "PASS controlled Docker fixture: startup builds exact bundled sources and logs progress; HTTP/UI block runs during build; missing-image runtime errors are readable",
        );
      }
    } finally {
      await writeFile(`${state}/release`, "release");
      await context.close();
      await stopServer(server);
    }
  }
} finally {
  await browser.close();
}
