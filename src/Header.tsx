import { useState } from "react";
import * as Y from "yjs";
import type { Lang, Person } from "./types";
import { Wordmark } from "./Wordmark";
import { ThemeToggle } from "./ThemeToggle";
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
          {copied ? "Copied" : "Copy link"}
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
      <ThemeToggle />
      <button
        className="primary run"
        disabled={Boolean(running) || !connected || !name}
        onClick={run}
      >
        {running ? "Running…" : "Run"}
        <kbd>⌘ / Ctrl ↵</kbd>
      </button>
    </header>
  );
}
