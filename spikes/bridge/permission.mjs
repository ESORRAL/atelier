// Scenario 2: canUseTool denies the first request, allows the next one.
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { query, baseOptions, capture, inputStream, SANDBOX } from './lib.mjs';

const log = capture('permission');
const target = join(SANDBOX, 'permission.txt');
rmSync(target, { force: true });

let calls = 0;
const input = inputStream();
input.push('Use the Write tool to create permission.txt containing the word hi. Do nothing else.');

const q = query({
  prompt: input,
  options: baseOptions({
    canUseTool: async (toolName, toolInput, opts) => {
      calls++;
      const { signal, ...rest } = opts;
      log('canUseTool', { call: calls, toolName, input: toolInput, options: rest, aborted: signal.aborted });
      const answer = calls === 1
        ? { behavior: 'deny', message: 'User refused this time.' }
        : { behavior: 'allow', updatedInput: toolInput };
      log('canUseTool.answer', answer);
      return answer;
    },
  }),
});

let results = 0;
for await (const msg of q) {
  log('message', msg);
  if (msg.type === 'result') {
    results++;
    log('file', { afterResult: results, exists: existsSync(target) });
    if (results === 1 && calls < 2) input.push('I changed my mind, please try the Write again.');
    else input.end();
  }
}
console.log({ canUseToolCalls: calls, results, fileExists: existsSync(target) });
