// Scenario 3: answer with the suggestions ("always allow"), find where the rule lands,
// then check the identical request skips canUseTool (same session, then a fresh session).
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { query, baseOptions, capture, inputStream, SANDBOX } from './lib.mjs';

const log = capture('always');
const git = (args) => resolve(SANDBOX, execSync(`git ${args}`, { cwd: SANDBOX }).toString().trim());
const worktreeRoot = git('rev-parse --show-toplevel');
const mainRoot = resolve(git('rev-parse --git-common-dir'), '..');
// Settings files a rule could be written to. User settings: hash only, content never logged.
const files = {
  sandboxLocal: join(SANDBOX, '.claude', 'settings.local.json'),
  worktreeLocal: join(worktreeRoot, '.claude', 'settings.local.json'),
  mainCheckoutLocal: join(mainRoot, '.claude', 'settings.local.json'),
  user: join(homedir(), '.claude', 'settings.json'),
};
const snap = () => Object.fromEntries(Object.entries(files).map(([k, f]) => [k,
  existsSync(f) ? createHash('sha1').update(readFileSync(f)).digest('hex').slice(0, 10) : null]));
const dump = (k) => (k !== 'user' && existsSync(files[k]) ? JSON.parse(readFileSync(files[k], 'utf8')) : undefined);

rmSync(join(SANDBOX, 'always.txt'), { force: true });
const before = snap();
log('settings.before', { hashes: before, mainCheckoutLocal: dump('mainCheckoutLocal') });

const CMD = 'touch always.txt';
let calls = 0;
const canUseTool = async (toolName, toolInput, { signal, ...rest }) => {
  calls++;
  log('canUseTool', { call: calls, toolName, input: toolInput, options: rest });
  const answer = { behavior: 'allow', updatedInput: toolInput, updatedPermissions: rest.suggestions ?? [] };
  log('canUseTool.answer', answer);
  return answer;
};

// Session A: two identical requests.
const input = inputStream();
input.push(`Run this exact Bash command and nothing else: ${CMD}`);
let results = 0;
for await (const msg of query({ prompt: input, options: baseOptions({ canUseTool }) })) {
  log('message', msg);
  if (msg.type !== 'result') continue;
  results++;
  const after = snap();
  const changed = Object.keys(files).filter((k) => after[k] !== before[k]);
  log('settings.after', { session: 'A', turn: results, canUseToolCalls: calls, changed,
    contents: Object.fromEntries(changed.map((k) => [k, dump(k)])) });
  if (results === 1) input.push(`Run the exact same Bash command again: ${CMD}`);
  else input.end();
}
const callsA = calls;

// Session B: fresh session (no session-scoped mode), same request.
for await (const msg of query({
  prompt: `Run this exact Bash command and nothing else: ${CMD}`,
  options: baseOptions({ canUseTool }),
})) {
  log('message', msg);
  if (msg.type === 'result') log('settings.after', { session: 'B', canUseToolCalls: calls });
}
const summary = { canUseToolCallsSessionA: callsA, canUseToolCallsSessionB: calls - callsA,
  ruleFile: files.mainCheckoutLocal, ruleWasAlreadyThere: before.mainCheckoutLocal !== null };
log('summary', summary);
console.log(summary);
