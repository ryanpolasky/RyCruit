# Deploy RyCruit

The remotely managed tunnel **ND_Basement**, DNS for **rycruit.dev**, and the **RyCruit sign-in** and **RyCruit admin** Access apps already exist; the tunnel routes to `http://rycruit:3001`.

## Shared Compose

Put the repo at `./RyCruit` beside the shared Compose file. Paste this service and merge the volume declaration into its existing top-level `volumes` section:

```yaml
services:
  rycruit:
    image: rycruit
    build: ./RyCruit
    environment:
      RUNNER: docker
      DATA_DIR: /data
      CF_ACCESS_TEAM: rpolasky
      CF_ACCESS_AUD_MEMBER: 93d88fa02a61280d9d9bcc8c77ec0909b4a5cd4061cc47985f7956faf3b76c02
      CF_ACCESS_AUD_ADMIN: b4e9d79dd7f3e3e67fcbd7a1a915d7214a2bee3911d1c151e91bf4c26d301e07
      ADMIN_EMAILS: ryanpolasky@hotmail.com
      ALLOW_UNAUTHENTICATED: "false"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - rycruit_pads:/data
    restart: unless-stopped
volumes:
  rycruit_pads:
```

Keep `rycruit` on the same Docker network as cloudflared (the shared Compose default network works). No host port publish is needed. WebSockets use the same tunnel route.

Build the sandbox once on the same Docker daemon, then start the app from the shared Compose directory:

```sh
(cd RyCruit && docker build -f Dockerfile.sandbox -t rycruit-sandbox .)
docker compose up -d --build rycruit
docker compose logs --tail=50 rycruit
docker compose exec rycruit docker version
```

Rebuild the sandbox when `Dockerfile.sandbox` or `server/sandbox.py` changes. The repo's own Compose file is also runnable with `docker compose up -d --build` from the repo; it uses `build: .` and does not publish a host port. For tunnel access, use the shared Compose deployment above.

## Runtime and Access

The app image includes the Docker CLI and runs as root. Docker Desktop on macOS exposes a root-owned socket proxy: root in the container is simplest; a non-root override needs matching socket group permissions. Mounting the socket grants host-level Docker privileges. Back up the `rycruit_pads` volume, including SQLite/WAL consistently. If upgrading an existing install, reuse its existing pad volume rather than starting an empty one.

The sign-in app covers `/new` and `/api/me` with email one-time PIN for anyone. These routes accept the member or admin AUD. A first sign-in creates a pending account; Ryan allows or blocks it in Admin's People section. Remove returns an allowed account to pending. Admin emails are always allowed to create pads, but admin routes require an admin-AUD token plus an email in `ADMIN_EMAILS`.

The Ryan-only admin app covers `/admin`, `/admin/*`, `/api/admin` and `/api/admin/*`. The server independently verifies `Cf-Access-Jwt-Assertion` against the `rpolasky` team's keys, route-specific AUD and expiry. The verified `CF_Authorization` cookie remains a fallback. Both AUD variables are required for member routes; the old `CF_ACCESS_AUD` variable is no longer used. Keep `ALLOW_UNAUTHENTICATED` false. Existing pad links, invites and collaboration remain public.

Cloudflare Zero Trust's free plan has a 50-seat limit; signed-in users count toward it.

Open https://rycruit.dev/admin to manage people, pads and invites or https://rycruit.dev/new to request access or create a pad. Invite GET/HEAD requests only show a confirmation page; Create pad submits a same-origin POST. Link-preview scanners do not consume single-use invites.
