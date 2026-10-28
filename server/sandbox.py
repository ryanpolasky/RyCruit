import json, os, re, signal, subprocess, sys, tempfile, time, resource

LIMIT = 65536

def execute(command, stdin, seconds, managed=False):
    start = time.monotonic()
    def limits():
        resource.setrlimit(resource.RLIMIT_FSIZE, (16 * 1024 * 1024, 16 * 1024 * 1024))
        if not managed:
            resource.setrlimit(resource.RLIMIT_AS, (256 * 1024 * 1024, 256 * 1024 * 1024))
    with tempfile.TemporaryFile() as out, tempfile.TemporaryFile() as err:
        process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=out, stderr=err, start_new_session=True, preexec_fn=limits)
        timed_out = False
        try:
            process.communicate(stdin.encode(), timeout=seconds)
        except subprocess.TimeoutExpired:
            timed_out = True
        finally:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.wait()
        out.seek(0)
        err.seek(0)
        stdout = out.read(LIMIT + 1)
        stderr = err.read(LIMIT + 1)
        combined = len(stdout) + len(stderr)
        stdout = stdout[:LIMIT]
        stderr = stderr[:max(0, LIMIT - len(stdout))]
        if combined > LIMIT:
            stderr += b'\n[output truncated at 64KB]'
        if timed_out:
            stderr += b'\n[time limit exceeded]'
        return dict(stdout=stdout.decode(errors='replace'), stderr=stderr.decode(errors='replace'), exitCode=124 if timed_out else process.returncode, timeMs=round((time.monotonic()-start)*1000))

def run(request):
    lang, code, stdin = request['lang'], request['code'], request.get('stdin', '')
    with tempfile.TemporaryDirectory(prefix='rycruit-', dir='/tmp') as directory:
        os.chdir(directory)
        compile_command = None
        if lang == 'python':
            filename, command = 'main.py', ['python3', '-I', '-u', 'main.py']
        elif lang == 'cpp':
            filename, command = 'main.cpp', ['./main']
            compile_command = ['g++', '-O2', '-std=c++20', filename, '-o', 'main']
        elif lang == 'java':
            public = re.search(r'public\s+(?:(?:final|abstract)\s+)?class\s+(\w+)', code)
            filename = (public.group(1) if public else 'Main') + '.java'
            classes = list(re.finditer(r'\bclass\s+(\w+)', code))
            main = re.search(r'public\s+static\s+void\s+main\s*\(', code)
            candidates = [c.group(1) for c in classes if main and c.start() < main.start()]
            target = candidates[-1] if candidates else 'Main'
            flags = ['-Xms16m', '-Xmx128m', '-XX:MaxMetaspaceSize=64m', '-XX:ReservedCodeCacheSize=32m', '-XX:+UseSerialGC', '-XX:ActiveProcessorCount=1']
            command = ['java', *flags, target]
            compile_command = ['javac', *['-J'+flag for flag in flags], filename]
        elif lang == 'javascript':
            filename, command = 'main.js', ['node', '--max-old-space-size=128', 'main.js']
        elif lang == 'typescript':
            filename, command = 'main.ts', ['node', '--max-old-space-size=128', 'main.js']
            compile_command = ['esbuild', filename, '--platform=node', '--format=cjs', '--outfile=main.js']
        elif lang == 'go':
            filename, command = 'main.go', ['./main']
            os.environ.update(GOCACHE=directory+'/go-cache', GOPATH=directory+'/go', GO111MODULE='off', GOPROXY='off', GOTOOLCHAIN='local', GOMAXPROCS='1', GOMEMLIMIT='128MiB')
            compile_command = ['go', 'build', '-p=1', '-o', 'main', filename]
        elif lang == 'ruby':
            filename, command = 'main.rb', ['ruby', 'main.rb']
        else:
            raise ValueError('Unsupported language')
        with open(filename, 'w') as source:
            source.write(code)
        if compile_command:
            compiled = execute(compile_command, '', 10, managed=lang in ('java', 'go', 'typescript'))
            if compiled['exitCode'] != 0:
                return dict(compiled, compileError=True)
        return execute(command, stdin, 5, managed=lang in ('java', 'go', 'javascript', 'typescript'))

try:
    print(json.dumps(run(json.load(sys.stdin))))
except Exception as error:
    print(json.dumps(dict(stdout='', stderr=str(error), exitCode=1, timeMs=0)))
