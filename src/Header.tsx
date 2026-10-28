import { useEffect, useState } from "react";
import * as Y from "yjs";
import type { Lang, Person } from "./types";
import { languageInfo } from "./types";
import { Wordmark } from "./Wordmark";
import { ThemeToggle } from "./ThemeToggle";
const shortLabels: Partial<Record<Lang, string>> = {
  javascript: "JS · 18",
  typescript: "TS",
  html: "HTML",
};
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
  const participants = new Map<string, Person & { tabs: number }>();
  for (const person of people) {
    const key = JSON.stringify(
      person.id ? [person.id] : [person.name, person.color],
    );
    const participant = participants.get(key);
    if (participant) participant.tabs++;
    else participants.set(key, { ...person, tabs: 1 });
  }
  const [narrow, setNarrow] = useState(
    () => matchMedia("(max-width: 650px)").matches,
  );
  useEffect(() => {
    const media = matchMedia("(max-width: 650px)");
    const update = () => setNarrow(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
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
        <optgroup label="Run code">
          {Object.entries(languageInfo)
            .filter(([id]) => id !== "html")
            .map(([id, { label }]) => (
              <option key={id} value={id}>
                {narrow ? shortLabels[id as Lang] || label : label}
              </option>
            ))}
        </optgroup>
        <optgroup label="Web">
          <option value="html">
            {narrow ? shortLabels.html : languageInfo.html.label}
          </option>
        </optgroup>
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
        {[...participants].map(([key, person]) => (
          <span key={key} style={{ color: person.color }}>
            <i style={{ background: person.color }} />
            {person.name}
            {person.tabs > 1 && (
              <small aria-label={`${person.tabs} tabs`}>×{person.tabs}</small>
            )}
          </span>
        ))}
      </div>
      <ThemeToggle />
      <button
        className="primary run"
        disabled={
          (safeLang !== "html" && Boolean(running)) || !connected || !name
        }
        onClick={run}
      >
        {safeLang === "html" ? "Refresh" : running ? "Running…" : "Run"}
        <kbd>⌘ / Ctrl ↵</kbd>
      </button>
    </header>
  );
}
