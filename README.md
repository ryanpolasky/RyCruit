# RyCruit

A shared editor for mock coding interviews. Create a pad and send its link to your partner. You can edit Python, C++ or Java together and compile and run code against shared stdin. Run output and the interview timer are shared.

Free to use. Approved accounts can create pads; host invites also work without signing in. Anyone with a pad link can edit and run code, so use it with people you trust.

One pnpm package. Node 24+ and pnpm 11 required.

## Develop

The project lives at `~/repos/rycruit`.

```
pnpm install
docker build -f Dockerfile.sandbox -t rycruit-sandbox .
ALLOW_UNAUTHENTICATED=true pnpm server
pnpm dev
```

Open http://localhost:5173. Vite proxies HTTP and websocket traffic to port 3001. The server defaults to the Docker runner. For trusted code only, `RUNNER=local pnpm server` uses host Python 3, g++ and Java 17. Local mode is not a security boundary: submitted code has the server user's filesystem and network access. It applies wall time, process-group cleanup, output limits, file-size limits, and address-space ulimits for Python/C++; Java uses bounded JVM heap/metaspace instead because a 256MB virtual-address-space limit prevents the JVM from starting. Use Docker for enforcing the total 256MB memory limit.

SQLite stores pad state (buffers, stdin, language, timer, last 20 results), the pad registry, invites and account approval status in `data/rycruit.sqlite`. Pad-state writes debounce 400ms and flush on graceful shutdown. Presence stays ephemeral; the display name is saved only in the browser's localStorage. Opening an existing pad does not require an account; pad links are not private or authenticated workspaces.

Islands Dark and Islands Light use JetBrains' upstream colors with self-hosted Inter and JetBrains Mono. The header sun/moon button persists this browser's theme under `rycruit.theme`, defaulting to the system color scheme; it is never shared with collaborators. See [THEME-SOURCES.md](THEME-SOURCES.md) for exact source files and color mappings.

## Production / arm64 Mac mini

```
docker build -f Dockerfile.sandbox -t rycruit-sandbox .
docker compose up --build -d
```

Open https://rycruit.dev. Compose does not publish a host port; the existing tunnel reaches `rycruit:3001` on the shared Docker network. Both base images support arm64 and the sandbox installs native toolchains with apt; no architecture is hardcoded. Build the sandbox on the same Docker daemon used by Compose. The app serves the built client and websocket endpoint from one port. Data lives in the `rycruit_pads` named volume. See [DEPLOY.md](DEPLOY.md) for the shared Compose configuration.

The mounted Docker socket gives the app host-level Docker access. Only the app accesses it; sandbox containers receive no mounts or network. Do not expose the Docker socket over TCP. This lightweight sandbox is suitable for trusted mock-interview groups, not a hardened public multi-tenant execution service. Pad links remain public; rate limiting, pad expiry and storage quotas are not implemented. Run requests queue globally at two concurrent jobs, with one outstanding job per pad.

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
```

The runner test exercises both modes and requires the sandbox image. The collaboration test requires a running server and uses two independent websocket clients (no BroadcastChannel). `PORT` can override its default server port.
