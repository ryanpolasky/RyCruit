import assert from "node:assert/strict";
import { runCode } from "../server/runner.js";
const programs = {
  python: 'import sys\nprint("hello")\nprint(sys.stdin.read(), end="")',
  cpp: '#include <iostream>\nint main(){std::cout << "hello\\n" << std::cin.rdbuf();}',
  java: 'public class Interview { public static void main(String[] args) throws Exception { System.out.println("hello"); System.in.transferTo(System.out); } }',
};
for (const mode of process.env.RUNNER
  ? [process.env.RUNNER]
  : ["local", "docker"]) {
  for (const [lang, code] of Object.entries(programs)) {
    for (const stdin of ["", "echo from stdin\n"]) {
      const result = await runCode({ lang, code, stdin }, mode);
      assert.equal(result.exitCode, 0, JSON.stringify(result));
      assert.equal(result.stdout, "hello\n" + stdin);
      console.log(
        `PASS ${mode} ${lang} hello${stdin ? " + stdin echo" : " (empty stdin)"}`,
      );
    }
  }
  const timeout = await runCode(
    { lang: "python", code: "while True: pass" },
    mode,
  );
  assert.equal(timeout.exitCode, 124);
  assert.match(timeout.stderr, /time limit exceeded/);
  console.log(
    `PASS ${mode} infinite loop: exit ${timeout.exitCode}, ${timeout.timeMs}ms`,
  );
  const compile = await runCode(
    { lang: "cpp", code: "this is not valid C++" },
    mode,
  );
  assert.equal(compile.compileError, true);
  assert.notEqual(compile.exitCode, 0);
  console.log(
    `PASS ${mode} compile error: compileError=${compile.compileError}`,
  );
  const truncated = await runCode(
    { lang: "python", code: 'print("x" * 100000)' },
    mode,
  );
  assert.match(truncated.stderr, /output truncated/);
  console.log(`PASS ${mode} output truncated at 64KB`);
}
