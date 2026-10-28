import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const image = `rycruit-sandbox-autobuild-${process.pid}`;
process.env.SANDBOX_IMAGE = image;
const { initializeSandbox, sandboxUnavailable, sandboxSourceHash } =
  await import("../server/sandbox-image.js");
const { runCode } = await import("../server/runner.js");
assert.throws(() =>
  execFileSync("docker", ["image", "inspect", image], { stdio: "pipe" }),
);
try {
  const building = initializeSandbox();
  assert.match(
    sandboxUnavailable(),
    /image is building, try again in a minute/,
  );
  await assert.rejects(
    runCode({ lang: "python", code: "print('hello')" }, "docker"),
    /image is building/,
  );
  assert.equal(await building, true);
  assert.equal(sandboxUnavailable(), null);
  execFileSync("docker", ["image", "inspect", image], { stdio: "pipe" });
  assert.equal(
    execFileSync(
      "docker",
      [
        "image",
        "inspect",
        "--format",
        '{{ index .Config.Labels "dev.rycruit.sandbox-hash" }}',
        image,
      ],
      { encoding: "utf8" },
    ).trim(),
    await sandboxSourceHash(),
  );
  const recheck = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "import {initializeSandbox} from './server/sandbox-image.js'; if(!await initializeSandbox())process.exitCode=1",
    ],
    { encoding: "utf8" },
  );
  assert(recheck.includes("is ready"));
  assert(!recheck.includes("building it now"));
  console.log(
    "PASS Docker source hash: built image is labeled; next startup reuses current image without rebuilding",
  );
  const result = await runCode(
    { lang: "python", code: "print('automatic build works')" },
    "docker",
  );
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, "automatic build works\n");
  console.log(
    "PASS Docker auto-build: absent isolated image built from bundled files; in-progress runs get readable error; built image runs Python",
  );
  execFileSync("docker", ["image", "rm", image], { stdio: "pipe" });
  await assert.rejects(
    runCode({ lang: "python", code: "print('hello')" }, "docker"),
    /Sandbox image is missing\. Restart RyCruit/,
  );
  console.log(
    "PASS Docker missing-image fallback: deleted image returns readable restart/build instructions instead of pull-access error",
  );
} finally {
  try {
    execFileSync("docker", ["image", "rm", image], { stdio: "pipe" });
  } catch {}
}
