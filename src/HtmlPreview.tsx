import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type * as Y from "yjs";

const policy =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
type Entry = { level: string; text: string };

export function HtmlPreview({ doc, refresh }: { doc: Y.Doc; refresh: number }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [page, setPage] = useState({ source: "", token: "" });
  const [entries, setEntries] = useState<Entry[]>([]);
  const consoleRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (consoleRef.current)
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
  }, [entries]);
  useEffect(() => {
    const html = doc.getText("html");
    let timer: ReturnType<typeof setTimeout>;
    const render = () => {
      const token = crypto.randomUUID();
      const bridge = `<script>(() => {
        const send = (level, values) => {
          const text = values.map(value => { try { return typeof value === 'string' ? value : JSON.stringify(value) ?? String(value); } catch { return String(value); } }).join(' ').slice(0, 2048);
          parent.postMessage({ type: 'rycruit-console', token: ${JSON.stringify(token)}, level, text }, '*');
        };
        for (const level of ['log', 'info', 'warn', 'error']) console[level] = (...values) => send(level, values);
        addEventListener('error', event => send('error', [event.message]));
        addEventListener('unhandledrejection', event => send('error', [String(event.reason)]));
      })();<\/script>`;
      setEntries([]);
      setPage({
        token,
        source: `<!doctype html><meta http-equiv="Content-Security-Policy" content="${policy}">${bridge}${html.toString()}`,
      });
    };
    const update = () => {
      clearTimeout(timer);
      timer = setTimeout(render, 300);
    };
    render();
    html.observe(update);
    return () => {
      clearTimeout(timer);
      html.unobserve(update);
    };
  }, [doc, refresh]);
  useEffect(() => {
    let count = 0;
    const receive = (event: MessageEvent) => {
      const data = event.data;
      if (
        event.source !== frame.current?.contentWindow ||
        event.origin !== "null" ||
        !data ||
        data.type !== "rycruit-console" ||
        data.token !== page.token ||
        typeof data.text !== "string" ||
        !["log", "info", "warn", "error"].includes(data.level) ||
        count++ >= 100
      )
        return;
      setEntries((values) => [
        ...values,
        { level: data.level, text: data.text.slice(0, 2048) },
      ]);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [page.token]);
  return (
    <div className="html-preview">
      {page.token && (
        <iframe
          key={page.token}
          ref={frame}
          title="HTML preview"
          sandbox="allow-scripts allow-modals"
          referrerPolicy="no-referrer"
          srcDoc={page.source}
        />
      )}
      <div className="preview-console">
        <div className="console-label">
          Console <span>Local to this browser · last 100 messages</span>
        </div>
        <div className="console-lines" aria-live="polite" ref={consoleRef}>
          {entries.length === 0 ? (
            <p className="muted">Console messages appear here.</p>
          ) : (
            entries.map((entry, index) => (
              <pre
                key={index}
                className={entry.level === "error" ? "error" : ""}
              >
                {entry.text}
              </pre>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
