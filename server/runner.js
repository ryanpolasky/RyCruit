import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { sandboxImage, sandboxUnavailable } from "./sandbox-image.js";

export function runCode(input, mode = process.env.RUNNER || "docker") {
  return new Promise((resolve, reject) => {
    const name = `rycruit-${randomUUID()}`;
    const docker = mode === "docker";
    if (docker && sandboxUnavailable())
      return reject(new Error(sandboxUnavailable()));
    const args = docker
      ? [
          "run",
          "--rm",
          "--name",
          name,
          "--network",
          "none",
          "--memory",
          "256m",
          "--pids-limit",
          "64",
          "--cpus",
          "1",
          "--read-only",
          "--tmpfs",
          "/tmp:exec,size=64m",
          "--user",
          "65534",
          "-i",
          sandboxImage,
        ]
      : [fileURLToPath(new URL("./sandbox.py", import.meta.url))];
    const child = spawn(docker ? "docker" : "python3", args, {
      detached: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "",
      error = "";
    const timer = setTimeout(() => {
      if (docker) spawn("docker", ["rm", "-f", name]);
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {}
    }, 25000);
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      error += chunk;
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", () => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(output));
      } catch {
        reject(
          new Error(
            /unable to find image|no such image|pull access denied|manifest unknown/i.test(
              error,
            )
              ? "Sandbox image is missing. Restart RyCruit to build it automatically."
              : error || "Runner terminated",
          ),
        );
      }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify(input));
  });
}
