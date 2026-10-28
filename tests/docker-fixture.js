#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const directory = process.env.TEST_DOCKER_DIRECTORY;
const args = process.argv.slice(2);
if (args[0] === "image" && args[1] === "inspect") {
  if (existsSync(join(directory, "ready"))) {
    console.log(readFileSync(join(directory, "ready"), "utf8"));
    process.exit(0);
  }
  console.error("Error response from daemon: No such image: rycruit-sandbox");
  process.exit(1);
}
if (args[0] === "build") {
  const context = args.at(-1);
  writeFileSync(
    join(directory, "build.json"),
    JSON.stringify({
      args,
      dockerfile: readFileSync(join(context, "Dockerfile.sandbox"), "utf8"),
      sandbox: readFileSync(join(context, "server/sandbox.py"), "utf8"),
    }),
  );
  console.log("Test Docker build progress");
  const timeout = setTimeout(() => process.exit(2), 30000);
  const timer = setInterval(() => {
    if (!existsSync(join(directory, "release"))) return;
    clearTimeout(timeout);
    clearInterval(timer);
    if (process.env.TEST_DOCKER_FAILURE === "true") {
      console.error("Test Docker build failed: registry unavailable");
      process.exit(1);
    }
    writeFileSync(
      join(directory, "ready"),
      args.find((arg) => arg.startsWith("RYCRUIT_SANDBOX_HASH=")).split("=")[1],
    );
    process.exit(0);
  }, 20);
} else {
  console.error(
    "Unable to find image 'rycruit-sandbox:latest' locally: pull access denied",
  );
  process.exit(125);
}
