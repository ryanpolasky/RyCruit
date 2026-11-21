import { EditorView, ViewPlugin } from "@codemirror/view";
import type { WebsocketProvider } from "y-websocket";

type Awareness = WebsocketProvider["awareness"];

function normalizeColor(color: string) {
  const hex = color.match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1];
  if (hex) {
    const expanded =
      hex.length === 3
        ? [...hex].map((digit) => digit.repeat(2)).join("")
        : hex;
    return `#${expanded.toLowerCase()}`;
  }
  const rgb = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  return rgb
    ? `#${rgb
        .slice(1, 4)
        .map((channel) => Number(channel).toString(16).padStart(2, "0"))
        .join("")}`
    : null;
}

export function remoteActivity(awareness: Awareness) {
  return ViewPlugin.fromClass(
    class {
      private view: EditorView;
      private cursors = new Map<number, string | undefined>();
      private lastActive = new Map<string, number>();
      private timers = new Set<ReturnType<typeof setTimeout>>();
      private frame: number | null = null;

      constructor(view: EditorView) {
        this.view = view;
        for (const [clientID, state] of awareness.getStates()) {
          this.cursors.set(clientID, JSON.stringify(state.cursor));
        }
        awareness.on("change", this.onChange);
      }

      update() {
        this.scheduleRefresh();
      }

      destroy() {
        awareness.off("change", this.onChange);
        if (this.frame !== null) cancelAnimationFrame(this.frame);
        for (const timer of this.timers) clearTimeout(timer);
      }

      private onChange = ({
        added,
        updated,
        removed,
      }: {
        added: number[];
        updated: number[];
        removed: number[];
      }) => {
        for (const clientID of removed) this.cursors.delete(clientID);
        for (const clientID of [...added, ...updated]) {
          const state = awareness.getStates().get(clientID);
          const cursor = JSON.stringify(state?.cursor);
          const previous = this.cursors.get(clientID);
          this.cursors.set(clientID, cursor);
          if (clientID === awareness.clientID || cursor === previous) continue;

          const color = normalizeColor(state?.user?.color ?? "#30bced");
          const key = `${state?.user?.name ?? "Anonymous"}|${color}`;
          this.lastActive.set(key, Date.now());
          this.scheduleRefresh();
          const timer = setTimeout(() => {
            this.timers.delete(timer);
            this.scheduleRefresh();
          }, 2050);
          this.timers.add(timer);
        }
      };

      private scheduleRefresh() {
        if (this.frame !== null) return;
        this.frame = requestAnimationFrame(() => {
          this.frame = null;
          this.refresh();
        });
      }

      private refresh() {
        const now = Date.now();
        for (const [key, timestamp] of this.lastActive) {
          if (now - timestamp >= 2000) this.lastActive.delete(key);
        }
        for (const caret of this.view.dom.querySelectorAll<HTMLElement>(
          ".cm-ySelectionCaret",
        )) {
          const name = caret.querySelector(".cm-ySelectionInfo")?.textContent;
          const color = caret
            .getAttribute("style")
            ?.match(/(?:^|;)\s*background-color:\s*([^;]+)/i)?.[1]
            .trim();
          const normalizedColor = color ? normalizeColor(color) : null;
          const timestamp =
            name && normalizedColor
              ? this.lastActive.get(`${name}|${normalizedColor}`)
              : undefined;
          caret.classList.toggle(
            "cm-ySelectionCaret-active",
            timestamp !== undefined && now - timestamp < 2000,
          );
        }
      }
    },
  );
}
