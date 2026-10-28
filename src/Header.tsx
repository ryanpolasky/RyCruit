import { useState } from "react";
import * as Y from "yjs";
import type { Lang, Person } from "./types";
import { Wordmark } from "./Wordmark";
import { toggleTheme, useTheme } from "./theme";
const labels = { python: "Python 3", cpp: "C++ 20", java: "Java 17" };
type Props = {
  padId: string;
  safeLang: Lang;
  meta: Y.Map<unknown>;
  doc: Y.Doc;
  people: Person[];
  seconds: number;
  startedAt: number | undefined;
  timer: () => void;
  running: { by: string } | undefined;
  connected: boolean;
  name: string;
  run: () => void;
  setError: (v: string) => void;
};
export function Header({
  padId,
  safeLang,
  meta,
  doc,
  people,
  seconds,
  startedAt,
  timer,
  running,
  connected,
  name,
  run,
  setError,
}: Props) {
  const [copied, setCopied] = useState(false);
  const theme = useTheme();
  return (
    <header>
      <Wordmark />
      <div className="pad-link">
        <span>{padId}</span>
        <button
          title="Copy pad link"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(location.href);
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            } catch {
              setError(
                "Clipboard unavailable. Copy the address from your browser.",
              );
            }
          }}
        >
          {copied ? "Copied" : "Copy link ↗"}
        </button>
      </div>
      <select
        aria-label="Language"
        value={safeLang}
        onChange={(e) => meta.set("language", e.target.value)}
      >
        {Object.entries(labels).map(([id, label]) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
      </select>
      <div className="timer">
        <span>
          {String(Math.floor(seconds / 60)).padStart(2, "0")}:
          {String(seconds % 60).padStart(2, "0")}
        </span>
        <button
          onClick={timer}
          title={startedAt ? "Pause timer" : "Start timer"}
        >
          {startedAt ? "Ⅱ" : "▷"}
        </button>
        <button
          title="Reset timer"
          onClick={() =>
            doc.transact(() => {
              meta.delete("startedAt");
              meta.set("elapsed", 0);
            })
          }
        >
          ↺
        </button>
      </div>
      <div className="presence">
        {people.map((person, i) => (
          <span key={i} style={{ color: person.color }}>
            <i style={{ background: person.color }} />
            {person.name}
          </span>
        ))}
      </div>
      <button
        className="theme-toggle"
        aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
        title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
        onClick={toggleTheme}
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          {theme === "dark" ? (
            <>
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
            </>
          ) : (
            <path d="M20.5 14A9 9 0 0 1 10 3.5 9 9 0 1 0 20.5 14Z" />
          )}
        </svg>
      </button>
      <button
        className="primary run"
        disabled={Boolean(running) || !connected || !name}
        onClick={run}
      >
        {running ? "Running…" : "▷ Run"}
        <kbd>⌘ / Ctrl ↵</kbd>
      </button>
    </header>
  );
}
