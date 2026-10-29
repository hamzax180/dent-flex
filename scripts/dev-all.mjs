// Development: run the Next.js app and the automation worker together, with prefixed output.
// Stopping this process (Ctrl+C) stops both. Production runs them as separate services.
import { spawn } from "node:child_process";

const procs = [
  ["web", "npx", ["next", "dev"]],
  ["worker", "npx", ["tsx", "watch", "--clear-screen=false", "src/worker/index.ts"]],
].map(([name, cmd, args]) => {
  const child = spawn(cmd, args, { shell: process.platform === "win32", env: process.env });
  const tag = name === "web" ? "\x1b[36m[web]\x1b[0m " : "\x1b[35m[worker]\x1b[0m ";
  const pipe = (stream, out) =>
    stream.on("data", (buf) => {
      for (const line of buf.toString().split(/\r?\n/)) if (line) out.write(tag + line + "\n");
    });
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on("exit", (code) => {
    console.log(`${tag}exited with code ${code}`);
    shutdown(code ?? 0);
  });
  return child;
});

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const p of procs) if (!p.killed) p.kill("SIGTERM");
  setTimeout(() => process.exit(code), 1500);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
