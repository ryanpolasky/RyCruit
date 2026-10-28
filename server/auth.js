import { createRemoteJWKSet, jwtVerify } from "jose";

export function createAdminVerifier({
  team = process.env.CF_ACCESS_TEAM,
  audience = process.env.CF_ACCESS_AUD,
  emails = process.env.ADMIN_EMAILS || "",
  bypass = process.env.ALLOW_UNAUTHENTICATED === "true",
  keySet,
} = {}) {
  const admins = new Set(
    emails
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
  const issuer =
    team && /^[a-z0-9-]+$/.test(team)
      ? `https://${team}.cloudflareaccess.com`
      : null;
  const keys =
    keySet ||
    (issuer
      ? createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`), {
          timeoutDuration: 5000,
        })
      : null);
  return async function admin(req) {
    if (bypass) return "ryan@local";
    const cookie = req.headers.cookie
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("CF_Authorization="))
      ?.slice("CF_Authorization=".length);
    const token = req.headers["cf-access-jwt-assertion"] ?? cookie;
    if (
      !issuer ||
      !audience ||
      !keys ||
      typeof token !== "string" ||
      token.length > 16384
    )
      return null;
    try {
      const { payload } = await jwtVerify(token, keys, {
        issuer,
        audience,
        algorithms: ["RS256"],
        requiredClaims: ["exp", "iat", "sub", "email"],
      });
      const email =
        typeof payload.email === "string" ? payload.email.toLowerCase() : "";
      return admins.has(email) ? email : null;
    } catch {
      return null;
    }
  };
}
