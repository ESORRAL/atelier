// Fake bridge for tests/claude.rs: replays contracts/bridge-protocol.md without the SDK.
// User text "perm" asks one permission; "crash" asks one then dies; "mute-models" holds the next
// `list_models` and answers it late (models "late"), just before the following one. "freeze" stops
// reading stdin, then writes one more line after 300 ms. Spawns a `sleep` grandchild
// so the test can check the whole process group is gone.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const send = (m) => process.stdout.write(JSON.stringify(m) + '\n');
const sleeper = spawn('sleep', ['60'], { stdio: 'ignore' });
let turn = 0;
let onPermission = null;
let muteModels = false;
let held = null;

const sdk = (message) => send({ type: 'sdk', message: { session_id: 'fake-sess', ...message } });
const finish = (text) => {
  sdk({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text } } });
  sdk({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
  sdk({ type: 'result', subtype: 'success', total_cost_usd: 0.01 * turn });
};
const ask = () => send({
  type: 'permission_request', requestId: `r${turn}`, toolName: 'Bash', input: { command: 'ls' },
  toolUseID: `tu${turn}`, canAlways: true,
});

send({ type: 'ready', sdkVersion: 'fake' });
const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const m = JSON.parse(line);
  if (m.type === 'user') {
    turn += 1;
    sdk({ type: 'system', subtype: 'init', model: 'fake-model', pids: [process.pid, sleeper.pid] });
    if (m.text === 'freeze') {
      rl.pause();
      process.stdin.pause();
      setTimeout(() => sdk({ type: 'assistant', message: { content: [] } }), 300);
    } else if (m.text === 'crash') { ask(); setTimeout(() => process.exit(3), 50); }
    else if (m.text === 'perm') { ask(); onPermission = (r) => finish(`perm ${r.decision}`); }
    else { muteModels = m.text === 'mute-models'; finish(`echo ${m.text}`); }
  } else if (m.type === 'permission_response') {
    onPermission?.(m);
    onPermission = null;
  } else if (m.type === 'list_models') {
    if (muteModels) { muteModels = false; held = m.requestId; return; }
    if (held) { send({ type: 'models', requestId: held, models: [{ value: 'late' }] }); held = null; }
    send({ type: 'models', requestId: m.requestId, models: [{ value: 'haiku', displayName: 'Haiku' }] });
  } else if (m.type === 'close') {
    send({ type: 'closed' });
    process.exit(0);
  }
});
