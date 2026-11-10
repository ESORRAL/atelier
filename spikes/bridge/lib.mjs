// Throwaway spike helpers: common SDK options + redacted NDJSON capture.
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export { query } from '@anthropic-ai/claude-agent-sdk';

const here = dirname(fileURLToPath(import.meta.url));
export const SANDBOX = join(here, 'sandbox');
mkdirSync(SANDBOX, { recursive: true });
mkdirSync(join(here, 'samples'), { recursive: true });

export const CLAUDE = execSync('which claude').toString().trim();

export function baseOptions(extra = {}) {
  return {
    pathToClaudeCodeExecutable: CLAUDE,
    model: 'haiku',
    cwd: SANDBOX,
    permissionMode: 'default', // manual approvals through canUseTool; never bypass
    ...extra,
  };
}

const HOME = homedir();
const USER = userInfo().username;
const SECRET_KEY = /email|organization|org_?id|account|user_?id/i;

function redact(value, key = '') {
  if (typeof value === 'string') {
    if (SECRET_KEY.test(key)) return '<redacted>';
    return value
      .split(HOME).join('<redacted>')
      .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '<redacted>')
      .replace(new RegExp(`\\b${USER}\\b`, 'g'), '<redacted>');
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, key));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v, k)]));
  }
  return value;
}

// One capture file per scenario; every line is {t, kind, data}.
export function capture(name) {
  const file = join(here, 'samples', `${name}.ndjson`);
  writeFileSync(file, '');
  const t0 = Date.now();
  return (kind, data) => {
    appendFileSync(file, JSON.stringify({ t: Date.now() - t0, kind, data: redact(data) }) + '\n');
  };
}

// Async-iterable prompt for streaming-input mode: push() user turns, end() to close.
export function inputStream() {
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

export function pgrepClaude() {
  try { return execSync(`pgrep -af "${CLAUDE}"`).toString().trim(); } catch { return ''; }
}
