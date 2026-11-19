import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createBridge } from './main.mjs';

const tick = () => new Promise((r) => setImmediate(r));

// Fake SDK query: records calls, lets the test emit messages and trigger canUseTool.
function setup() {
  const out = [];
  const exits = [];
  const fake = { calls: [], options: null, prompt: null, emit: null, finish: null };
  const query = ({ prompt, options }) => {
    fake.prompt = prompt;
    fake.options = options;
    const queue = [];
    let wake;
    let done = false;
    fake.emit = (m) => { queue.push(m); wake?.(); };
    fake.finish = () => { done = true; wake?.(); };
    return {
      async *[Symbol.asyncIterator]() {
        while (true) {
          while (queue.length) yield queue.shift();
          if (done) return;
          await new Promise((r) => (wake = r));
        }
      },
      interrupt: async () => { fake.calls.push(['interrupt']); return { still_queued: [] }; },
      setModel: async (m) => { fake.calls.push(['setModel', m]); },
      setPermissionMode: async (m) => { fake.calls.push(['setPermissionMode', m]); },
      applyFlagSettings: async (s) => { fake.calls.push(['applyFlagSettings', s]); },
      supportedModels: async () => [{ value: 'haiku' }],
      close: () => { fake.calls.push(['close']); fake.finish(); },
    };
  };
  const bridge = createBridge({ query, sdkVersion: '0.3.322', send: (m) => out.push(m), exit: (c) => exits.push(c) });
  const send = (m) => bridge.handleLine(typeof m === 'string' ? m : JSON.stringify(m));
  const start = (extra = {}) => send({ type: 'start', cwd: '/w', claudePath: '/bin/claude', permissionMode: 'default', ...extra });
  const last = (type) => out.filter((m) => m.type === type).at(-1);
  return { out, exits, fake, bridge, send, start, last };
}

const BASH_SUGGESTIONS = [
  { type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'touch a' }], behavior: 'allow', destination: 'localSettings' },
  { type: 'addDirectories', directories: ['/w'], destination: 'session' },
  { type: 'setMode', mode: 'acceptEdits', destination: 'session' },
];

function ask(fake, { suggestions = BASH_SUGGESTIONS, requestId = 'r1', signal } = {}) {
  return fake.options.canUseTool('Bash', { command: 'touch a' }, {
    signal: signal ?? new AbortController().signal, suggestions, requestId,
    toolUseID: 'tu1', displayName: 'Bash', description: 'touch', blockedPath: '/w/a',
  });
}

test('effort: start option, set_effort at runtime, null resets, anything else is refused', async () => {
  const t = setup();
  t.start({ effort: 'xhigh' });
  assert.equal(t.fake.options.effort, 'xhigh');
  t.send({ type: 'set_effort', effort: 'low' });
  t.send({ type: 'set_effort', effort: null });
  await tick();
  assert.deepEqual(t.fake.calls.filter((c) => c[0] === 'applyFlagSettings'), [['applyFlagSettings', { effortLevel: 'low' }], ['applyFlagSettings', { effortLevel: null }]]);
  for (const effort of ['ultra', '', 5, undefined]) {
    t.send({ type: 'set_effort', effort });
    assert.match(t.last('error').message, /invalid effort/);
  }
  const bad = setup();
  bad.start({ effort: 'ultra' });
  assert.equal(bad.fake.options, null);
  assert.match(bad.last('error').message, /invalid effort/);
  const none = setup();
  none.start();
  assert.equal('effort' in none.fake.options, false);
});

test('user turn with pictures: image blocks first, then the text; bad pictures never reach the SDK', async () => {
  const t = setup();
  t.start();
  const it = t.fake.prompt[Symbol.asyncIterator]();
  t.send({ type: 'user', text: 'regarde', images: [{ mediaType: 'image/png', data: 'iVBORw0KGgo=' }, { mediaType: 'image/jpeg', data: 'AAAA' }] });
  const { value } = await it.next();
  assert.deepEqual(value.message.content, [
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' } },
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } },
    { type: 'text', text: 'regarde' },
  ]);
  for (const images of [[{ mediaType: 'image/svg+xml', data: 'AAAA' }], [{ mediaType: 'image/png', data: 'A A' }], [{ mediaType: 'image/png' }], 'x',
    Array.from({ length: 6 }, () => ({ mediaType: 'image/png', data: 'AAAA' }))]) {
    t.send({ type: 'user', text: 'x', images });
    assert.equal(t.last('error').message, 'invalid images');
  }
  t.send({ type: 'user', text: 'plain' });
  assert.equal((await it.next()).value.message.content, 'plain');
});

test('read-only Bash inside the session folders is allowed without asking; the rest still asks', async () => {
  const t = setup();
  t.start({ cwd: '/w', readRoots: ['/v', 'relative', 7] });
  const opts = { signal: new AbortController().signal, suggestions: [], toolUseID: 'tu', displayName: 'Bash' };
  const bash = (command, extra = {}) => t.fake.options.canUseTool('Bash', { command, ...extra }, { ...opts, requestId: `r-${command}` });
  assert.deepEqual(await bash('cd /v ; cat a.md | head -3'), { behavior: 'allow', updatedInput: { command: 'cd /v ; cat a.md | head -3' } });
  assert.equal(t.out.some((m) => m.type === 'permission_request'), false);
  const asked = bash('cat /v/a.md > /w/x'); // a write: a permission_request goes to the UI
  const elsewhere = bash('cat /etc/passwd');
  const unsandboxed = bash('ls', { dangerouslyDisableSandbox: true });
  await tick();
  assert.deepEqual(t.out.filter((m) => m.type === 'permission_request').map((m) => m.input.command), ['cat /v/a.md > /w/x', 'cat /etc/passwd', 'ls']);
  for (const id of ['r-cat /v/a.md > /w/x', 'r-cat /etc/passwd', 'r-ls']) t.send({ type: 'permission_response', requestId: id, decision: 'deny' });
  assert.equal((await Promise.all([asked, elsewhere, unsandboxed])).every((r) => r.behavior === 'deny'), true);
  // Other tools are never auto-allowed by this rule.
  const write = t.fake.options.canUseTool('Write', { file_path: '/v/a.md', content: 'x' }, { ...opts, requestId: 'w1' });
  await tick();
  assert.equal(t.last('permission_request').toolName, 'Write');
  t.send({ type: 'permission_response', requestId: 'w1', decision: 'deny' });
  await write;
});

test('ready, start options, sdk passthrough, user turn', async () => {
  const t = setup();
  assert.deepEqual(t.out[0], { type: 'ready', sdkVersion: '0.3.322' });
  t.start({ model: 'haiku', resume: 's1' });
  const { canUseTool, ...opts } = t.fake.options;
  assert.equal(typeof canUseTool, 'function');
  assert.deepEqual(opts, {
    cwd: '/w', pathToClaudeCodeExecutable: '/bin/claude', permissionMode: 'default', model: 'haiku',
    resume: 's1', includePartialMessages: true, forwardSubagentText: true,
  });
  const msg = { type: 'system', subtype: 'init', session_id: 's1', uuid: 'u', extra: { a: 1 } };
  t.fake.emit(msg);
  await tick();
  assert.deepEqual(t.last('sdk'), { type: 'sdk', message: msg });
  t.send({ type: 'user', text: 'hi' });
  const it = t.fake.prompt[Symbol.asyncIterator]();
  assert.deepEqual((await it.next()).value, { type: 'user', message: { role: 'user', content: 'hi' }, parent_tool_use_id: null });
});

test('control messages reach the SDK; list_models answers models', async () => {
  const t = setup();
  t.start();
  t.send({ type: 'interrupt' });
  t.send({ type: 'set_model', model: 'sonnet' });
  t.send({ type: 'set_permission_mode', mode: 'plan' });
  t.send({ type: 'list_models', requestId: 'm1' });
  await tick();
  assert.deepEqual(t.fake.calls, [['interrupt'], ['setModel', 'sonnet'], ['setPermissionMode', 'plan']]);
  assert.deepEqual(t.last('models'), { type: 'models', requestId: 'm1', models: [{ value: 'haiku' }] });
  assert.equal(t.last('error'), undefined);
});

test('list_models without requestId is a non-fatal error', async () => {
  const t = setup();
  t.start();
  t.send({ type: 'list_models' });
  await tick();
  assert.equal(t.last('models'), undefined);
  assert.deepEqual(t.last('error'), { type: 'error', message: 'list_models requires requestId', fatal: false });
});

test('invalid permissionMode is a non-fatal error and never reaches the SDK', async () => {
  const t = setup();
  for (const mode of ['bypassPermissions', 'dontAsk', 'Auto', undefined]) {
    t.start({ permissionMode: mode });
    assert.equal(t.fake.options, null);
    assert.equal(t.last('error').fatal, false);
  }
  t.start();
  for (const mode of ['bypassPermissions', 'dontAsk']) t.send({ type: 'set_permission_mode', mode });
  await tick();
  assert.deepEqual(t.fake.calls, []);
  assert.equal(t.out.filter((m) => m.type === 'error').length, 6);
  assert.ok(t.out.every((m) => m.type !== 'error' || m.fatal === false));
});

test('invalid line or unknown type: non-fatal error, bridge keeps going', async () => {
  const t = setup();
  t.send('{not json');
  t.send({ type: 'nope' });
  t.send({ type: 'user', text: 'early' });
  assert.deepEqual(t.out.slice(1).map((m) => [m.type, m.fatal]), [['error', false], ['error', false], ['error', false]]);
  t.start();
  assert.ok(t.fake.options);
  assert.deepEqual(t.exits, []);
});

test('permission cycle: request fields, allow_once', async () => {
  const t = setup();
  t.start();
  const answer = ask(t.fake);
  assert.deepEqual(t.last('permission_request'), {
    type: 'permission_request', requestId: 'r1', toolName: 'Bash', input: { command: 'touch a' }, toolUseID: 'tu1',
    displayName: 'Bash', description: 'touch', blockedPath: '/w/a', canAlways: true,
  });
  t.send({ type: 'permission_response', requestId: 'r1', decision: 'allow_once' });
  assert.deepEqual(await answer, { behavior: 'allow', updatedInput: { command: 'touch a' } });
});

test('allow_always returns only addRules suggestions', async () => {
  const t = setup();
  t.start();
  const answer = ask(t.fake);
  t.send({ type: 'permission_response', requestId: 'r1', decision: 'allow_always' });
  assert.deepEqual(await answer, { behavior: 'allow', updatedInput: { command: 'touch a' }, updatedPermissions: [BASH_SUGGESTIONS[0]] });
});

test('allow_always refused when canAlways is false; request stays pending', async () => {
  const t = setup();
  t.start();
  const answer = ask(t.fake, { suggestions: [BASH_SUGGESTIONS[2]] });
  assert.equal(t.last('permission_request').canAlways, false);
  t.send({ type: 'permission_response', requestId: 'r1', decision: 'allow_always' });
  assert.equal(t.last('error').fatal, false);
  t.send({ type: 'permission_response', requestId: 'r1', decision: 'deny' });
  assert.deepEqual(await answer, { behavior: 'deny', message: "Refusé par l'utilisateur" });
});

test('deny with message, unknown requestId, bad decision', async () => {
  const t = setup();
  t.start();
  const answer = ask(t.fake);
  t.send({ type: 'permission_response', requestId: 'zzz', decision: 'deny' });
  t.send({ type: 'permission_response', requestId: 'r1', decision: 'maybe' });
  assert.equal(t.out.filter((m) => m.type === 'error').length, 2);
  t.send({ type: 'permission_response', requestId: 'r1', decision: 'deny', message: 'no' });
  assert.deepEqual(await answer, { behavior: 'deny', message: 'no' });
});

test('interrupt or SDK abort cancels pending requests', async () => {
  const t = setup();
  t.start();
  const a = ask(t.fake, { requestId: 'r1' });
  t.send({ type: 'interrupt' });
  assert.equal((await a).behavior, 'deny');
  assert.deepEqual(t.last('permission_cancelled'), { type: 'permission_cancelled', requestId: 'r1' });
  const ac = new AbortController();
  const b = ask(t.fake, { requestId: 'r2', signal: ac.signal });
  ac.abort();
  assert.equal((await b).behavior, 'deny');
  assert.deepEqual(t.last('permission_cancelled'), { type: 'permission_cancelled', requestId: 'r2' });
});

test('stdin closed with a pending request: refuse it, then exit', async () => {
  const t = setup();
  t.start();
  const answer = ask(t.fake);
  t.bridge.end();
  assert.deepEqual(await answer, { behavior: 'deny', message: "Refusé par l'utilisateur" });
  assert.deepEqual(t.exits, [0]);
  assert.deepEqual(t.fake.calls, [['close']]);
});

test('close answers closed and exits 0; later stream end is not an error', async () => {
  const t = setup();
  t.start();
  t.send({ type: 'close' });
  await tick();
  assert.equal(t.out.at(-1).type, 'closed');
  assert.deepEqual(t.exits, [0]);
  assert.equal(t.last('error'), undefined);
});

test('unexpected SDK stream end is fatal', async () => {
  const t = setup();
  t.start();
  t.fake.finish();
  await tick();
  assert.deepEqual(t.last('error').fatal, true);
  assert.deepEqual(t.exits, [1]);
});

test('already-aborted signal is refused without a request', async () => {
  const t = setup();
  t.start();
  const ac = new AbortController();
  ac.abort();
  assert.equal((await ask(t.fake, { signal: ac.signal })).behavior, 'deny');
  assert.equal(t.last('permission_request'), undefined);
});

test('duplicate requestId is refused; the first request stays intact', async () => {
  const t = setup();
  t.start();
  const first = ask(t.fake);
  assert.equal((await ask(t.fake)).behavior, 'deny');
  assert.equal(t.last('error').fatal, false);
  t.send({ type: 'permission_response', requestId: 'r1', decision: 'allow_once' });
  assert.equal((await first).behavior, 'allow');
});

test('synchronous throw from query is fatal, exit 1', () => {
  const out = [];
  const exits = [];
  const bridge = createBridge({ query: () => { throw new Error('boom'); }, sdkVersion: 'x', send: (m) => out.push(m), exit: (c) => exits.push(c) });
  bridge.handleLine(JSON.stringify({ type: 'start', cwd: '/w', claudePath: '/c', permissionMode: 'default' }));
  assert.equal(out.at(-1).type, 'error');
  assert.equal(out.at(-1).fatal, true);
  assert.deepEqual(exits, [1]);
});

// The entry point imports the real SDK, so only pre-start behaviour is reachable here.
test('stdio: real main.mjs handles chunked and split lines', async () => {
  const child = spawn(process.execPath, [new URL('./main.mjs', import.meta.url).pathname], { stdio: ['pipe', 'pipe', 'ignore'] });
  let stdout = '';
  child.stdout.on('data', (d) => (stdout += d));
  const code = new Promise((r) => child.on('exit', r));
  child.stdin.write('{"type":"nope"}\n{"type":"user","text":"x"}\n{"type":"cl');
  await new Promise((r) => setTimeout(r, 50));
  child.stdin.write('ose"}\n');
  assert.equal(await code, 0);
  const lines = stdout.trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(lines.map((m) => [m.type, m.fatal]), [['ready', undefined], ['error', false], ['error', false], ['closed', undefined]]);
  assert.equal(lines[0].sdkVersion, '0.3.322');
});
