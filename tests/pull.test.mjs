import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pull } from '../dist/host/lib/git.js';
import { commitAndPush, gitOk, runGit, setupRepos, skip } from './git-fixture.mjs';

test('AC-051: pull restores tracked changes blocked by the update and keeps the index', { skip }, async (t) => {
  const base = Array.from({ length: 20 }, (_, index) => `line${String(index + 1).padStart(2, '0')}`).join('\n') + '\n';
  const repos = await setupRepos(t, { 'a.txt': base });
  await writeFile(path.join(repos.up, 'a.txt'), base.replace('line02', 'LINE02'));
  await commitAndPush(repos, 'upstream edit');
  await writeFile(path.join(repos.work, 'a.txt'), base.replace('line12', 'LINE12'));
  await gitOk(repos.work, ['add', 'a.txt'], repos.home);
  await writeFile(path.join(repos.work, 'a.txt'), base.replace('line12', 'LINE12').replace('line18', 'LINE18'));
  await gitOk(repos.work, ['config', 'pull.rebase', 'true'], repos.home);

  const result = await pull(repos.runtime, repos.work);

  assert.equal(result.autoStash, 'restored');
  assert.equal(
    await readFile(path.join(repos.work, 'a.txt'), 'utf8'),
    base.replace('line02', 'LINE02').replace('line12', 'LINE12').replace('line18', 'LINE18'),
  );
  assert.equal((await runGit(repos.work, ['stash', 'list'], repos.home)).stdout.trim(), '');
  assert.equal((await runGit(repos.work, ['status', '--porcelain'], repos.home)).stdout.trimEnd(), 'MM a.txt');
  assert.match((await gitOk(repos.work, ['diff', '--cached', '--', 'a.txt'], repos.home)).stdout, /\+LINE12/);
  assert.match((await gitOk(repos.work, ['diff', '--', 'a.txt'], repos.home)).stdout, /\+LINE18/);
});

test('AC-052: pull keeps a local change the update does not touch and creates no stash', { skip }, async (t) => {
  const repos = await setupRepos(t, { 'a.txt': 'one\ntwo\nthree\n', 'b.txt': 'base\n' });
  await writeFile(path.join(repos.up, 'b.txt'), 'updated\n');
  await commitAndPush(repos, 'upstream edit');
  await writeFile(path.join(repos.work, 'a.txt'), 'one\nlocal\nthree\n');
  await gitOk(repos.work, ['config', 'pull.rebase', 'true'], repos.home);

  const result = await pull(repos.runtime, repos.work);

  assert.equal(result.autoStash, undefined);
  assert.equal(await readFile(path.join(repos.work, 'a.txt'), 'utf8'), 'one\nlocal\nthree\n');
  assert.equal(await readFile(path.join(repos.work, 'b.txt'), 'utf8'), 'updated\n');
  assert.equal((await runGit(repos.work, ['stash', 'list'], repos.home)).stdout.trim(), '');
  assert.equal((await runGit(repos.work, ['status', '--porcelain'], repos.home)).stdout.trimEnd(), ' M a.txt');
});

test('AC-053: pull keeps an overwritten untracked file in the stash and reports it', { skip }, async (t) => {
  const repos = await setupRepos(t, { 'a.txt': 'base\n' });
  await writeFile(path.join(repos.up, 'new.txt'), 'remote\n');
  await commitAndPush(repos, 'add new.txt');
  await writeFile(path.join(repos.work, 'new.txt'), 'local\n');

  const result = await pull(repos.runtime, repos.work);

  assert.equal(result.autoStash, 'conflict');
  assert.equal(await readFile(path.join(repos.work, 'new.txt'), 'utf8'), 'remote\n');
  assert.equal(
    (await runGit(repos.work, ['stash', 'list'], repos.home)).stdout.trim().split('\n').filter(Boolean).length,
    1,
  );
  assert.equal((await gitOk(repos.work, ['show', 'stash@{0}^3:new.txt'], repos.home)).stdout, 'local\n');
  assert.equal((await runGit(repos.work, ['status', '--porcelain'], repos.home)).stdout.trim(), '');
});

test('AC-054: a conflicting restore keeps the stash and reports the conflict', { skip }, async (t) => {
  const repos = await setupRepos(t, { 'a.txt': 'one\ntwo\nthree\n' });
  await writeFile(path.join(repos.up, 'a.txt'), 'one\nTWO\nthree\n');
  await commitAndPush(repos, 'upstream edit');
  await writeFile(path.join(repos.work, 'a.txt'), 'one\nlocal\nthree\n');

  const result = await pull(repos.runtime, repos.work);

  assert.equal(result.autoStash, 'conflict');
  assert.ok(result.status.conflicts.includes('a.txt'));
  assert.equal(
    (await runGit(repos.work, ['stash', 'list'], repos.home)).stdout.trim().split('\n').filter(Boolean).length,
    1,
  );
  assert.equal((await runGit(repos.work, ['status', '--porcelain'], repos.home)).stdout.trim(), 'UU a.txt');
  assert.match(await readFile(path.join(repos.work, 'a.txt'), 'utf8'), /<<<<<<< Updated upstream/);
});

test('AC-055: a divergent pull leaves the working tree and the stash list unchanged', { skip }, async (t) => {
  const repos = await setupRepos(t, {
    'a.txt': 'one\n',
    'b.txt': 'base\n',
    'c.txt': 'clean\n',
  });
  await writeFile(path.join(repos.up, 'b.txt'), 'updated\n');
  await commitAndPush(repos, 'upstream edit');
  await writeFile(path.join(repos.work, 'a.txt'), 'local commit\n');
  await gitOk(repos.work, ['commit', '-q', '-am', 'local commit'], repos.home);
  await writeFile(path.join(repos.work, 'c.txt'), 'dirty\n');

  await assert.rejects(
    () => pull(repos.runtime, repos.work),
    (error) => error.code === 'git/pull-failed',
  );

  assert.equal(await readFile(path.join(repos.work, 'a.txt'), 'utf8'), 'local commit\n');
  assert.equal(await readFile(path.join(repos.work, 'c.txt'), 'utf8'), 'dirty\n');
  assert.equal((await runGit(repos.work, ['stash', 'list'], repos.home)).stdout.trim(), '');
  assert.equal((await runGit(repos.work, ['status', '--porcelain'], repos.home)).stdout.trimEnd(), ' M c.txt');
});

/**
 * Wrap the fixture runtime so the second pull or the stash restore fails.
 * @param {object} runtime the fixture runtime.
 * @param {{ secondPull?: boolean, pop?: boolean }} failures the calls to fail.
 * @returns {object} the wrapped runtime.
 */
function failingRuntime(runtime, { secondPull = false, pop = false } = {}) {
  let pulls = 0;
  return {
    ...runtime,
    async run(cwd, args, options) {
      if (args[0] === 'pull') {
        pulls += 1;
        if (secondPull && pulls === 2) {
          return { code: 128, stdout: '', stderr: 'fatal: simulated network failure\n' };
        }
      }
      if (pop && args[0] === 'stash' && args[1] === 'pop') {
        return { code: 1, stdout: '', stderr: 'error: simulated restore failure\n' };
      }
      return runtime.run(cwd, args, options);
    },
  };
}

test('AC-062: a retried pull that fails restores the local changes and reports the error', { skip }, async (t) => {
  const repos = await setupRepos(t, { 'a.txt': 'one\ntwo\nthree\n' });
  await writeFile(path.join(repos.up, 'a.txt'), 'one\nTWO\nthree\n');
  await commitAndPush(repos, 'upstream edit');
  await writeFile(path.join(repos.work, 'a.txt'), 'one\nlocal\nthree\n');

  await assert.rejects(
    () => pull(failingRuntime(repos.runtime, { secondPull: true }), repos.work),
    (error) => error.code === 'git/pull-failed',
  );

  assert.equal(await readFile(path.join(repos.work, 'a.txt'), 'utf8'), 'one\nlocal\nthree\n');
  assert.equal((await runGit(repos.work, ['stash', 'list'], repos.home)).stdout.trim(), '');
});

test('AC-063: a retried pull and a failed restore keep the stash and say so', { skip }, async (t) => {
  const repos = await setupRepos(t, { 'a.txt': 'one\ntwo\nthree\n' });
  await writeFile(path.join(repos.up, 'a.txt'), 'one\nTWO\nthree\n');
  await commitAndPush(repos, 'upstream edit');
  await writeFile(path.join(repos.work, 'a.txt'), 'one\nlocal\nthree\n');

  await assert.rejects(
    () => pull(failingRuntime(repos.runtime, { secondPull: true, pop: true }), repos.work),
    (error) => error.code === 'git/pull-stash-failed' && /stash/.test(error.message),
  );

  assert.equal(await readFile(path.join(repos.work, 'a.txt'), 'utf8'), 'one\ntwo\nthree\n');
  const stashes = (await runGit(repos.work, ['stash', 'list'], repos.home)).stdout
    .trim()
    .split('\n')
    .filter(Boolean);
  assert.equal(stashes.length, 1);
  assert.match(stashes[0], /changes before pull/);
});

test('AC-064: a mixed stash restores the tracked part and keeps the whole stash', { skip }, async (t) => {
  const repos = await setupRepos(t, { 'a.txt': 'base\n' });
  await writeFile(path.join(repos.up, 'new.txt'), 'remote\n');
  await commitAndPush(repos, 'add new.txt');
  await writeFile(path.join(repos.work, 'new.txt'), 'local\n');
  await writeFile(path.join(repos.work, 'a.txt'), 'local change\n');

  const result = await pull(repos.runtime, repos.work);

  assert.equal(result.autoStash, 'conflict');
  assert.equal(await readFile(path.join(repos.work, 'a.txt'), 'utf8'), 'local change\n');
  assert.equal(await readFile(path.join(repos.work, 'new.txt'), 'utf8'), 'remote\n');
  assert.equal((await runGit(repos.work, ['status', '--porcelain'], repos.home)).stdout.trimEnd(), ' M a.txt');
  const stashes = (await runGit(repos.work, ['stash', 'list'], repos.home)).stdout
    .trim()
    .split('\n')
    .filter(Boolean);
  assert.equal(stashes.length, 1);
  assert.equal((await gitOk(repos.work, ['show', 'stash@{0}^3:new.txt'], repos.home)).stdout, 'local\n');
});

test('AC-065: a stash created during the pull is never popped', { skip }, async (t) => {
  const repos = await setupRepos(t, { 'a.txt': 'one\ntwo\nthree\n' });
  await writeFile(path.join(repos.up, 'a.txt'), 'one\nTWO\nthree\n');
  await commitAndPush(repos, 'upstream edit');
  await writeFile(path.join(repos.work, 'a.txt'), 'one\nlocal\nthree\n');
  let pulls = 0;
  const runtime = {
    ...repos.runtime,
    async run(cwd, args, options) {
      if (args[0] === 'pull') {
        pulls += 1;
        if (pulls === 2) {
          await writeFile(path.join(repos.work, 'other.txt'), 'other\n');
          await repos.runtime.run(repos.work, ['stash', 'push', '-u', '-m', 'user stash'], {});
          return { code: 128, stdout: '', stderr: 'fatal: simulated network failure\n' };
        }
      }
      return repos.runtime.run(cwd, args, options);
    },
  };

  await assert.rejects(
    () => pull(runtime, repos.work),
    (error) => error.code === 'git/pull-stash-failed' && /stash/.test(error.message),
  );

  const stashes = (await runGit(repos.work, ['stash', 'list'], repos.home)).stdout
    .trim()
    .split('\n')
    .filter(Boolean);
  assert.equal(stashes.length, 2);
  assert.match(stashes[0], /user stash/);
  assert.match(stashes[1], /changes before pull/);
});