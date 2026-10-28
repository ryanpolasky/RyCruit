# Deploy RyCruit

The remotely managed tunnel **ND_Basement**, DNS for **rycruit.dev**, and the **RyCruit sign-in** and **RyCruit admin** Access apps already exist; the tunnel routes to `http://rycruit:3001`.

## Shared Compose

From Ryan's `orb-vpc` Compose directory, the repo is at `../Projects/RyCruit`. Paste this service:

```yaml
services:
  rycruit:
    image: rycruit
    container_name: rycruit
    build: ../Projects/RyCruit
    environment:
      - RUNNER=docker
      - DATA_DIR=/data
      - TZ=America/Chicago
      - CF_ACCESS_TEAM=rpolasky
      - CF_ACCESS_AUD_MEMBER=93d88fa02a61280d9d9bcc8c77ec0909b4a5cd4061cc47985f7956faf3b76c02
      - CF_ACCESS_AUD_ADMIN=b4e9d79dd7f3e3e67fcbd7a1a915d7214a2bee3911d1c151e91bf4c26d301e07
      - ADMIN_EMAILS=ryanpolasky@hotmail.com
      - ALLOW_UNAUTHENTICATED=false
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./data/rycruit:/data
    restart: unless-stopped
```

Keep `rycruit` on the same Docker network as cloudflared (the shared Compose default network works). No host port publish is needed. WebSockets use the same tunnel route.

Start from the shared Compose directory:

```sh
docker compose up -d --build rycruit
docker compose logs --tail=50 rycruit
docker compose exec rycruit docker version
```

At startup, RyCruit inspects `rycruit-sandbox` and builds it through the mounted socket if missing, using files included in the app image. Build progress appears in the logs; Run asks you to try again while it builds. A failed build stays unavailable until restart; check the logs for Docker connectivity or registry errors. Optional prebuild (also use this to refresh an existing image after sandbox changes): `docker build -f ../Projects/RyCruit/Dockerfile.sandbox -t rycruit-sandbox ../Projects/RyCruit`.

The repo's own Compose file is also runnable with `docker compose up -d --build` from the repo; it uses `build: .` and the same bind-mount convention, without publishing a host port. For tunnel access, use the shared Compose deployment above.

## Runtime and Access

The app image includes the Docker CLI and runs as root. OrbStack/Docker Desktop on macOS expose a socket proxy: root in the container is simplest; a non-root override needs matching socket group permissions. Mounting the socket grants host-level Docker privileges. SQLite lives in `./data/rycruit`; keep this directory across rebuilds for approvals and invites.

Pads and their content expire 24 hours after the last client disconnects, or creation if never joined. Rejoining resets the countdown on the next final disconnect. SQLite preserves unexpired pads across restarts; expiry is swept at startup and every minute. `PAD_TTL_MS` optionally overrides the default `86400000` milliseconds. Connected pads do not expire. This is row deletion, not secure erasure of old backups or filesystem blocks.

The sign-in app covers `/new` and `/api/me` with email one-time PIN for anyone. These routes accept the member or admin AUD. A first sign-in creates a pending account; Ryan allows or blocks it in Admin's People section. Remove returns an allowed account to pending. Admin emails are always allowed to create pads, but admin routes require an admin-AUD token plus an email in `ADMIN_EMAILS`.

The Ryan-only admin app covers `/admin`, `/admin/*`, `/api/admin` and `/api/admin/*`. The server independently verifies `Cf-Access-Jwt-Assertion` against the `rpolasky` team's keys, route-specific AUD and expiry. The verified `CF_Authorization` cookie remains a fallback. Both AUD variables are required for member routes; the old `CF_ACCESS_AUD` variable is no longer used. Keep `ALLOW_UNAUTHENTICATED` false. Existing pad links, invites and collaboration remain public.

Cloudflare Zero Trust's free plan has a 50-seat limit; signed-in users count toward it.

Open https://rycruit.dev/admin to manage people, pads and invites or https://rycruit.dev/new to request access or create a pad. Invite GET/HEAD requests only show a confirmation page; Create pad submits a same-origin POST. Link-preview scanners do not consume single-use invites.
