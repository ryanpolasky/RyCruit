import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import type { Result } from "./types";
import { Editor } from "./Editor";
type Props = {
  doc: Y.Doc;
  provider: WebsocketProvider;
  run: () => void;
  tab: string;
  setTab: (v: string) => void;
  results: Result[];
  error: string;
  running: { by: string } | undefined;
};
export function OutputPane({
  doc,
  provider,
  run,
  tab,
  setTab,
  results,
  error,
  running,
}: Props) {
  return (
    <section className="side-pane">
      <div className="tabs">
        <button
          className={tab === "output" ? "active" : ""}
          onClick={() => setTab("output")}
        >
          Output {results.length > 0 && <span>{results.length}</span>}
        </button>
        <button
          className={tab === "stdin" ? "active" : ""}
          onClick={() => setTab("stdin")}
        >
          Stdin
        </button>
      </div>
      {tab === "stdin" ? (
        <>
          <div className="hint">Shared input · passed to your next run</div>
          <Editor doc={doc} provider={provider} field="stdin" onRun={run} />
        </>
      ) : (
        <div className="output" aria-live="polite">
          {error && <p className="error">{error}</p>}
          {running && <div className="running">Running (by {running.by})…</div>}
          {results.length === 0 && !running && (
            <div className="empty">
              <span>›_</span>
              <h2>Ready when you are.</h2>
              <p>
                Run your code to see the output here.
                <br />
                Everyone in the pad sees the same results.
              </p>
            </div>
          )}
          {results.map((result, i) => (
            <article key={`${result.at}-${i}`}>
              <div className="result-meta">
                <span className={result.exitCode === 0 ? "online" : "error"}>
                  {result.compileError
                    ? "Compile error"
                    : result.exitCode === 0
                      ? "Completed"
                      : `Exit ${result.exitCode}`}
                </span>
                <span>
                  {result.timeMs} ms · {result.lang}
                </span>
              </div>
              <div className="result-by">
                {result.by} · {new Date(result.at).toLocaleTimeString()}
              </div>
              {result.stdout && <pre>{result.stdout}</pre>}
              {result.stderr && <pre className="error">{result.stderr}</pre>}
              {!result.stdout && !result.stderr && (
                <pre className="muted">No output</pre>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
