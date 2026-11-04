// Starts several package.json scripts side by side for development, e.g.
//   bun scripts/dev.ts start:fakeccu start:server:fake start:fe   (bun run dev:fake)
// Each runs as `bun run <name>` (so prestart:fe runs too) in a process group of
// its own; when one exits, the others are stopped with everything they started
// (go run's binary, Vite), and Ctrl+C, Ctrl+Z/fg or closing the terminal reaches
// all of them.
const names = process.argv.slice(2);
if (names.length === 0) {
  console.error('usage: bun scripts/dev.ts <script> [<script> ...]');
  process.exit(1);
}

const children = names.map((name) =>
  Bun.spawn(['bun', 'run', name], { stdio: ['ignore', 'inherit', 'inherit'], detached: true }),
);

const stopAll = (signal: NodeJS.Signals) => {
  for (const child of children) {
    try {
      process.kill(-child.pid, signal);
    } catch {
      // the group has already exited
    }
  }
};

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(signal, () => stopAll(signal));

// Ctrl+Z (SIGTSTP) reaches only dev.ts, the scripts' sessions are out of the
// terminal's reach: stop them too, or they keep running and writing to the
// terminal the shell has taken back. SIGSTOP, as the kernel drops SIGTSTP sent
// to an orphaned group (a session of its own is one); `fg` (SIGCONT) resumes
// them. As in firsttris/haul's scripts/dev.ts.
process.on('SIGTSTP', () => {
  stopAll('SIGSTOP');
  process.kill(process.pid, 'SIGSTOP');
});
process.on('SIGCONT', () => stopAll('SIGCONT'));

const code = await Promise.race(children.map((child) => child.exited));
stopAll('SIGTERM');
await Promise.all(children.map((child) => child.exited));
process.exit(code);
