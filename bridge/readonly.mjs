// Auto-approval of read-only Bash commands (contracts/bridge-protocol.md §2 `start.readRoots`).
// Deliberately narrow: anything this file does not fully understand returns false, and the user is asked as usual.
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const COMMANDS = new Set(['cat', 'grep', 'ls', 'find', 'head', 'tail', 'cd', 'git']);
const FIND_WRITES = new Set(['-exec', '-execdir', '-ok', '-okdir', '-delete', '-fprint', '-fprint0', '-fprintf', '-fls']);
const FOLLOW = /^(-[A-Za-z0-9]*[fF][A-Za-z0-9]*|--follow.*)$/; // `tail -f` never ends
// git: only subcommands that read. Global options (-C, -c, --git-dir…) and anything that writes, fetches or runs a
// program (--output, --ext-diff, -O) are left to the user. `--no-pager` is the one global option tolerated.
const GIT_READ = new Set(['status', 'diff', 'log', 'show', 'blame', 'ls-files', 'ls-tree', 'rev-parse', 'rev-list', 'describe', 'shortlog', 'show-ref', 'grep', 'merge-base']);
const GIT_BAD_FLAG = /^(--output|--ext-diff|--open-files-in-pager|--exec|-O)/;
const GIT_BRANCH_FLAG = /^(-a|-r|-v|-vv|--all|--remotes|--verbose|--list|-l|--show-current|--contains|--no-contains|--merged|--no-merged|--points-at|--sort=[\w:-]+|--format=\S+|--color|--no-color|--column|--no-column)$/;
const GIT_TAG_FLAG = /^(-l|--list|-n\d*|--sort=[\w:-]+|--contains|--no-contains|--merged|--no-merged|--points-at|--format=\S+)$/;
const GIT_LISTS = /^(--list|-l|--contains|--no-contains|--merged|--no-merged|--points-at)/; // flags that take a positional argument

function gitReads(args) {
  const [sub, ...a] = args[0] === '--no-pager' ? args.slice(1) : args;
  if (!sub || sub.startsWith('-') || a.some((x) => GIT_BAD_FLAG.test(x))) return false;
  if (GIT_READ.has(sub)) return true;
  const flags = a.filter((x) => x.startsWith('-'));
  const listing = flags.some((f) => GIT_LISTS.test(f)) || !a.some((x) => !x.startsWith('-'));
  if (sub === 'branch') return listing && flags.every((f) => GIT_BRANCH_FLAG.test(f));
  if (sub === 'tag') return listing && flags.every((f) => GIT_TAG_FLAG.test(f));
  if (sub === 'remote') return a.every((x) => x === '-v' || x === '--verbose');
  if (sub === 'stash') return a[0] === 'list' || a[0] === 'show';
  if (sub === 'worktree') return a[0] === 'list';
  return false;
}

const SECRET = /(^|\/)(\.ssh|\.gnupg|\.aws)(\/|$)|(^|\/)\.credentials\.json$/; // never auto-read credentials
const PLAIN = /[A-Za-z0-9_\-.\/,:=+@%~*?[\]]/;

/** Splits a command line into simple commands of tokens, or null if it holds any shell syntax beyond
 *  `;` `&&` `||` `|` newline and plain/quoted words (no `$`, backtick, `\`, redirection but 2>&1 and 2>/dev/null,
 *  subshell, `&`). */
function parse(cmd) {
  const cmds = [[]];
  let tok = null;
  const endTok = () => { if (tok !== null) { cmds.at(-1).push(tok); tok = null; } };
  const endCmd = () => { endTok(); if (!cmds.at(-1).length) return false; cmds.push([]); return true; };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    // `2>&1` and `2>/dev/null` only move error messages: the one redirection tolerated, as a whole word.
    const sink = tok === null && c === '2' ? /^2>(?:&1|\/dev\/null)(?=$|[\s;|&])/.exec(cmd.slice(i)) : null;
    if (sink) i += sink[0].length - 1;
    else if (c === "'" || c === '"') {
      const j = cmd.indexOf(c, i + 1);
      if (j < 0) return null;
      const s = cmd.slice(i + 1, j);
      if (c === '"' && /[$`\\]/.test(s)) return null;
      tok = (tok ?? '') + s;
      i = j;
    } else if (c === ' ' || c === '\t') endTok();
    else if (c === ';' || c === '\n') { if (!endCmd()) return null; }
    else if (c === '|') { if (cmd[i + 1] === '|') i++; if (!endCmd()) return null; }
    else if (c === '&') { if (cmd[i + 1] !== '&') return null; i++; if (!endCmd()) return null; }
    else if (PLAIN.test(c) || c.codePointAt(0) > 127) tok = (tok ?? '') + c; // non-ASCII: accents, emoji in note names
    else return null;
  }
  endTok();
  if (!cmds.at(-1).length) cmds.pop(); // trailing `;`
  return cmds.length ? cmds : null;
}

// realpath of the nearest existing ancestor + the rest, so symlinks cannot lead out of a root.
function real(p) {
  const rest = [];
  for (let q = p; ; q = path.dirname(q)) {
    try { return path.join(realpathSync(q), ...rest.reverse()); } catch { /* not there yet */ }
    if (path.dirname(q) === q) return p;
    rest.push(path.basename(q));
  }
}

/** True when `command` only reads files inside `roots` (the session cwd and the extra read roots). */
export function isReadOnlyBash(command, { cwd, roots }) {
  if (typeof command !== 'string' || command.length > 4000) return false;
  const cmds = parse(command);
  if (!cmds) return false;
  const allowed = roots.map((r) => real(path.resolve(r)));
  const inside = (p) => !SECRET.test(p) && allowed.some((r) => p === r || p.startsWith(r + path.sep));
  // The shell may sit in a subdirectory of cwd from an earlier call: relative paths are then only safe without `..`,
  // until an absolute `cd` pins the directory. shortcut: a symlink inside cwd that leaves the roots is not seen, when that
  // earlier call moved into a subdirectory; lift it by having the core send the shell's real directory.
  let dir = null;
  for (const [name, ...args] of cmds) {
    if (!COMMANDS.has(name)) return false;
    if (name === 'find' && args.some((a) => FIND_WRITES.has(a))) return false;
    if (name === 'tail' && args.some((a) => FOLLOW.test(a))) return false;
    if (name === 'git' && !gitReads(args)) return false;
    if (name === 'cd' && (args.length > 1 || args.some((a) => a.startsWith('-')))) return false;
    const paths = name === 'cd' && !args.length ? ['~'] : args.filter((a) => !a.startsWith('-'));
    if (args.some((a) => a.startsWith('-') && /[\/~]/.test(a))) return false; // `--file=/etc/x`, `-f/etc/x`
    let last = null;
    for (const a of paths) {
      if (!a) continue;
      let p;
      if (a === '~' || a.startsWith('~/')) p = path.join(homedir(), a.slice(1));
      else if (a.startsWith('~')) return false;
      else if (path.isAbsolute(a)) p = a;
      else {
        if (!dir && a.split('/').includes('..')) return false;
        p = path.resolve(dir ?? cwd, a);
      }
      p = real(path.resolve(p));
      if (!inside(p)) return false;
      last = p;
    }
    if (name === 'cd') {
      if (last && (path.isAbsolute(args[0] ?? '~') || (args[0] ?? '~').startsWith('~'))) dir = last;
      else if (last && dir) dir = last;
    }
  }
  return true;
}
