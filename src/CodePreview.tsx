import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { java } from "@codemirror/lang-java";
import { createEditorTheme, useTheme } from "./theme";

class DemoCursor extends WidgetType {
  constructor(
    readonly name: string,
    readonly color: string,
  ) {
    super();
  }
  toDOM() {
    const caret = document.createElement("span");
    caret.className = "demo-cursor";
    caret.style.setProperty("--cursor-color", this.color);
    const label = document.createElement("span");
    label.textContent = this.name;
    caret.append(label);
    return caret;
  }
}

export function CodePreview({
  code,
  cursors = [],
}: {
  code: string;
  cursors?: { name: string; color: string; at: number }[];
}) {
  const host = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  useEffect(() => {
    const marks = Decoration.set(
      cursors
        .filter((cursor) => cursor.at >= 0 && cursor.at <= code.length)
        .map((cursor) =>
          Decoration.widget({
            widget: new DemoCursor(cursor.name, cursor.color),
            side: 1,
          }).range(cursor.at),
        ),
      true,
    );
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: code,
        extensions: [
          basicSetup,
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          EditorView.lineWrapping,
          java(),
          createEditorTheme(theme),
          EditorView.decorations.of(marks),
          EditorView.contentAttributes.of({
            "aria-label": "Read-only two-sum example",
          }),
        ],
      }),
    });
    return () => view.destroy();
  }, [code, cursors, theme]);
  return <div className="editor preview-code" ref={host} />;
}
