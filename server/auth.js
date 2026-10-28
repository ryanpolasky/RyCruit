import { createRemoteJWKSet, jwtVerify } from "jose";

export function createAccessVerifier({
  team = process.env.CF_ACCESS_TEAM,
  audienceAdmin = process.env.CF_ACCESS_AUD_ADMIN,
  audienceMember = process.env.CF_ACCESS_AUD_MEMBER,
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
  return async function authenticate(req, role = "admin") {
    if (bypass)
      return { email: "ryan@local", isAdmin: true, isAdminEmail: true };
    const audiences =
      role === "admin" ? [audienceAdmin] : [audienceMember, audienceAdmin];
    const cookie = req.headers.cookie
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("CF_Authorization="))
      ?.slice("CF_Authorization=".length);
    const token = req.headers["cf-access-jwt-assertion"] ?? cookie;
    if (
      !issuer ||
      !audienceAdmin ||
      (role === "member" && !audienceMember) ||
      !keys ||
      typeof token !== "string" ||
      token.length > 16384
    )
      return null;
    try {
      const { payload } = await jwtVerify(token, keys, {
        issuer,
        audience: audiences,
        algorithms: ["RS256"],
        requiredClaims: ["exp", "iat", "sub", "email"],
      });
      const email =
        typeof payload.email === "string" ? payload.email.toLowerCase() : "";
      if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(email))
        return null;
      const tokenAudiences = Array.isArray(payload.aud)
        ? payload.aud
        : [payload.aud];
      const isAdminEmail = admins.has(email);
      const isAdmin = isAdminEmail && tokenAudiences.includes(audienceAdmin);
      if (role === "admin" && !isAdmin) return null;
      return { email, isAdmin, isAdminEmail };
    } catch {
      return null;
    }
  };
}
