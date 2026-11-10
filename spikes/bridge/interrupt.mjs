// Scenario 4: interrupt a long answer mid-stream, record what follows, then send one more turn.
import { query, baseOptions, capture, inputStream } from './lib.mjs';

const log = capture('interrupt');
const input = inputStream();
input.push('Write a 1500-word essay about the history of rivers. No tools.');

const q = query({ prompt: input, options: baseOptions({ includePartialMessages: true }) });
let deltas = 0;
let interrupted = false;
let results = 0;
for await (const msg of q) {
  log('message', msg);
  if (msg.type === 'stream_event' && msg.event.delta?.type === 'text_delta') deltas++;
  if (!interrupted && deltas >= 5) {
    interrupted = true;
    log('interrupt.call', { afterDeltas: deltas });
    q.interrupt().then((r) => log('interrupt.return', r ?? null), (e) => log('interrupt.error', String(e)));
  }
  if (msg.type === 'result') {
    results++;
    if (results === 1) input.push('Now just reply: ok');
    else input.end();
  }
}
console.log({ deltasBeforeEnd: deltas, results });
