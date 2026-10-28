import { useEffect, useState } from "react";
import { Pad } from "./Pad";
import { Wordmark } from "./Wordmark";
import { ThemeToggle } from "./ThemeToggle";

export function PadRoute({ padId }: { padId: string }) {
  const [status, setStatus] = useState("loading");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/pads/${encodeURIComponent(padId)}`, {
      signal: controller.signal,
    })
      .then((response) =>
        setStatus(
          response.ok ? "found" : response.status === 404 ? "missing" : "error",
        ),
      )
      .catch((error) => {
        if (error.name !== "AbortError") setStatus("error");
      });
    return () => controller.abort();
  }, [padId]);
  if (status === "found") return <Pad padId={padId} />;
  return (
    <div className="landing-page">
      <nav className="landing-nav">
        <Wordmark />
        <ThemeToggle />
      </nav>
      <main className="status-page">
        <h1>
          {status === "loading"
            ? "Loading pad…"
            : status === "missing"
              ? "Pad not found"
              : "Could not load pad"}
        </h1>
        <p>
          {status === "missing"
            ? "Check the link with the person who sent it."
            : status === "error"
              ? "Check your connection and reload."
              : ""}
        </p>
        <a href="/">Home</a>
      </main>
    </div>
  );
}
