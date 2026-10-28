import { useEffect, useState } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
export function usePadSession(padId: string, name: string) {
  const [session] = useState(() => {
    const doc = new Y.Doc();
    const provider = new WebsocketProvider(
      `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`,
      padId,
      doc,
      { connect: false },
    );
    const colors = ["#8a65bc", "#338575", "#a36b25", "#b05e7c", "#377fba"];
    const color = colors[Math.floor(Math.random() * colors.length)];
    return { doc, provider, color };
  });
  const { doc, provider, color } = session;
  const [, render] = useState(0);
  const [connected, setConnected] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const update = () => render((n) => n + 1);
    const status = ({ status }: { status: string }) =>
      setConnected(status === "connected");
    doc.on("update", update);
    provider.awareness.on("change", update);
    provider.on("status", status);
    provider.connect();
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => {
      clearInterval(interval);
      provider.destroy();
      doc.destroy();
    };
  }, [doc, provider]);
  useEffect(() => {
    if (name)
      provider.awareness.setLocalStateField("user", {
        name,
        color,
        colorLight: color + "30",
      });
  }, [name, color, provider]);

  return { doc, provider, connected, now };
}
