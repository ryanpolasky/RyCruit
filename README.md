# RyCruit

A shared editor for mock coding interviews. Create a pad and send its link to your partner. Write and run code together, or build a web page live. Run output, stdin and the interview timer are shared.

Free to use. Approved accounts can create pads; host invites also work without signing in. Anyone with a pad link can edit and run code, so use it with people you trust.

One pnpm package. Node 24+ and pnpm 11 required.

## Develop

The project lives at `~/repos/rycruit`.

```
pnpm install
ALLOW_UNAUTHENTICATED=true pnpm server
pnpm dev
```

Open http://localhost:5173. Vite proxies HTTP and websocket traffic to port 3001. The server defaults to the Docker runner. Runnable languages are Python 3, C++20, Java 17, JavaScript (Node 18), TypeScript (esbuild 0.17 + Node), Go 1.19 and Ruby 3.1. TypeScript is transpiled offline, not type-checked. Go's build cache and work files live in the per-run 128MB tmpfs; module downloads are disabled. Compilation has 10 seconds, execution 5 seconds, with a 256MB container limit.

For trusted code only, `RUNNER=local pnpm server` uses the equivalent tools on PATH (`python3`, `g++`, `javac`, `java`, `node`, `esbuild`, `go`, `ruby`). Local mode is not a security boundary: code has the server user's filesystem and network access. It applies wall time, process-group cleanup, output and file-size limits. Java/Node use bounded heaps and Go uses `GOMEMLIMIT`; they cannot use a 256MB virtual-address-space limit. Only Docker enforces the total 256MB memory limit.

HTML runs locally in a debounced live preview, not the server runner. Inline CSS and scripts work; the iframe has an opaque origin, scripts/modals only, and a restrictive CSP blocking network resources, forms and nested frames. Each participant renders the shared source independently. Refresh resets scripts and the local console. Console logs/errors are limited to 100 messages per render and never shared or saved. The preview is for trusted teaching partners: an infinite browser script can still consume a tab's resources. Use inline or data-URL assets rather than remote links.

SQLite temporarily stores pad state (buffers, stdin, language, timer, last 20 results) and the pad registry in `data/rycruit.sqlite`, along with invites and account approvals. Pads and content are deleted 24 hours after everyone disconnects, or creation if never joined. Connected pads do not expire; unexpired pads survive restarts. `PAD_TTL_MS` changes the default 86400000ms window. Cleanup runs at startup and every minute. Pad-state writes debounce 400ms and flush on graceful shutdown. Presence stays ephemeral; the display name is saved only in the browser's localStorage. Opening an existing pad does not require an account; pad links are not private or authenticated workspaces.

Islands Dark and Islands Light use JetBrains' upstream colors with self-hosted Inter and JetBrains Mono. The header sun/moon button persists this browser's theme under `rycruit.theme`, defaulting to the system color scheme; it is never shared with collaborators. See [THEME-SOURCES.md](THEME-SOURCES.md) for exact source files and color mappings.

## Production / arm64 Mac mini

```
docker compose up --build -d
```

Open https://rycruit.dev. Compose does not publish a host port; the existing tunnel reaches `rycruit:3001` on the shared Docker network. Both base images support arm64 and the sandbox installs native toolchains with apt; no architecture is hardcoded. Startup compares the sandbox's source-hash label with bundled files and automatically builds missing or outdated images, logging progress. The app serves the built client and websocket endpoint from one port. Compose data lives in the `./data/rycruit` bind mount. See [DEPLOY.md](DEPLOY.md) for Ryan's shared Compose configuration.

The mounted Docker socket gives the app host-level Docker access. Only the app accesses it; sandbox containers receive no mounts or network. Do not expose the Docker socket over TCP. This lightweight sandbox is suitable for trusted mock-interview groups, not a hardened public multi-tenant execution service. Pad links remain public; rate limiting and storage quotas are not implemented. Run requests queue globally at two concurrent jobs, with one outstanding job per pad.

## Checks

The product-shot landing is the only landing page. Its read-only example runs locally in CodeMirror and does not create a pad. New pad goes to `/new`; sign in and wait for Ryan to allow your account. Admins manage requests at `/admin`. The development bypass above treats the caller as `ryan@local`. Keep it off in production. See [DEPLOY.md](DEPLOY.md) for Cloudflare Access and Tunnel setup.

```
pnpm test:runners
RUNNER=docker pnpm test:runners
pnpm test:collaboration
pnpm format:check
pnpm typecheck
pnpm build
node tests/theme-shots.js
node tests/access.js
node tests/members.js
node tests/admin-shots.js
node tests/html-preview.js
node tests/sandbox-startup.js
SANDBOX_BASE_IMAGE=mirror.gcr.io/library/debian:bookworm-slim node tests/sandbox-image.js
```

The runner test exercises both modes and requires the sandbox image. The collaboration test requires a running server and uses two independent websocket clients (no BroadcastChannel). `PORT` can override its default server port.
