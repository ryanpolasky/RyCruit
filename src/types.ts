export type Lang = "python" | "cpp" | "java";
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
