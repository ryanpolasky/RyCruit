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
    const id = localStorage.getItem("rycruit.userId") || doc.guid;
    localStorage.setItem("rycruit.userId", id);
    let hash = 0;
    for (const character of id)
      hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    const color = colors[hash % colors.length];
    return { doc, provider, color, id };
  });
  const { doc, provider, color, id } = session;
  const [, render] = useState(0);
  const [connected, setConnected] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const update = () => render((n) => n + 1);
    const status = ({ status }: { status: string }) =>
      setConnected(status === "connected");
    const disconnect = () => provider.disconnect();
    const connect = () => provider.connect();
    doc.on("update", update);
    provider.awareness.on("change", update);
    provider.on("status", status);
    provider.connect();
    window.addEventListener("pagehide", disconnect);
    window.addEventListener("pageshow", connect);
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => {
      clearInterval(interval);
      window.removeEventListener("pagehide", disconnect);
      window.removeEventListener("pageshow", connect);
      provider.destroy();
      doc.destroy();
    };
  }, [doc, provider]);
  useEffect(() => {
    if (name)
      provider.awareness.setLocalStateField("user", {
        id,
        name,
        color,
        colorLight: color + "30",
      });
  }, [name, color, id, provider]);

  return { doc, provider, connected, now };
}
