import { useEffect, useRef } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { autocompletion } from "@codemirror/autocomplete";
import { python } from "@codemirror/lang-python";
import { cpp } from "@codemirror/lang-cpp";
import { javaLanguage } from "@codemirror/lang-java";
import { LanguageSupport } from "@codemirror/language";
import { styleTags, tags } from "@lezer/highlight";
import { yCollab } from "y-codemirror.next";
import type { Lang } from "./types";
import { createEditorTheme, useTheme } from "./theme";
const languages = {
  python,
  cpp,
  java: () =>
    new LanguageSupport(
      javaLanguage.configure({
        props: [
          styleTags({
            "MethodDeclaration/Definition": tags.function(
              tags.definition(tags.variableName),
            ),
            PrimitiveType: tags.keyword,
          }),
        ],
      }),
    ),
};
export function Editor({
  doc,
  provider,
  field,
  lang,
  onRun,
}: {
  doc: Y.Doc;
  provider: WebsocketProvider;
  field: string;
  lang?: Lang;
  onRun: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeSlot = useRef(new Compartment());
  const theme = useTheme();
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const runRef = useRef(onRun);
  runRef.current = onRun;
  useEffect(() => {
    const text = doc.getText(field);
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: text.toString(),
        extensions: [
          basicSetup,
          autocompletion({ activateOnTyping: false, override: [] }),
          EditorView.lineWrapping,
          themeSlot.current.of(createEditorTheme(themeRef.current)),
          ...(lang ? [languages[lang]()] : []),
          yCollab(text, provider.awareness),
          keymap.of([
            {
              key: "Mod-Enter",
              run: () => {
                runRef.current();
                return true;
              },
            },
          ]),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [doc, provider, field, lang]);
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeSlot.current.reconfigure(createEditorTheme(theme)),
    });
  }, [theme]);
  return <div className="editor" ref={host} />;
}
