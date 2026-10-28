import { spawn } from "node:child_process";
import { mkdtemp, mkdir, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const sandboxImage = process.env.SANDBOX_IMAGE || "rycruit-sandbox";
let status = "idle";
let initialization;
function docker(args, progress = false) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
    let error = "";
    child.stdout.on("data", (chunk) => {
      if (progress) process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      error += chunk;
      if (progress) process.stderr.write(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(error || `Docker exited ${code}`)),
    );
  });
}
export function sandboxUnavailable() {
  if (status === "checking" || status === "building")
    return "Sandbox image is building, try again in a minute.";
  if (status === "failed")
    return "Sandbox image is unavailable. Check the server's Docker build logs and restart RyCruit.";
  return null;
}
export function initializeSandbox() {
  if (initialization) return initialization;
  status = "checking";
  initialization = (async () => {
    let directory;
    try {
      try {
        await docker(["image", "inspect", sandboxImage]);
      } catch (error) {
        if (!/no such image|not found/i.test(error.message)) throw error;
        status = "building";
        console.log(
          `Sandbox image ${sandboxImage} is missing; building it now.`,
        );
        directory = await mkdtemp(join(tmpdir(), "rycruit-sandbox-"));
        await mkdir(join(directory, "server"));
        await copyFile(
          new URL("../Dockerfile.sandbox", import.meta.url),
          join(directory, "Dockerfile.sandbox"),
        );
        await copyFile(
          new URL("./sandbox.py", import.meta.url),
          join(directory, "server/sandbox.py"),
        );
        await docker(
          [
            "build",
            "-f",
            join(directory, "Dockerfile.sandbox"),
            "-t",
            sandboxImage,
            directory,
          ],
          true,
        );
      }
      status = "ready";
      console.log(`Sandbox image ${sandboxImage} is ready.`);
      return true;
    } catch (error) {
      status = "failed";
      console.error(`Sandbox initialization failed: ${error.message}`);
      return false;
    } finally {
      if (directory) await rm(directory, { recursive: true, force: true });
    }
  })();
  return initialization;
}
