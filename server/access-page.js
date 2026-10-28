const escape = (text) =>
  text.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );

function page(title, content) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} · RyCruit</title>
<style>
:root{color-scheme:dark;font:16px/1.6 system-ui,sans-serif;color:#bcbec4;background:#27282b}*{box-sizing:border-box}body{margin:0;padding:32px 24px}nav,main{max-width:640px;margin:auto}nav a{font-size:24px;font-weight:700;letter-spacing:-1px;text-decoration:none;color:inherit}nav span{color:#538af8}main{margin:100px auto 0;padding:32px;background:#191a1c;border-radius:12px}h1{font-size:32px;letter-spacing:-1px;margin:0 0 16px;line-height:1.2}p{margin:12px 0}a{color:#7da7ff}.email{overflow-wrap:anywhere;color:#dfe1e5}footer{margin-top:28px;font-size:14px}@media(max-width:500px){body{padding:24px 16px}main{margin-top:64px;padding:24px}h1{font-size:28px}}
</style></head><body><nav><a href="/"><span>Ry</span>Cruit</a></nav><main><h1>${title}</h1>${content}</main></body></html>`;
}

export function accessPage(email, blocked) {
  return page(
    blocked ? "No access" : "Waiting on Ryan",
    `<p class="email">${escape(email)}</p><p>${blocked ? "This account cannot create pads." : "Ryan will review your request when he gets to it."}</p><footer>${blocked ? "" : '<a href="/new">Check again</a> · '}<a href="/">Home</a></footer>`,
  );
}

export function invitePage(invite) {
  return invite
    ? page(
        "Ryan invited you to make a pad",
        `${invite.label ? `<p>Invite: ${escape(invite.label)}</p>` : ""}<form action="/i/${invite.token}" method="post"><button style="background:#3574f0;color:white;border:0;border-radius:6px;padding:12px 20px;font:inherit;cursor:pointer" type="submit">Create pad</button></form><footer><a href="/">Home</a></footer>`,
      )
    : page(
        "Invite unavailable",
        '<p>This invite has expired, was revoked, or has already been used.</p><footer><a href="/">Home</a></footer>',
      );
}
