import assert from "node:assert/strict";
import { runCode } from "../server/runner.js";
const programs = {
  javascript:
    'const fs = require("node:fs"); console.log("hello"); process.stdout.write(fs.readFileSync(0,"utf8"));',
  typescript:
    'const fs = require("node:fs"); const greeting: string = "hello"; console.log(greeting); process.stdout.write(fs.readFileSync(0,"utf8"));',
  go: 'package main\nimport("fmt";"io";"os")\nfunc main(){fmt.Println("hello");io.Copy(os.Stdout,os.Stdin)}',
  ruby: 'puts "hello"; print STDIN.read',
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
  const loops = {
    python: "while True: pass",
    javascript: "while (true) {}",
    typescript: "while (true) {}",
    go: "package main\nfunc main(){for {}}",
    ruby: "loop {}",
    cpp: "int main(){while(true){}}",
    java: "class Main {public static void main(String[] args){while(true){}}}",
  };
  for (const [lang, code] of Object.entries(loops)) {
    const timeout = await runCode({ lang, code }, mode);
    assert.equal(timeout.exitCode, 124);
    assert.match(timeout.stderr, /time limit exceeded/);
    console.log(
      `PASS ${mode} ${lang} infinite loop: exit ${timeout.exitCode}, ${timeout.timeMs}ms`,
    );
  }
  for (const [lang, code] of Object.entries({
    cpp: "this is not valid C++",
    typescript: "const value: = 1",
    go: "package main\nfunc main( {",
  })) {
    const compile = await runCode({ lang, code }, mode);
    assert.equal(compile.compileError, true);
    assert.notEqual(compile.exitCode, 0);
    console.log(
      `PASS ${mode} ${lang} compile error: compileError=${compile.compileError}`,
    );
  }
  await assert.rejects(
    runCode({ lang: "html", code: "<h1>Hello</h1>" }, mode),
    /live preview/,
  );
  console.log(`PASS ${mode} HTML rejected by runner`);
  const truncated = await runCode(
    { lang: "python", code: 'print("x" * 100000)' },
    mode,
  );
  assert.match(truncated.stderr, /output truncated/);
  console.log(`PASS ${mode} output truncated at 64KB`);
}
