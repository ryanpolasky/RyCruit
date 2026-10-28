import { readFile } from "node:fs/promises";

const escape = (text) =>
  text.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );

async function page(title, content) {
  const client = await readFile(
    new URL("../dist/index.html", import.meta.url),
    "utf8",
  );
  const styles =
    client.match(/<link\b[^>]*rel="stylesheet"[^>]*>/g)?.join("\n") || "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} · RyCruit</title>
<script>
let theme;
try { theme = localStorage.getItem("rycruit.theme"); } catch {}
document.documentElement.dataset.theme = theme === "dark" || theme === "light" ? theme : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
</script>
${styles}
<style>
body{padding:32px 24px;font-size:16px;line-height:1.6}nav,main{max-width:640px;margin:auto}main{margin:100px auto 0;padding:32px;background:var(--editor);border:1px solid var(--island-border);border-radius:12px}h1{font-size:32px;font-weight:600;letter-spacing:-1px;margin:0 0 16px;line-height:1.2}p{margin:12px 0}.email{overflow-wrap:anywhere}footer{height:auto;justify-content:flex-start;align-items:center;gap:20px;margin-top:28px;padding:0;border:0;font-size:14px;flex-wrap:wrap}.primary{display:inline-block;padding:12px 20px;border-radius:var(--radius);font-size:14px}form{margin-top:24px}footer>a:not(.primary){color:var(--muted)}@media(max-width:500px){body{padding:24px 16px}main{margin-top:64px;padding:24px}h1{font-size:28px}}
</style></head><body><nav><a class="wordmark" href="/"><span>Ry</span>Cruit</a></nav><main><h1>${title}</h1>${content}</main></body></html>`;
}

export function accessPage(email, blocked) {
  return page(
    blocked ? "No access" : "Waiting on Ryan",
    `<p class="email">${escape(email)}</p><p>${blocked ? "This account cannot create pads." : "Ryan will review your request when he gets to it."}</p><footer>${blocked ? "" : '<a class="primary" href="/new">Check again</a>'}<a href="/">Home</a></footer>`,
  );
}

export function invitePage(invite) {
  return invite
    ? page(
        "Ryan invited you to make a pad",
        `${invite.label ? `<p>Invite: ${escape(invite.label)}</p>` : ""}<form action="/i/${invite.token}" method="post"><button class="primary" type="submit">Create pad</button></form><footer><a href="/">Home</a></footer>`,
      )
    : page(
        "Invite unavailable",
        '<p>This invite has expired, was revoked, or has already been used.</p><footer><a href="/">Home</a></footer>',
      );
}
