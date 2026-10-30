import { useSyncExternalStore } from "react";
import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { updateFavicon } from "./brand";

export type Theme = "dark" | "light";
const saved = localStorage.getItem("rycruit.theme");
let current: Theme =
  saved === "dark" || saved === "light"
    ? saved
    : matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
document.documentElement.dataset.theme = current;
updateFavicon(current);
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function useTheme() {
  return useSyncExternalStore(subscribe, () => current);
}
export function toggleTheme() {
  current = current === "dark" ? "light" : "dark";
  localStorage.setItem("rycruit.theme", current);
  document.documentElement.dataset.theme = current;
  updateFavicon(current);
  listeners.forEach((listener) => listener());
}
const palettes = {
  dark: {
    keyword: "#CF8E6D",
    string: "#6AAB73",
    number: "#2AACB8",
    function: "#56A8F5",
    comment: "#7A7E85",
    text: "#BCBEC4",
  },
  light: {
    keyword: "#0033B3",
    string: "#067D17",
    number: "#1750EB",
    function: "#00627A",
    comment: "#8C8C8C",
    text: "#080808",
  },
};
export function createEditorTheme(theme: Theme) {
  const colors = palettes[theme];
  return [
    EditorView.theme(
      {
        "&": {
          height: "100%",
          background: "var(--editor)",
          color: "var(--editor-text)",
        },
        ".cm-scroller": {
          overflow: "auto",
          fontFamily: "var(--mono)",
          fontSize: "13px",
          lineHeight: "1.8",
        },
        ".cm-content": { padding: "20px 0", caretColor: "var(--caret)" },
        ".cm-gutters": {
          background: "var(--editor)",
          color: "var(--line-number)",
          border: "none",
          paddingRight: "16px",
        },
        ".cm-activeLine, .cm-activeLineGutter": {
          background: "var(--active-line)",
        },
        ".cm-activeLineGutter": { color: "var(--line-number-active)" },
        "&:has(.cm-selectionBackground) .cm-activeLine": {
          background: "transparent",
        },
        ".cm-line:has(.cm-ySelectionCaret)": { paddingTop: "22px" },
        "&.cm-focused .cm-cursor": { borderLeftColor: "var(--caret)" },
        ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
          background: "var(--selection)",
        },
        "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground":
          {
            background: "var(--selection)",
          },
        ".cm-foldPlaceholder": {
          background: "var(--surface)",
          color: "var(--muted)",
          borderColor: "var(--border)",
        },
        ".cm-tooltip": {
          background: "var(--surface)",
          color: "var(--text)",
          border: "1px solid var(--border)",
        },
        ".cm-panels": { background: "var(--surface)", color: "var(--text)" },
        ".cm-ySelectionInfo": {
          fontFamily: "var(--ui)",
          fontSize: "11px",
          padding: "3px 6px",
          borderRadius: "3px",
          color: "#FFFFFF",
          opacity: "1",
          top: "-1.8em",
          left: "0",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.25)",
        },
      },
      { dark: theme === "dark" },
    ),
    syntaxHighlighting(
      HighlightStyle.define([
        { tag: tags.keyword, color: colors.keyword },
        { tag: [tags.string, tags.character], color: colors.string },
        { tag: tags.number, color: colors.number },
        { tag: [tags.bool, tags.null], color: colors.keyword },
        {
          tag: tags.function(tags.definition(tags.variableName)),
          color: colors.function,
        },
        {
          tag: [
            tags.function(tags.variableName),
            tags.function(tags.propertyName),
          ],
          color: theme === "dark" ? "#57AAF7" : colors.text,
        },
        {
          tag: [tags.typeName, tags.className, tags.namespace],
          color: colors.text,
        },
        {
          tag: [tags.comment, tags.meta],
          color: colors.comment,
          ...(theme === "light" ? { fontStyle: "italic" } : {}),
        },
        {
          tag: [
            tags.variableName,
            tags.propertyName,
            tags.operator,
            tags.punctuation,
          ],
          color: colors.text,
        },
      ]),
    ),
  ];
}
