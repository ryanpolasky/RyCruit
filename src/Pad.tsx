import { useState } from "react";
import type { Lang, Person, Result } from "./types";
import { usePadSession } from "./usePadSession";
import { Header } from "./Header";
import { OutputPane } from "./OutputPane";
import { Editor } from "./Editor";
import { Wordmark } from "./Wordmark";
export function Pad({ padId }: { padId: string }) {
  const [name, setName] = useState(
    () => localStorage.getItem("rycruit.name") || "",
  );
  const [draft, setDraft] = useState(name);
  const { doc, provider, connected, now } = usePadSession(padId, name);
  const [tab, setTab] = useState("output");
  const [error, setError] = useState("");
  const meta = doc.getMap("meta");
  const lang = (meta.get("language") || "python") as Lang;
  const safeLang = ["python", "cpp", "java"].includes(lang) ? lang : "python";
  const running = meta.get("running") as { by: string } | undefined;
  const results = doc
    .getArray<Result>("results")
    .toArray()
    .slice(-20)
    .reverse();
  const people = [...provider.awareness.getStates().values()]
    .map((s) => s.user as Person | undefined)
    .filter((p): p is Person => Boolean(p?.name));
  const startedAt = meta.get("startedAt") as number | undefined;
  const elapsed =
    ((meta.get("elapsed") as number) || 0) + (startedAt ? now - startedAt : 0);
  const seconds = Math.max(0, Math.floor(elapsed / 1000));
  async function run() {
    if (!name || running || !connected) return;
    setTab("output");
    setError("");
    try {
      const response = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ padId, by: name }),
      });
      if (!response.ok) throw new Error(await response.text());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not run code");
    }
  }
  function timer() {
    doc.transact(() => {
      if (startedAt) {
        meta.set("elapsed", elapsed);
        meta.delete("startedAt");
      } else meta.set("startedAt", Date.now());
    });
  }
  return (
    <div className="pad">
      <Header
        {...{
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
        }}
      />
      <div className="workspace">
        <section className="code-pane">
          <div className="pane-bar">
            <span>
              {safeLang === "python"
                ? "main.py"
                : safeLang === "cpp"
                  ? "main.cpp"
                  : "Main.java"}
            </span>
            <span className={connected ? "online" : ""}>
              {connected ? "● Live" : "○ Connecting…"}
            </span>
          </div>
          <Editor
            doc={doc}
            provider={provider}
            field={safeLang}
            lang={safeLang}
            onRun={run}
          />
        </section>
        <OutputPane
          {...{ doc, provider, run, tab, setTab, results, error, running }}
        />
      </div>
      <footer>
        <span>5s runtime · 256MB memory · last 20 runs</span>
      </footer>
      {!name && (
        <div className="overlay">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const value = draft.trim().slice(0, 40);
              if (value) {
                localStorage.setItem("rycruit.name", value);
                setName(value);
              }
            }}
          >
            <Wordmark />
            <h2>Join pad</h2>
            <p>Your display name labels your cursor and runs.</p>
            <input
              autoFocus
              maxLength={40}
              placeholder="Your display name"
              aria-label="Display name"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button className="primary" disabled={!draft.trim()}>
              Join pad
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
