// Atelier bridge: NDJSON on stdio <-> Claude Agent SDK. See contracts/bridge-protocol.md (v1.1).
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { isReadOnlyBash } from './readonly.mjs';

const MODES = new Set(['default', 'acceptEdits', 'plan']);
const DEFAULT_DENY = "Refusé par l'utilisateur";

// Async-iterable prompt for streaming-input mode.
function inputStream() {
  const queue = [];
  let wake;
  let done = false;
  return {
    push(text) {
      queue.push({ type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null });
      wake?.();
    },
    end() { done = true; wake?.(); },
    async *[Symbol.asyncIterator]() {
      while (true) {
        while (queue.length) yield queue.shift();
        if (done) return;
        await new Promise((r) => (wake = r));
      }
    },
  };
}

// query, send, log and exit are injected so tests run without the SDK or a real process.
export function createBridge({ query, sdkVersion, send, log = () => {}, exit }) {
  let session = null; // { q, input }
  let stopping = false;
  let readScope = null; // { cwd, roots } of the session: where read-only Bash may run unasked
  const pending = new Map(); // requestId -> { input, suggestions, canAlways, resolve }

  const error = (message, fatal = false) => send({ type: 'error', message, fatal });

  function settle(requestId, answer, cancelled) {
    const p = pending.get(requestId);
    if (!p) return;
    pending.delete(requestId);
    if (cancelled) send({ type: 'permission_cancelled', requestId });
    p.resolve(answer);
  }

  const cancelAll = () => {
    for (const id of [...pending.keys()]) settle(id, { behavior: 'deny', message: DEFAULT_DENY }, true);
  };

  async function canUseTool(toolName, input, opts) {
    const { signal, suggestions = [], requestId = crypto.randomUUID() } = opts;
    const canAlways = suggestions.some((s) => s.type === 'addRules');
    if (signal?.aborted) return { behavior: 'deny', message: DEFAULT_DENY };
    // Plain reads (cat, grep, ls, find without -exec/-delete…) inside the session's folders need no popup.
    if (toolName === 'Bash' && readScope && !input?.dangerouslyDisableSandbox && isReadOnlyBash(input?.command, readScope)) {
      return { behavior: 'allow', updatedInput: input };
    }
    if (pending.has(requestId)) {
      error(`duplicate requestId refused: ${requestId}`);
      return { behavior: 'deny', message: DEFAULT_DENY };
    }
    return new Promise((resolve) => {
      pending.set(requestId, { input, suggestions, canAlways, resolve });
      signal?.addEventListener('abort', () => settle(requestId, { behavior: 'deny', message: DEFAULT_DENY }, true), { once: true });
      send({
        type: 'permission_request', requestId, toolName, input, toolUseID: opts.toolUseID,
        displayName: opts.displayName, description: opts.description, blockedPath: opts.blockedPath, canAlways,
      });
    });
  }

  async function pump(q) {
    try {
      for await (const message of q) send({ type: 'sdk', message });
      if (!stopping) shutdown(1, 'SDK stream ended unexpectedly');
    } catch (e) {
      if (!stopping) shutdown(1, `SDK error: ${e?.message ?? e}`);
    }
  }

  function shutdown(code, fatalMessage) {
    if (stopping) return;
    stopping = true;
    cancelAll();
    session?.input.end();
    try { session?.q.close?.(); } catch (e) { log(`close failed: ${e?.message ?? e}`); }
    if (fatalMessage) error(fatalMessage, true);
    else send({ type: 'closed' });
    exit(code);
  }

  // Runs an SDK control call and reports failures as non-fatal errors.
  const control = (name, fn) => Promise.resolve().then(fn).catch((e) => error(`${name} failed: ${e?.message ?? e}`));

  const handlers = {
    start(m) {
      if (session) return error('session already started');
      if (typeof m.cwd !== 'string' || typeof m.claudePath !== 'string') return error('start requires cwd and claudePath');
      if (!MODES.has(m.permissionMode)) return error(`invalid permissionMode: ${m.permissionMode}`);
      const input = inputStream();
      const extra = Array.isArray(m.readRoots) ? m.readRoots.filter((r) => typeof r === 'string' && r.startsWith('/')).slice(0, 8) : [];
      readScope = { cwd: m.cwd, roots: [m.cwd, ...extra] };
      let q;
      try {
        q = query({
          prompt: input,
          options: {
            cwd: m.cwd,
            pathToClaudeCodeExecutable: m.claudePath,
            permissionMode: m.permissionMode,
            ...(m.model && { model: m.model }),
            ...(m.resume && { resume: m.resume }),
            includePartialMessages: true,
            forwardSubagentText: true,
            canUseTool,
          },
        });
      } catch (e) {
        return shutdown(1, `SDK error: ${e?.message ?? e}`);
      }
      session = { q, input };
      pump(q);
    },
    user(m) {
      if (typeof m.text !== 'string') return error('user requires text');
      session.input.push(m.text);
    },
    interrupt() {
      cancelAll();
      return control('interrupt', () => session.q.interrupt());
    },
    set_model(m) {
      return control('set_model', () => session.q.setModel(m.model));
    },
    set_permission_mode(m) {
      if (!MODES.has(m.mode)) return error(`invalid permission mode: ${m.mode}`);
      return control('set_permission_mode', () => session.q.setPermissionMode(m.mode));
    },
    list_models(m) {
      if (typeof m.requestId !== 'string') return error('list_models requires requestId');
      return control('list_models', async () => send({ type: 'models', requestId: m.requestId, models: await session.q.supportedModels() }));
    },
    permission_response(m) {
      const p = pending.get(m.requestId);
      if (!p) return error(`unknown requestId: ${m.requestId}`);
      if (m.decision === 'allow_once') return settle(m.requestId, { behavior: 'allow', updatedInput: p.input });
      if (m.decision === 'allow_always') {
        if (!p.canAlways) return error(`allow_always not offered for ${m.requestId}`);
        const updatedPermissions = p.suggestions.filter((s) => s.type === 'addRules');
        return settle(m.requestId, { behavior: 'allow', updatedInput: p.input, updatedPermissions });
      }
      if (m.decision === 'deny') return settle(m.requestId, { behavior: 'deny', message: m.message || DEFAULT_DENY });
      error(`invalid decision: ${m.decision}`);
    },
    close() {
      shutdown(0);
    },
  };

  send({ type: 'ready', sdkVersion });

  return {
    handleLine(line) {
      if (stopping || !line.trim()) return;
      let m;
      try { m = JSON.parse(line); } catch { return error('invalid JSON line'); }
      const handler = Object.hasOwn(handlers, m?.type) ? handlers[m.type] : null;
      if (!handler) {
        log(`unknown message type: ${m?.type}`);
        return error(`unknown message type: ${m?.type}`);
      }
      if (!session && !['start', 'close'].includes(m.type)) return error(`${m.type} before start`);
      return handler(m);
    },
    // stdin closed: refuse what is pending, then leave.
    end() { shutdown(0); },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // stdout carries protocol lines only, so redirect before anything can print.
  console.log = console.info = console.debug = console.error;
  console.dir = (obj) => console.error(obj);
  const { query } = await import('@anthropic-ai/claude-agent-sdk');
  const pkg = new URL('./node_modules/@anthropic-ai/claude-agent-sdk/package.json', import.meta.url);
  const bridge = createBridge({
    query,
    sdkVersion: JSON.parse(readFileSync(pkg, 'utf8')).version,
    send: (msg) => process.stdout.write(JSON.stringify(msg) + '\n'),
    log: (text) => process.stderr.write(`[bridge] ${text}\n`),
    exit: (code) => process.stdout.write('', () => process.exit(code)),
  });
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', (line) => bridge.handleLine(line));
  rl.on('close', () => bridge.end());
}
