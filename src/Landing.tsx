import { Wordmark } from "./Wordmark";
export function Landing() {
  return (
    <main className="landing">
      <Wordmark />
      <h1>
        A shared space
        <br />
        to think out loud.
      </h1>
      <p>
        Mock interviews, without the friction.
        <br />
        Open a pad. Share the link. Build something together.
      </p>
      <button
        className="primary"
        onClick={() => {
          location.href = `/p/${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}${location.search}`;
        }}
      >
        New pad <span>↗</span>
      </button>
      <small>No accounts. No installation. Just code.</small>
    </main>
  );
}
