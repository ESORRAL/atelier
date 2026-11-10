// Scenario 7: kill the Node process mid-answer, check whether its `claude` child survives.
// Parent mode spawns this same file with --victim (attached, not detached), once per signal.
import { execSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { query, baseOptions, capture, CLAUDE } from './lib.mjs';

if (process.argv[2] === '--victim') {
  let announced = false;
  for await (const msg of query({
    prompt: 'Write a 1500-word essay about the history of rivers. No tools.',
    options: baseOptions({ includePartialMessages: true }),
  })) {
    if (!announced && msg.type === 'stream_event' && msg.event.delta?.type === 'text_delta') {
      announced = true;
      process.stdout.write('STREAMING\n');
    }
  }
  process.exit(0);
}

const log = capture('kill');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const children = (pid) => {
  try { return execSync(`pgrep -P ${pid}`).toString().trim().split('\n').map(Number); } catch { return []; }
};
const pgrep = () => { try { return execSync(`pgrep -f "${CLAUDE}"`).toString().trim().split('\n').map(Number); } catch { return []; } };

const outcome = {};
for (const signal of ['SIGTERM', 'SIGKILL']) {
  const victim = spawn(process.execPath, [fileURLToPath(import.meta.url), '--victim'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve, reject) => {
    victim.stdout.on('data', (b) => b.toString().includes('STREAMING') && resolve());
    victim.on('exit', () => reject(new Error('victim exited before streaming')));
  });
  const claudePids = children(victim.pid).filter((p) => pgrep().includes(p));
  log('before.kill', { signal, nodePid: victim.pid, claudePids });
  victim.kill(signal);
  const checks = [];
  for (const wait of [500, 2000, 5000]) {
    await sleep(wait - (checks.at(-1)?.wait ?? 0));
    checks.push({ wait, nodeAlive: alive(victim.pid), claudeAlive: claudePids.map(alive),
      inPgrep: claudePids.filter((p) => pgrep().includes(p)) });
  }
  log('after.kill', { signal, checks });
  outcome[signal] = checks.at(-1);
  // Clean up our own orphans so the spike leaves nothing behind.
  for (const p of claudePids) if (alive(p)) process.kill(p, 'SIGKILL');
}
log('summary', outcome);
console.log(outcome);
