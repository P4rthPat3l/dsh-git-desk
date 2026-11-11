import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { commit, createBranchAndCommit } from '../dist/host/lib/git.js';
import { gitOk, runGit, runtimeFor, skip, tempRoot } from './git-fixture.mjs';

/**
 * Create a repository with one commit, a failing pre-commit hook, and a staged change.
 * @param {object} t the test context.
 * @returns {Promise<object>} the paths and runtime.
 */
async function repoWithFailingHook(t) {
  const { root, home } = await tempRoot(t);
  const repo = path.join(root, 'repo');
  await mkdir(repo);
  await gitOk(root, ['init', '-q', repo], home);
  await writeFile(path.join(repo, 'a.txt'), 'base\n');
  await gitOk(repo, ['add', 'a.txt'], home);
  await gitOk(repo, ['commit', '-q', '-m', 'base'], home);
  const hook = path.join(repo, '.git', 'hooks', 'pre-commit');
  await writeFile(hook, '#!/bin/sh\nexit 1\n');
  await chmod(hook, 0o755);
  await writeFile(path.join(repo, 'a.txt'), 'changed\n');
  await gitOk(repo, ['add', 'a.txt'], home);
  return { root, home, repo, runtime: runtimeFor(home) };
}

test('AC-071: a failing hook refuses a normal commit and leaves the change staged', { skip }, async (t) => {
  const repos = await repoWithFailingHook(t);

  await assert.rejects(
    () => commit(repos.runtime, repos.repo, { message: 'normal', amend: false, noVerify: false }),
    (error) => error.code === 'git/commit-failed',
  );

  assert.equal((await gitOk(repos.repo, ['log', '-1', '--format=%s'], repos.home)).stdout.trim(), 'base');
  assert.equal((await runGit(repos.repo, ['status', '--porcelain'], repos.home)).stdout.trimEnd(), 'M  a.txt');
});

test('AC-072: skip hooks commits through the failing hook', { skip }, async (t) => {
  const repos = await repoWithFailingHook(t);

  const result = await commit(repos.runtime, repos.repo, { message: 'skip hooks', amend: false, noVerify: true });

  assert.match(result.hash, /^[0-9a-f]{40}$/);
  assert.equal((await gitOk(repos.repo, ['log', '-1', '--format=%s'], repos.home)).stdout.trim(), 'skip hooks');
  assert.equal((await runGit(repos.repo, ['status', '--porcelain'], repos.home)).stdout.trim(), '');
});

test('AC-073: branch and commit passes skip hooks through', { skip }, async (t) => {
  const repos = await repoWithFailingHook(t);

  const result = await createBranchAndCommit(repos.runtime, repos.repo, {
    name: 'feature',
    message: 'branch commit',
    noVerify: true,
  });

  assert.match(result.hash, /^[0-9a-f]{40}$/);
  assert.equal((await gitOk(repos.repo, ['rev-parse', '--abbrev-ref', 'HEAD'], repos.home)).stdout.trim(), 'feature');
  assert.equal((await gitOk(repos.repo, ['log', '-1', '--format=%s'], repos.home)).stdout.trim(), 'branch commit');
});
