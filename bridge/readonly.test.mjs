import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isReadOnlyBash } from './readonly.mjs';

const base = realpathSync(mkdtempSync(join(tmpdir(), 'atelier-ro-')));
const cwd = join(base, 'proj');
const vault = join(base, 'vault');
const outside = join(base, 'outside');
for (const d of [cwd, join(cwd, 'src'), vault, join(vault, 'Notes'), outside]) mkdirSync(d, { recursive: true });
writeFileSync(join(outside, 'secret.txt'), 'x');
symlinkSync(outside, join(cwd, 'link'));
const scope = { cwd, roots: [cwd, vault] };
const ok = (c) => assert.equal(isReadOnlyBash(c, scope), true, c);
const no = (c) => assert.equal(isReadOnlyBash(c, scope), false, c);

test('plain reads in cwd and in the vault are allowed, alone and combined', () => {
  ok('ls');
  ok('ls -la src');
  ok('cat README.md');
  ok(`cat "${vault}/Notes/idée 🏠.md"`);
  ok(`cd "${vault}" ; ls ; cat Notes/a.md | head -n 20`);
  ok(`cd ${vault}/Notes && grep -rn "tag" . | tail -5`);
  ok(`find ${vault} -name "*.md" -mtime -7`);
  ok(`grep -r --include=*.md 'a;b|c' src`);
  ok('head -n 5 src/a.ts\nls\n');
  ok('ls ;');
});

test('writes, deletes and anything unknown are refused', () => {
  for (const c of [
    'rm a', 'touch a', 'git push', 'mv a b', 'cp a b', 'sed -i s/a/b/ f', 'echo hi', 'sort -o f g', 'tee f',
    'cat a > b', 'cat a >> b', 'cat < a', 'ls | tee f', 'find . -delete', 'find . -exec rm {} ;', 'find . -execdir ls ;',
    'find . -ok rm', 'find . -fprint out', 'tail -f log', 'tail -F log', 'tail --follow log',
  ]) no(c);
});

test('shell syntax that could hide a command is refused', () => {
  for (const c of ['cat $(rm a)', 'cat `rm a`', 'ls "$HOME"', 'ls $HOME', 'cat a & rm b', 'ls\\ x', 'cat <(ls)', '(ls)', '{ ls; }',
    'cat a ; ; ls', '; ls', 'ls ||| ls', 'cat "unterminated', "cat 'unterminated", 'ls !x', 'ls # c', 'x=1 ls']) no(c);
  no('');
  no('a'.repeat(4001));
});

test('paths outside the roots, escapes and secrets are refused', () => {
  for (const c of [
    'cat /etc/passwd', `cat ${outside}/secret.txt`, 'cat ../outside/secret.txt', 'ls ..', 'cat link/secret.txt', 'cat ~/.bashrc',
    'cat ~root/x', 'cd /', 'cd ..', 'cd -', 'cd a b', 'cd', `cd ${outside} ; ls`, `cd ${vault} ; cat ../outside/secret.txt`,
    'grep -f /etc/shadow x', 'grep --file=/etc/shadow x', 'grep -r x ~/.ssh', 'cat .ssh/id_rsa', `cat ${vault}/.credentials.json`,
  ]) no(c);
});

test('after an absolute cd, .. is resolved against it', () => {
  ok(`cd ${vault}/Notes ; cat ../Notes/a.md`);
  no(`cd ${vault}/Notes ; cat ../../outside/secret.txt`);
});

test('a symlink inside cwd that leaves the roots is refused', () => {
  no('ls link');
  no('cat link/secret.txt');
});
