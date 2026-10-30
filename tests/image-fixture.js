import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function startImageFixture() {
  const directory = mkdtempSync(join(tmpdir(), "rycruit-images-"));
  const key = join(directory, "key.pem");
  const cert = join(directory, "cert.pem");
  let server;
  try {
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-days",
        "1",
        "-subj",
        "/CN=localhost",
        "-addext",
        "subjectAltName=IP:127.0.0.1",
        "-keyout",
        key,
        "-out",
        cert,
      ],
      { stdio: "ignore" },
    );
    const requests = new Set();
    server = createServer(
      { key: readFileSync(key), cert: readFileSync(cert) },
      (request, response) => {
        requests.add(request.url);
        response.writeHead(200, { "Content-Type": "image/svg+xml" });
        response.end(
          '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="#a6d2ff"/><circle cx="505" cy="80" r="36" fill="#ffe5a3"/><path d="M0 310 190 65 360 310Z" fill="#547183"/><path d="m127 146 63-81 57 82-54-22Z" fill="#f5f8fe"/><path d="m220 310 210-200 210 200Z" fill="#37576b"/><path d="m370 167 60-57 61 58-63-19Z" fill="#f5f8fe"/><path d="M0 285Q160 250 320 295T640 280V360H0Z" fill="#4e9d6c"/></svg>',
        );
      },
    );
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    return {
      url: `https://127.0.0.1:${server.address().port}`,
      requests,
      async close() {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
        rmSync(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    server?.close();
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}
