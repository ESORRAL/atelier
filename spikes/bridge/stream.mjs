// Scenario 1: simple prompt with partial messages; record every message type.
import { query, baseOptions, capture } from './lib.mjs';

const log = capture('stream');
const types = {};
for await (const msg of query({
  prompt: 'Reply with exactly: hello from haiku',
  options: baseOptions({ includePartialMessages: true }),
})) {
  const key = msg.type + (msg.subtype ? `/${msg.subtype}` : '') + (msg.event ? `:${msg.event.type}` : '');
  types[key] = (types[key] ?? 0) + 1;
  log('message', msg);
}
log('summary', types);
console.log(types);
