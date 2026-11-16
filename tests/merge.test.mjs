import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  merge,
  operationAbort,
  operationContinue,
  rebase,
  rebasePreview,
  rebaseSkip,
  status,
} from '../dist/host/lib/git.js';
import { commitAndPush, gitOk, runGit, runtimeFor, setupRepos, skip, tempRoot } from './git-fixture.mjs';

/**
 * Create a repository with one base commit.
 * @param {object} t the test context.
 * @param {Record<string, string>} files the base files.
 * @returns {Promise<{ repo: string, home: string, runtime: object }>} the fixture.
 */
async function initRepo(t, files) {
  const { root, home } = await tempRoot(t);
  const repo = path.join(root, 'work');
  await mkdir(repo, { recursive: true });
  await gitOk(repo, ['init', '-q', '-b', 'main'], home);
  for (const [name, content] of Object.entries(files)) {
    await writeFile(path.join(repo, name), content);
  }
  await gitOk(repo, ['add', '-A'], home);
  await gitOk(repo, ['commit', '-q', '-m', 'base'], home);
  return { repo, home, runtime: runtimeFor(home) };
}

/**
 * Write and commit one file.
 * @param {object} fixture the repository fixture.
 * @param {string} file the repository-relative path.
 * @param {string} content the new content.
 * @param {string} message the commit subject.
 * @returns {Promise<void>} resolves when the commit exists.
 */
async function commitFile(fixture, file, content, message) {
  await writeFile(path.join(fixture.repo, file), content);
  await gitOk(fixture.repo, ['add', '--', file], fixture.home);
  await gitOk(fixture.repo, ['commit', '-q', '-m', message], fixture.home);
}

/**
 * Read one revision hash.
 * @param {object} fixture the repository fixture.
 * @param {string} ref the revision.
 * @returns {Promise<string>} the hash.
 */
async function revParse(fixture, ref) {
  return (await gitOk(fixture.repo, ['rev-parse', ref], fixture.home)).stdout.trim();
}

/**
 * Read the checked-out branch of a clone.
 * @param {string} repo the repository path.
 * @param {string} home the empty home directory.
 * @returns {Promise<string>} the branch name.
 */
async function currentBranch(repo, home) {
  return (await gitOk(repo, ['branch', '--show-current'], home)).stdout.trim();
}

/**
 * Build two branches that both change the same line.
 * @param {object} t the test context.
 * @returns {Promise<object>} the repository fixture.
 */
async function conflictRepo(t) {
  const fixture = await initRepo(t, { 'a.txt': 'one\ntwo\nthree\n' });
  await gitOk(fixture.repo, ['checkout', '-qb', 'feature'], fixture.home);
  await commitFile(fixture, 'a.txt', 'one\nfeature\nthree\n', 'feature');
  await gitOk(fixture.repo, ['checkout', '-q', 'main'], fixture.home);
  await commitFile(fixture, 'a.txt', 'one\nmain\nthree\n', 'main');
  return fixture;
}

test('AC-122: merging an ahead branch fast-forwards without a merge commit', { skip }, async (t) => {
  const fixture = await initRepo(t, { 'a.txt': 'one\n' });
  await gitOk(fixture.repo, ['checkout', '-qb', 'feature'], fixture.home);
  await commitFile(fixture, 'a.txt', 'one\ntwo\n', 'feature');
  await gitOk(fixture.repo, ['checkout', '-q', 'main'], fixture.home);
  // The dialog promises a fast-forward; a repository setting must not turn it
  // into a merge commit.
  await gitOk(fixture.repo, ['config', 'merge.ff', 'false'], fixture.home);

  const result = await merge(fixture.runtime, fixture.repo, { branch: 'feature', noFastForward: false });

  assert.equal(result.status.merging, false);
  assert.equal(result.conflicted, undefined);
  assert.equal(await revParse(fixture, 'HEAD'), await revParse(fixture, 'feature'));
  const parents = (await gitOk(fixture.repo, ['log', '-1', '--format=%P'], fixture.home)).stdout.trim().split(' ');
  assert.equal(parents.length, 1, 'a fast-forward creates no second parent');
  assert.equal(result.status.entries.length, 0);
});

test('AC-123: merging a diverged branch creates a two-parent commit', { skip }, async (t) => {
  const fixture = await initRepo(t, { 'a.txt': 'one\n', 'b.txt': 'base\n' });
  await gitOk(fixture.repo, ['checkout', '-qb', 'feature'], fixture.home);
  await commitFile(fixture, 'a.txt', 'one\nfeature\n', 'feature');
  await gitOk(fixture.repo, ['checkout', '-q', 'main'], fixture.home);
  await commitFile(fixture, 'b.txt', 'base\nmain\n', 'main');

  const result = await merge(fixture.runtime, fixture.repo, { branch: 'feature', noFastForward: false });

  assert.equal(result.status.merging, false);
  const parents = (await gitOk(fixture.repo, ['log', '-1', '--format=%P'], fixture.home)).stdout.trim().split(' ');
  assert.equal(parents.length, 2, 'a real merge has two parents');
  assert.equal(result.status.entries.length, 0);
});

test('AC-124: noFastForward creates a merge commit when a fast-forward is possible', { skip }, async (t) => {
  const fixture = await initRepo(t, { 'a.txt': 'one\n' });
  await gitOk(fixture.repo, ['checkout', '-qb', 'feature'], fixture.home);
  await commitFile(fixture, 'a.txt', 'one\ntwo\n', 'feature');
  await gitOk(fixture.repo, ['checkout', '-q', 'main'], fixture.home);

  const result = await merge(fixture.runtime, fixture.repo, { branch: 'feature', noFastForward: true });

  assert.equal(result.status.merging, false);
  const parents = (await gitOk(fixture.repo, ['log', '-1', '--format=%P'], fixture.home)).stdout.trim().split(' ');
  assert.equal(parents.length, 2, 'the merge commit exists');
  assert.notEqual(await revParse(fixture, 'HEAD'), await revParse(fixture, 'feature'));
});

test('AC-125: a merge conflict returns normally with the conflicted paths and markers', { skip }, async (t) => {
  const fixture = await conflictRepo(t);

  const result = await merge(fixture.runtime, fixture.repo, { branch: 'feature', noFastForward: false });

  assert.equal(result.status.merging, true);
  assert.deepEqual(result.conflicted, ['a.txt']);
  assert.deepEqual(result.status.conflicts, ['a.txt']);
  assert.match(await readFile(path.join(fixture.repo, 'a.txt'), 'utf8'), /<<<<<<< HEAD/);
});

test('AC-102: continue commits a resolved merge and refuses while a conflict remains', { skip }, async (t) => {
  const fixture = await conflictRepo(t);
  await merge(fixture.runtime, fixture.repo, { branch: 'feature', noFastForward: false });

  await assert.rejects(() => operationContinue(fixture.runtime, fixture.repo), { code: 'git/conflict' });

  await writeFile(path.join(fixture.repo, 'a.txt'), 'one\nresolved\nthree\n');
  await gitOk(fixture.repo, ['add', '--', 'a.txt'], fixture.home);
  const result = await operationContinue(fixture.runtime, fixture.repo);

  assert.equal(result.status.merging, false);
  assert.equal(result.status.conflicts.length, 0);
  const parents = (await gitOk(fixture.repo, ['log', '-1', '--format=%P'], fixture.home)).stdout.trim().split(' ');
  assert.equal(parents.length, 2, 'the merge commit is created');
  assert.equal((await runGit(fixture.repo, ['status', '--porcelain'], fixture.home)).stdout.trim(), '');
});

test('AC-103: abort restores the branch, the index, and the files after a merge conflict', { skip }, async (t) => {
  const fixture = await conflictRepo(t);
  const head = await revParse(fixture, 'HEAD');
  await merge(fixture.runtime, fixture.repo, { branch: 'feature', noFastForward: false });
  assert.match(await readFile(path.join(fixture.repo, 'a.txt'), 'utf8'), /<<<<<<< HEAD/);

  const result = await operationAbort(fixture.runtime, fixture.repo);

  assert.equal(result.status.merging, false);
  assert.equal(await revParse(fixture, 'HEAD'), head);
  assert.equal(await readFile(path.join(fixture.repo, 'a.txt'), 'utf8'), 'one\nmain\nthree\n');
  assert.equal((await runGit(fixture.repo, ['status', '--porcelain'], fixture.home)).stdout.trim(), '');
});

test('AC-104: rebase replays the branch on the source and leaves a linear history', { skip }, async (t) => {
  const fixture = await initRepo(t, { 'a.txt': 'base\n', 'b.txt': 'base\n' });
  await gitOk(fixture.repo, ['checkout', '-qb', 'feature'], fixture.home);
  await commitFile(fixture, 'a.txt', 'feature\n', 'feature');
  await gitOk(fixture.repo, ['checkout', '-q', 'main'], fixture.home);
  await commitFile(fixture, 'b.txt', 'main\n', 'main');
  await gitOk(fixture.repo, ['checkout', '-q', 'feature'], fixture.home);

  const result = await rebase(fixture.runtime, fixture.repo, { branch: 'main' });

  assert.equal(result.status.rebasing, false);
  assert.equal(result.status.branch.name, 'feature');
  assert.equal(
    (await runGit(fixture.repo, ['merge-base', '--is-ancestor', 'main', 'HEAD'], fixture.home)).code,
    0,
    'the source is an ancestor after the rebase',
  );
  const subjects = (await gitOk(fixture.repo, ['log', '--format=%s'], fixture.home)).stdout.trim().split('\n');
  assert.deepEqual(subjects, ['feature', 'main', 'base']);
  assert.equal(result.status.entries.length, 0);
});

test('AC-105: a rebase conflict stays rebasing after staging and continue finishes it', { skip }, async (t) => {
  const fixture = await conflictRepo(t);
  await gitOk(fixture.repo, ['checkout', '-q', 'feature'], fixture.home);
  const stoppedCommit = await revParse(fixture, 'HEAD');

  const stopped = await rebase(fixture.runtime, fixture.repo, { branch: 'main' });
  assert.equal(stopped.status.rebasing, true);
  assert.equal(stopped.status.operationCommit, stoppedCommit);
  assert.deepEqual(stopped.conflicted, ['a.txt']);
  assert.match(await readFile(path.join(fixture.repo, 'a.txt'), 'utf8'), /<<<<<<< HEAD/);

  await writeFile(path.join(fixture.repo, 'a.txt'), 'one\nresolved\nthree\n');
  await gitOk(fixture.repo, ['add', '--', 'a.txt'], fixture.home);
  const staged = await status(fixture.runtime, fixture.repo);
  assert.equal(staged.rebasing, true, 'the rebase is still running before Continue');
  assert.deepEqual(staged.conflicts, []);

  const finished = await operationContinue(fixture.runtime, fixture.repo);
  assert.equal(finished.status.rebasing, false);
  assert.equal(finished.status.conflicts.length, 0);
  assert.equal(finished.status.branch.name, 'feature');
});

test('AC-106: skip drops the stopped commit and abort restores the branch', { skip }, async (t) => {
  const fixture = await conflictRepo(t);
  await gitOk(fixture.repo, ['checkout', '-q', 'feature'], fixture.home);
  const skippedHead = await revParse(fixture, 'HEAD');
  await rebase(fixture.runtime, fixture.repo, { branch: 'main' });

  const skipped = await rebaseSkip(fixture.runtime, fixture.repo);
  assert.equal(skipped.skipped, skippedHead);
  assert.equal(skipped.status.rebasing, false);
  const subjects = (await gitOk(fixture.repo, ['log', '--format=%s'], fixture.home)).stdout.trim().split('\n');
  assert.equal(subjects.includes('feature'), false, 'the stopped commit is gone');

  const other = await conflictRepo(t);
  await gitOk(other.repo, ['checkout', '-q', 'feature'], other.home);
  const before = await revParse(other, 'HEAD');
  await rebase(other.runtime, other.repo, { branch: 'main' });
  const aborted = await operationAbort(other.runtime, other.repo);
  assert.equal(aborted.status.rebasing, false);
  assert.equal(await revParse(other, 'HEAD'), before);
  assert.equal((await runGit(other.repo, ['status', '--porcelain'], other.home)).stdout.trim(), '');
});

test('AC-107: the current branch, a missing branch, and a detached HEAD are refused', { skip }, async (t) => {
  const fixture = await initRepo(t, { 'a.txt': 'one\n' });
  await gitOk(fixture.repo, ['checkout', '-qb', 'feature'], fixture.home);
  await commitFile(fixture, 'a.txt', 'one\ntwo\n', 'feature');
  await gitOk(fixture.repo, ['checkout', '-q', 'main'], fixture.home);
  const head = await revParse(fixture, 'HEAD');

  await assert.rejects(
    () => merge(fixture.runtime, fixture.repo, { branch: 'main', noFastForward: false }),
    { code: 'git/branch-invalid' },
  );
  await assert.rejects(
    () => merge(fixture.runtime, fixture.repo, { branch: 'missing', noFastForward: false }),
    { code: 'git/branch-invalid' },
  );
  await assert.rejects(
    () => rebase(fixture.runtime, fixture.repo, { branch: 'main' }),
    { code: 'git/branch-invalid' },
  );
  await gitOk(fixture.repo, ['checkout', '--detach'], fixture.home);
  await assert.rejects(
    () => merge(fixture.runtime, fixture.repo, { branch: 'main', noFastForward: false }),
    { code: 'git/detached' },
  );
  await assert.rejects(() => rebase(fixture.runtime, fixture.repo, { branch: 'main' }), { code: 'git/detached' });
  assert.equal(await revParse(fixture, 'HEAD'), head);
});

test('AC-108: a dirty working tree refuses a rebase and leaves the file untouched', { skip }, async (t) => {
  const fixture = await initRepo(t, { 'a.txt': 'base\n' });
  await gitOk(fixture.repo, ['checkout', '-qb', 'feature'], fixture.home);
  await commitFile(fixture, 'a.txt', 'feature\n', 'feature');
  const head = await revParse(fixture, 'HEAD');
  await writeFile(path.join(fixture.repo, 'a.txt'), 'dirty\n');

  await assert.rejects(() => rebase(fixture.runtime, fixture.repo, { branch: 'main' }), {
    code: 'git/dirty-tree',
  });
  assert.equal(await readFile(path.join(fixture.repo, 'a.txt'), 'utf8'), 'dirty\n');
  assert.equal(await revParse(fixture, 'HEAD'), head);

  await gitOk(fixture.repo, ['add', '--', 'a.txt'], fixture.home);
  await assert.rejects(() => rebase(fixture.runtime, fixture.repo, { branch: 'main' }), {
    code: 'git/dirty-tree',
  });
  assert.equal(await readFile(path.join(fixture.repo, 'a.txt'), 'utf8'), 'dirty\n');
});

test('AC-109: another operation is refused while Continue and Abort still work', { skip }, async (t) => {
  const fixture = await conflictRepo(t);
  await merge(fixture.runtime, fixture.repo, { branch: 'feature', noFastForward: false });

  await assert.rejects(
    () => merge(fixture.runtime, fixture.repo, { branch: 'feature', noFastForward: true }),
    { code: 'git/operation-in-progress' },
  );
  await assert.rejects(() => rebase(fixture.runtime, fixture.repo, { branch: 'feature' }), {
    code: 'git/operation-in-progress',
  });
  await assert.rejects(() => operationContinue(fixture.runtime, fixture.repo), { code: 'git/conflict' });
  const aborted = await operationAbort(fixture.runtime, fixture.repo);
  assert.equal(aborted.status.merging, false);
  await assert.rejects(() => operationContinue(fixture.runtime, fixture.repo), { code: 'git/no-operation' });
  await assert.rejects(() => operationAbort(fixture.runtime, fixture.repo), { code: 'git/no-operation' });
  await assert.rejects(() => rebaseSkip(fixture.runtime, fixture.repo), { code: 'git/no-operation' });
});

test('AC-110: a remote source merges and rebases without creating a local branch', { skip }, async (t) => {
  const mergeRepos = await setupRepos(t, { 'a.txt': 'base\n' });
  const mergeBase = await currentBranch(mergeRepos.work, mergeRepos.home);
  await writeFile(path.join(mergeRepos.up, 'a.txt'), 'upstream\n');
  await commitAndPush(mergeRepos, 'upstream edit');
  await gitOk(mergeRepos.work, ['fetch', '-q', 'origin'], mergeRepos.home);
  const mergeWork = { repo: mergeRepos.work, home: mergeRepos.home };

  const merged = await merge(mergeRepos.runtime, mergeRepos.work, {
    branch: `origin/${mergeBase}`,
    noFastForward: false,
  });
  assert.equal(merged.status.merging, false);
  assert.equal(await revParse(mergeWork, 'HEAD'), await revParse(mergeWork, `origin/${mergeBase}`));
  assert.notEqual(
    (await runGit(mergeRepos.work, ['show-ref', '--verify', '--quiet', 'refs/heads/origin/main'], mergeRepos.home)).code,
    0,
    'no local branch named after the remote ref exists',
  );

  const rebaseRepos = await setupRepos(t, { 'a.txt': 'base\n', 'b.txt': 'base\n' });
  const rebaseBase = await currentBranch(rebaseRepos.work, rebaseRepos.home);
  await writeFile(path.join(rebaseRepos.work, 'b.txt'), 'local\n');
  await gitOk(rebaseRepos.work, ['add', '--', 'b.txt'], rebaseRepos.home);
  await gitOk(rebaseRepos.work, ['commit', '-q', '-m', 'local'], rebaseRepos.home);
  await writeFile(path.join(rebaseRepos.up, 'a.txt'), 'upstream\n');
  await commitAndPush(rebaseRepos, 'upstream edit');
  await gitOk(rebaseRepos.work, ['fetch', '-q', 'origin'], rebaseRepos.home);

  const rebased = await rebase(rebaseRepos.runtime, rebaseRepos.work, {
    branch: `origin/${rebaseBase}`,
  });
  assert.equal(rebased.status.rebasing, false);
  assert.equal(
    (await runGit(rebaseRepos.work, ['merge-base', '--is-ancestor', `origin/${rebaseBase}`, 'HEAD'], rebaseRepos.home)).code,
    0,
    'the fetched source is an ancestor',
  );
  assert.notEqual(
    (await runGit(rebaseRepos.work, ['show-ref', '--verify', '--quiet', 'refs/heads/origin/main'], rebaseRepos.home)).code,
    0,
    'no local branch is created for the remote source',
  );
});

test('AC-126: the rebase preview counts the replay and pushed commits', { skip }, async (t) => {
  const repos = await setupRepos(t, { 'a.txt': 'base\n' });
  const base = await currentBranch(repos.work, repos.home);
  await gitOk(repos.work, ['checkout', '-q', '-b', 'feature'], repos.home);
  await writeFile(path.join(repos.work, 'a.txt'), 'first\n');
  await gitOk(repos.work, ['add', '--', 'a.txt'], repos.home);
  await gitOk(repos.work, ['commit', '-q', '-m', 'first'], repos.home);
  await gitOk(repos.work, ['push', '-q', '-u', 'origin', 'feature'], repos.home);
  await writeFile(path.join(repos.work, 'a.txt'), 'second\n');
  await gitOk(repos.work, ['add', '--', 'a.txt'], repos.home);
  await gitOk(repos.work, ['commit', '-q', '-m', 'second'], repos.home);

  const preview = await rebasePreview(repos.runtime, repos.work, { branch: base });
  assert.deepEqual(preview, { commits: 2, pushed: 1, upstream: 'origin/feature' });

  const local = await initRepo(t, { 'a.txt': 'base\n' });
  await gitOk(local.repo, ['checkout', '-qb', 'feature'], local.home);
  await commitFile(local, 'a.txt', 'feature\n', 'feature');
  const noUpstream = await rebasePreview(local.runtime, local.repo, { branch: 'main' });
  assert.deepEqual(noUpstream, { commits: 1, pushed: 0, upstream: null });
});
