import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { discardPaths } from '../dist/host/lib/git.js';
import { commitAndPush, gitOk, runGit, runtimeFor, setupRepos, skip, tempRoot } from './git-fixture.mjs';

test('AC-056: discard restores a modified tracked file to HEAD', { skip }, async (t) => {
  const repos = await setupRepos(t, { 'a.txt': 'base\n' });
  await writeFile(path.join(repos.work, 'a.txt'), 'changed\n');

  const status = await discardPaths(repos.runtime, repos.work, ['a.txt'], true);

  assert.equal(status.entries.length, 0);
  assert.equal(await readFile(path.join(repos.work, 'a.txt'), 'utf8'), 'base\n');
});

test('AC-057: discard clears both the staged and the unstaged change', { skip }, async (t) => {
  const repos = await setupRepos(t, { 'a.txt': 'base\n' });
  await writeFile(path.join(repos.work, 'a.txt'), 'staged\n');
  await gitOk(repos.work, ['add', 'a.txt'], repos.home);
  await writeFile(path.join(repos.work, 'a.txt'), 'staged\nunstaged\n');

  const status = await discardPaths(repos.runtime, repos.work, ['a.txt'], true);

  assert.equal(status.entries.length, 0);
  assert.equal(await readFile(path.join(repos.work, 'a.txt'), 'utf8'), 'base\n');
});

test('AC-058: discard of a staged rename restores the old path', { skip }, async (t) => {
  const repos = await setupRepos(t, { 'old.txt': 'base\n' });
  await gitOk(repos.work, ['mv', 'old.txt', 'new.txt'], repos.home);

  const status = await discardPaths(repos.runtime, repos.work, ['new.txt'], true);

  assert.equal(status.entries.length, 0);
  assert.equal(await readFile(path.join(repos.work, 'old.txt'), 'utf8'), 'base\n');
  await assert.rejects(readFile(path.join(repos.work, 'new.txt')), (error) => error.code === 'ENOENT');
});

test('AC-059: discard deletes untracked files and leaves a look-alike path alone', { skip }, async (t) => {
  const repos = await setupRepos(t, { 'tracked.txt': 'base\n' });
  await writeFile(path.join(repos.work, 'u.txt'), 'untracked\n');
  await writeFile(path.join(repos.work, 'star*.txt'), 'star\n');
  await writeFile(path.join(repos.work, 'starX.txt'), 'other\n');

  const status = await discardPaths(repos.runtime, repos.work, ['u.txt', 'star*.txt'], true);

  await assert.rejects(readFile(path.join(repos.work, 'u.txt')), (error) => error.code === 'ENOENT');
  await assert.rejects(readFile(path.join(repos.work, 'star*.txt')), (error) => error.code === 'ENOENT');
  assert.equal(await readFile(path.join(repos.work, 'starX.txt'), 'utf8'), 'other\n');
  assert.deepEqual(status.entries.map((entry) => entry.path), ['starX.txt']);
});

test('AC-060: discard requires confirmation', { skip }, async (t) => {
  const repos = await setupRepos(t, { 'a.txt': 'base\n' });
  await writeFile(path.join(repos.work, 'a.txt'), 'changed\n');

  await assert.rejects(
    () => discardPaths(repos.runtime, repos.work, ['a.txt'], false),
    (error) => error.code === 'git/confirm-required',
  );

  assert.equal(await readFile(path.join(repos.work, 'a.txt'), 'utf8'), 'changed\n');
});

test('AC-061: discard removes a staged file in a repository without a commit', { skip }, async (t) => {
  const { root, home } = await tempRoot(t);
  const repo = path.join(root, 'repo');
  await mkdir(repo);
  await gitOk(root, ['init', '-q', repo], home);
  await writeFile(path.join(repo, 'first.txt'), 'first\n');
  await gitOk(repo, ['add', 'first.txt'], home);

  const status = await discardPaths(runtimeFor(home), repo, ['first.txt'], true);

  assert.equal(status.entries.length, 0);
  await assert.rejects(readFile(path.join(repo, 'first.txt')), (error) => error.code === 'ENOENT');
});

test('AC-066: discard deletes a staged new file in a repository with a commit', { skip }, async (t) => {
  const repos = await setupRepos(t, { 'a.txt': 'base\n' });
  await writeFile(path.join(repos.work, 'added.txt'), 'new\n');
  await gitOk(repos.work, ['add', 'added.txt'], repos.home);

  const status = await discardPaths(repos.runtime, repos.work, ['added.txt'], true);

  assert.equal(status.entries.length, 0);
  await assert.rejects(readFile(path.join(repos.work, 'added.txt')), (error) => error.code === 'ENOENT');
});

test('AC-067: discard is refused while a merge is in progress', { skip }, async (t) => {
  const repos = await setupRepos(t, { 'a.txt': 'one\ntwo\nthree\n' });
  await writeFile(path.join(repos.up, 'a.txt'), 'one\nUPSTREAM\nthree\n');
  await commitAndPush(repos, 'upstream edit');
  await writeFile(path.join(repos.work, 'a.txt'), 'one\nLOCAL\nthree\n');
  await gitOk(repos.work, ['commit', '-q', '-am', 'local commit'], repos.home);
  await gitOk(repos.work, ['fetch', '-q', 'origin'], repos.home);
  const merge = await runGit(repos.work, ['merge', 'origin/master'], repos.home);
  assert.notEqual(merge.code, 0);

  await assert.rejects(
    () => discardPaths(repos.runtime, repos.work, ['a.txt'], true),
    (error) => error.code === 'git/operation',
  );

  assert.match(await readFile(path.join(repos.work, 'a.txt'), 'utf8'), /<<<<<<< HEAD/);
});

test('AC-068: discard does not delete an untracked nested repository', { skip }, async (t) => {
  const repos = await setupRepos(t, { 'a.txt': 'base\n' });
  const nested = path.join(repos.work, 'nested');
  await mkdir(nested);
  await gitOk(nested, ['init', '-q'], repos.home);
  await writeFile(path.join(nested, 'inner.txt'), 'inner\n');

  await assert.rejects(
    () => discardPaths(repos.runtime, repos.work, ['nested/'], true),
    (error) => error.code === 'git/discard-incomplete',
  );

  assert.equal(await readFile(path.join(nested, 'inner.txt'), 'utf8'), 'inner\n');
});

test('AC-069: discarding an untracked path that reuses a rename old path leaves the rename', { skip }, async (t) => {
  const repos = await setupRepos(t, { 'old.txt': 'base\n' });
  await gitOk(repos.work, ['mv', 'old.txt', 'new.txt'], repos.home);
  await writeFile(path.join(repos.work, 'old.txt'), 'untracked\n');

  const status = await discardPaths(repos.runtime, repos.work, ['old.txt'], true);

  assert.deepEqual(status.entries.map((entry) => [entry.path, entry.kind]), [['new.txt', 'renamed']]);
  await assert.rejects(readFile(path.join(repos.work, 'old.txt')), (error) => error.code === 'ENOENT');
  assert.equal(await readFile(path.join(repos.work, 'new.txt'), 'utf8'), 'base\n');
});

test('AC-070: discarding a rename is refused when its old path holds another file', { skip }, async (t) => {
  const repos = await setupRepos(t, { 'old.txt': 'base\n' });
  await gitOk(repos.work, ['mv', 'old.txt', 'new.txt'], repos.home);
  await writeFile(path.join(repos.work, 'old.txt'), 'untracked\n');

  await assert.rejects(
    () => discardPaths(repos.runtime, repos.work, ['new.txt'], true),
    (error) => error.code === 'git/discard-blocked',
  );

  assert.equal(await readFile(path.join(repos.work, 'old.txt'), 'utf8'), 'untracked\n');
  assert.equal(await readFile(path.join(repos.work, 'new.txt'), 'utf8'), 'base\n');
  const porcelain = (await runGit(repos.work, ['status', '--porcelain'], repos.home)).stdout.trimEnd();
  assert.match(porcelain, /R  old\.txt -> new\.txt/);
  assert.match(porcelain, /\?\? old\.txt/);
});
