import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { stashPush } from '../dist/host/lib/git.js';
import { commitAndPush, gitOk, runGit, setupRepos, skip } from './git-fixture.mjs';

const push = (repos, paths, message = 'selected') => stashPush(repos.runtime, repos.work, { paths, message, includeUntracked: true });

test('AC-092: stash selected staged, unstaged, mixed and untracked files only', { skip }, async (t) => {
  const r = await setupRepos(t, { 'staged': 'base\n', 'mixed': 'base\n', 'unstaged': 'base\n', 'other': 'base\n' });
  for (const file of ['staged', 'mixed', 'unstaged', 'other', 'new']) await writeFile(path.join(r.work, file), file + ' changed\n');
  await gitOk(r.work, ['add', 'staged', 'mixed'], r.home);
  await writeFile(path.join(r.work, 'mixed'), 'mixed staged\nmixed unstaged\n');
  const result = await push(r, ['staged', 'mixed', 'unstaged', 'new']);
  assert.deepEqual(result.status.entries.map((entry) => entry.path), ['other']);
  assert.match(result.stashes[0].message, /selected/);
  assert.equal(await readFile(path.join(r.work, 'mixed'), 'utf8'), 'base\n');
  assert.equal((await gitOk(r.work, ['show', 'stash@{0}^2:mixed'], r.home)).stdout, 'mixed changed\n');
  assert.equal((await gitOk(r.work, ['show', 'stash@{0}:mixed'], r.home)).stdout, 'mixed staged\nmixed unstaged\n');
  assert.equal(await readFile(path.join(r.work, 'other'), 'utf8'), 'other changed\n');
  await assert.rejects(readFile(path.join(r.work, 'new')), { code: 'ENOENT' });
});

test('AC-094: stash treats wildcard names literally and refuses empty and stale selections', { skip }, async (t) => {
  const r = await setupRepos(t, { 'a*.txt': 'base\n', 'abc.txt': 'base\n' });
  await writeFile(path.join(r.work, 'a*.txt'), 'selected\n');
  await writeFile(path.join(r.work, 'abc.txt'), 'keep\n');
  await assert.rejects(() => push(r, []), { code: 'git/invalid-path' });
  await assert.rejects(() => push(r, ['a*.txt', 'missing']), { code: 'git/stale' });
  const result = await push(r, ['a*.txt']);
  assert.deepEqual(result.status.entries.map((entry) => entry.path), ['abc.txt']);
  assert.equal(await readFile(path.join(r.work, 'abc.txt'), 'utf8'), 'keep\n');
});

test('AC-095: stash refuses a rename without changing either path', { skip }, async (t) => {
  const r = await setupRepos(t, { 'old': 'base\n' });
  await gitOk(r.work, ['mv', 'old', 'new'], r.home);
  await assert.rejects(() => push(r, ['new']), { code: 'git/unsupported' });
  assert.equal(await readFile(path.join(r.work, 'new'), 'utf8'), 'base\n');
  assert.match((await gitOk(r.work, ['status', '--short'], r.home)).stdout, /R  old -> new/);
  assert.equal((await gitOk(r.work, ['stash', 'list'], r.home)).stdout, '');
});


test('AC-095: stash refuses an untracked file at a rename old path', { skip }, async (t) => {
  const r = await setupRepos(t, { old: 'base\n' });
  await gitOk(r.work, ['mv', 'old', 'new'], r.home);
  await writeFile(path.join(r.work, 'old'), 'another file\n');
  await assert.rejects(() => push(r, ['old']), { code: 'git/unsupported' });
  assert.equal(await readFile(path.join(r.work, 'old'), 'utf8'), 'another file\n');
  assert.equal(await readFile(path.join(r.work, 'new'), 'utf8'), 'base\n');
});

test('AC-096: stash refuses an in-progress merge and preserves conflict', { skip }, async (t) => {
  const r = await setupRepos(t, { a: 'base\n' });
  await writeFile(path.join(r.up, 'a'), 'upstream\n');
  await commitAndPush(r, 'upstream');
  await writeFile(path.join(r.work, 'a'), 'local\n');
  await gitOk(r.work, ['commit', '-qam', 'local'], r.home);
  await gitOk(r.work, ['fetch', '-q', 'origin'], r.home);
  assert.notEqual((await runGit(r.work, ['merge', 'origin/master'], r.home)).code, 0);
  await assert.rejects(() => push(r, ['a']), { code: 'git/operation' });
  assert.match(await readFile(path.join(r.work, 'a'), 'utf8'), /<<<<<<< HEAD/);
  assert.equal((await gitOk(r.work, ['stash', 'list'], r.home)).stdout, '');
});
