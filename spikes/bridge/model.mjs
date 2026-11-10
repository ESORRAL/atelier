// Scenario 5: list available models, then switch model mid-session (streaming input mode).
import { query, baseOptions, capture, inputStream } from './lib.mjs';

const log = capture('model');
const input = inputStream();
input.push('Reply with one word: ready');

const q = query({ prompt: input, options: baseOptions() });
log('supportedModels', await q.supportedModels());

let results = 0;
const seen = [];
for await (const msg of q) {
  log('message', msg);
  if (msg.type === 'system' && msg.subtype === 'init') seen.push({ init: msg.model });
  if (msg.type === 'assistant') seen.push({ assistant: msg.message.model });
  if (msg.type !== 'result') continue;
  results++;
  seen.push({ resultModelUsage: Object.keys(msg.modelUsage) });
  if (results === 1) {
    log('setModel.return', (await q.setModel('sonnet')) ?? null);
    input.push('Reply with one word: switched');
  } else input.end();
}
log('summary', seen);
console.log(seen);
