# Self-hosting RyCruit

Build `rycruit-sandbox` on the Docker daemon used by the app:

```sh
docker build -f Dockerfile.sandbox -t rycruit-sandbox .
```

Set `CF_ACCESS_TEAM` to the team slug, `CF_ACCESS_AUD` to the Access application's audience tag, and `ADMIN_EMAILS` to a comma-separated email allowlist. Use the same email in the Access policy. Do not enable `ALLOW_UNAUTHENTICATED` in production: `true` grants admin access as `ryan@local`.

## Compose

The repo's `docker-compose.yml` defines the app. Equivalent service configuration:

```yaml
services:
  rycruit:
    build: .
    image: rycruit
    environment:
      RUNNER: docker
      DATA_DIR: /data
      CF_ACCESS_TEAM: ${CF_ACCESS_TEAM}
      CF_ACCESS_AUD: ${CF_ACCESS_AUD}
      ADMIN_EMAILS: ${ADMIN_EMAILS}
      ALLOW_UNAUTHENTICATED: "false"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - pads:/data
    restart: unless-stopped
volumes:
  pads:
```

Run `docker compose up --build -d`. Keep port 3001 private when using a tunnel. The sandbox image must already exist; Compose does not build it. Docker socket access gives the app host-level Docker privileges.

## Tunnel

Run cloudflared on the same Docker network as the app. For a locally managed tunnel, mount its credentials and this ingress config:

```yaml
tunnel: YOUR-TUNNEL-UUID
credentials-file: /etc/cloudflared/YOUR-TUNNEL-UUID.json
ingress:
  - hostname: rycruit.ryanpolasky.com
    service: http://rycruit:3001
  - service: http_status:404
```

Create the tunnel DNS route for `rycruit.ryanpolasky.com`. For a remotely managed tunnel, set the public hostname's service to `http://rycruit:3001` instead. Enable WebSockets in Cloudflare's Network settings; Tunnel forwards `/ws/*` without a separate ingress rule. Do not cache HTML, API, creation or invite responses.

## Access

Create a **Self-hosted** Access application for `rycruit.ryanpolasky.com`. Add protected destinations for `/new`, `/admin` and `/admin/*` (a wildcard only may not cover the bare `/admin` path). Keep `/`, `/p/*`, `/i/*` and `/ws/*` public. Add an Allow policy including Ryan's exact email. Copy the application's AUD tag into `CF_ACCESS_AUD`; the team slug is the prefix of `https://TEAM.cloudflareaccess.com`.

The server verifies the `Cf-Access-Jwt-Assertion` with the team's JWKS, issuer, AUD, expiry and email allowlist. Since `/api/admin/*` is outside the protected edge paths, it also accepts the browser's `CF_Authorization` cookie **only after the same JWT verification**. An unsigned email header or cookie is never sufficient. Direct-origin requests without a valid JWT receive 403; the edge policy is not the API's security boundary. Admin mutations reject cross-site origins.

Visit `/new` to create a pad or `/admin` to manage pads and mint invites. Single-use invites are consumed when opened, including by link scanners. Expiring invites allow repeated creation until expiry. Treat invite URLs as bearer credentials; revoking one leaves its existing pads intact. Back up the `pads` volume (`rycruit.sqlite` and its WAL consistently); it contains code, the registry, and invite tokens. Legacy pads are registered on first startup with `legacy` attribution and migration-time timestamps.
