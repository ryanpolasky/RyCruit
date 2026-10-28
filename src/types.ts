export const languageInfo = {
  python: { label: "Python 3", filename: "main.py" },
  cpp: { label: "C++ 20", filename: "main.cpp" },
  java: { label: "Java 17", filename: "Main.java" },
  javascript: { label: "JavaScript · Node 18", filename: "main.js" },
  typescript: { label: "TypeScript · esbuild 0.17", filename: "main.ts" },
  go: { label: "Go 1.19", filename: "main.go" },
  ruby: { label: "Ruby 3.1", filename: "main.rb" },
  html: { label: "HTML · Live preview", filename: "index.html" },
};
export type Lang = keyof typeof languageInfo;
export type Person = { name: string; color: string; colorLight: string };
export type Result = {
  lang: string;
  by: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  timeMs: number;
  compileError?: boolean;
  at: number;
};
