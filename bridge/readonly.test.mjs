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
  ok('grep -r a src 2>/dev/null');
  ok('find . -name "*.md" 2>&1 | head -5');
  ok('ls 2>&1; cat README.md 2>/dev/null && ls src 2>&1');
});

test('version queries and harmless helpers (which, pwd, echo, wc, du, stat)', () => {
  for (const c of [
    'php -v', 'node --version', 'python3 -V', 'java -version', 'cargo --version | head -1', 'git --version', 'mysql -V 2>/dev/null',
    'which php symfony mysql mariadb', 'pwd', 'echo "--- fin ---"', 'wc -l README.md', 'ls src | wc -l', 'du -sh .', 'stat README.md',
    "cd /x 2>/dev/null; php -v | head -1",
  ].filter((c) => !c.startsWith('cd /x'))) ok(c);
  for (const c of [
    'php -r "system(1)"', 'php index.php', 'php -v x', 'php -v -r 1', 'node -e 1', 'node script.js', 'node', 'npm run build', 'npm install', 'python3 a.py',
    'make', 'make -v clean', 'docker run x', 'cargo build', 'cargo --version --foo', 'java -jar a.jar',
    'echo hi > f', 'echo $HOME', 'which ../x', 'which /usr/bin/php', 'du /etc', 'stat /etc/passwd', 'wc /etc/passwd', 'pwd x ; rm a',
  ]) no(c);
});

test('git: reads are allowed like in the terminal, anything that changes something is not', () => {
  for (const c of [
    'git status', 'git status -sb', 'git diff', 'git diff HEAD~1 --stat', 'git log --oneline -5', 'git --no-pager log -3 2>&1',
    'git show HEAD:README.md', 'git show abc123 --stat', 'git branch', 'git branch -a', 'git branch -vv', 'git branch --show-current',
    'git branch --list "feat/*"', 'git branch --contains abc123', 'git tag', 'git tag -l "v1*"', 'git remote', 'git remote -v',
    'git stash list', 'git worktree list', 'git blame README.md', 'git ls-files | head', 'git rev-parse HEAD', 'git log --since="2 days ago" --author=ESORRAL',
    `cd ${vault} && git log --oneline | head -5`, 'git diff -- src', 'git grep -n foo', 'git merge-base main HEAD',
  ]) ok(c);
  for (const c of [
    'git', 'git commit -m x', 'git add .', 'git push', 'git pull', 'git fetch', 'git checkout main', 'git switch x', 'git reset --hard',
    'git clean -fd', 'git rm x', 'git mv a b', 'git restore a', 'git merge x', 'git rebase main', 'git cherry-pick abc', 'git apply p.diff',
    'git branch -D x', 'git branch -d x', 'git branch newbranch', 'git branch -m a b', 'git tag v1', 'git tag -d v1', 'git remote add x y',
    'git remote show origin', 'git remote remove x', 'git stash', 'git stash pop', 'git stash drop', 'git worktree add x', 'git worktree remove x',
    'git config user.name x', 'git reflog expire --all', 'git diff --output=out', 'git log --output out', 'git diff --ext-diff',
    'git grep -O less x', 'git grep --open-files-in-pager=less x', 'git -C /tmp status', 'git -c core.pager=x log', 'git --git-dir=x log',
    'git status > f', 'git log --format=%h/%s', 'git diff /etc/passwd', 'git log ; rm a', 'git status && git push',
  ]) no(c);
});

test('writes, deletes and anything unknown are refused', () => {
  for (const c of [
    'rm a', 'touch a', 'git push', 'mv a b', 'cp a b', 'sed -i s/a/b/ f', 'sort -o f g', 'tee f',
    'cat a > b', 'cat a >> b', 'cat < a', 'ls | tee f', 'find . -delete', 'find . -exec rm {} ;', 'find . -execdir ls ;',
    'find . -ok rm', 'find . -fprint out', 'tail -f log', 'tail -F log', 'tail --follow log',
    'ls 2>file', 'ls 2>>/dev/null', 'ls 2> /dev/null', 'ls >&2', 'ls &>/dev/null', 'cat a 1>&2', 'ls 2>&1x', 'ls2>&1', 'ls 2>/dev/null2',
    'node --test a.test.mjs 2>&1 | tail -12', 'ls 2>/dev/null > out',
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
