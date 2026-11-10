// Manual real test (network, subscription): node bridge/smoke.mjs. Not run by `node --test`.
import { execSync, spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const claudePath = execSync('which claude').toString().trim();
const cwd = mkdtempSync(join(tmpdir(), 'atelier-smoke-'));
const child = spawn(process.execPath, [new URL('./main.mjs', import.meta.url).pathname], { stdio: ['pipe', 'pipe', 'inherit'] });
const send = (m) => child.stdin.write(JSON.stringify(m) + '\n');

createInterface({ input: child.stdout }).on('line', (line) => {
  const m = JSON.parse(line);
  console.log(m.type, m.type === 'sdk' ? `${m.message.type}/${m.message.subtype ?? ''}` : '');
  if (m.type === 'ready') {
    send({ type: 'start', cwd, claudePath, model: 'haiku', permissionMode: 'default' });
    send({ type: 'user', text: 'Reply with the single word: pong' });
  }
  if (m.type === 'sdk' && m.message.type === 'result') {
    console.log('result:', m.message.subtype, JSON.stringify(m.message.result));
    send({ type: 'close' });
  }
  if (m.type === 'error') console.log('error:', m.message, m.fatal);
});
child.on('exit', (code) => console.log('bridge exit code', code));
