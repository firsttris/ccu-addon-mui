// @vitest-environment node
import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const DEV = path.resolve(__dirname, 'dev.ts');

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const waitFor = async (check: () => boolean, ms: number) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return check();
};

describe('scripts/dev.ts', () => {
  let dir = '';
  let dev: ChildProcess | undefined;
  const pids: number[] = [];

  afterEach(() => {
    for (const pid of pids) if (alive(pid)) process.kill(pid, 'SIGKILL');
    pids.length = 0;
    if (dev?.pid && alive(dev.pid)) dev.kill('SIGKILL');
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  // Closing the terminal sends SIGHUP; the scripts run in process groups of
  // their own, so only dev.ts can pass it on (concurrently did as well)
  it('stops the scripts it started when it gets SIGHUP', async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'mui-dev-'));
    writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        name: 'dev-test',
        scripts: { a: 'echo $$ > a.pid && exec sleep 300', b: 'echo $$ > b.pid && exec sleep 300' },
      }),
    );
    dev = spawn('bun', [DEV, 'a', 'b'], { cwd: dir, stdio: 'ignore' });
    const pidFiles = ['a.pid', 'b.pid'].map((name) => path.join(dir, name));
    const started = await waitFor(
      () => pidFiles.every((file) => existsSync(file) && readFileSync(file, 'utf8').trim() !== ''),
      10_000,
    );
    expect(started).toBe(true);
    for (const file of pidFiles) pids.push(Number(readFileSync(file, 'utf8')));

    dev.kill('SIGHUP');

    const stopped = await waitFor(() => pids.every((pid) => !alive(pid)), 5_000);
    expect(pids.filter(alive)).toEqual([]);
    expect(stopped).toBe(true);
  }, 20_000);
});
