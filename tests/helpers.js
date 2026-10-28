import assert from "node:assert/strict";
import { spawn } from "node:child_process";

export async function startServer(port, env = {}) {
  const child = spawn(process.execPath, ["server/index.js"], {
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: `./data/access-tests-${port}-${Date.now()}`,
      RUNNER: "local",
      ALLOW_UNAUTHENTICATED: "false",
      CF_ACCESS_TEAM: "test-team",
      CF_ACCESS_AUD_ADMIN: "test-audience",
      CF_ACCESS_AUD_MEMBER: "member-audience",
      ADMIN_EMAILS: "ryan@example.com",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Server start timed out: ${output}`));
    }, 10000);
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.includes("listening")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited ${code}: ${output}`));
    });
  });
  return child;
}
export async function stopServer(child) {
  if (child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  await exited;
}
export async function createPad(base) {
  const headers = process.env.TEST_ACCESS_JWT
    ? { "Cf-Access-Jwt-Assertion": process.env.TEST_ACCESS_JWT }
    : {};
  const response = await fetch(`${base}/new`, { redirect: "manual", headers });
  assert.equal(
    response.status,
    303,
    "Creating test pads requires dev bypass or TEST_ACCESS_JWT",
  );
  const location = response.headers.get("location");
  assert.match(location, /^\/p\/[a-zA-Z0-9_-]{16,}$/);
  return location.slice(3);
}
