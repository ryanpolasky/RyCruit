const fetch = globalThis.fetch;
globalThis.fetch = (url, options) => {
  if (
    String(url) ===
    "https://test-team.cloudflareaccess.com/cdn-cgi/access/certs"
  ) {
    return Promise.resolve(
      new Response(process.env.TEST_JWKS, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }
  return fetch(url, options);
};
