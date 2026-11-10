// Scenario 6: finish a session, resume it by id, check the context survived.
import { query, baseOptions, capture } from './lib.mjs';

const log = capture('resume');
async function run(label, prompt, extra) {
  let sessionId, result;
  for await (const msg of query({ prompt, options: baseOptions(extra) })) {
    log(`${label}.message`, msg);
    if (msg.type === 'system' && msg.subtype === 'init') sessionId = msg.session_id;
    if (msg.type === 'result') result = msg.result;
  }
  return { sessionId, result };
}

const first = await run('first', 'Remember the code word PELICAN-42. Reply only: noted');
const second = await run('resumed', 'What was the code word? Reply with it only.', { resume: first.sessionId });
const summary = { first, second, sameSessionId: first.sessionId === second.sessionId,
  contextKept: /PELICAN-42/.test(second.result ?? '') };
log('summary', summary);
console.log(summary);
