import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { branches, checkout, discoverRepositories, resolveRepository } from '../dist/host/lib/git.js';
import { createHandler } from '../dist/host/lib/rpc.js';
import { gitOk, runtimeFor, skip, tempRoot } from './git-fixture.mjs';

const PEER = { principal: { kind: 'owner' } };

/**
 * Build a workspace repository with one worktree inside it and one outside it.
 * @param {object} t the test context.
 * @returns {Promise<object>} the paths, home, and runtime.
 */
async function workspaceWithWorktrees(t) {
  const { root, home } = await tempRoot(t);
  const workspace = path.join(root, 'ws');
  await mkdir(workspace);
  await gitOk(workspace, ['init', '-q', '-b', 'main'], home);
  await writeFile(path.join(workspace, 'a.txt'), 'base\n');
  await gitOk(workspace, ['add', '-A'], home);
  await gitOk(workspace, ['commit', '-q', '-m', 'base'], home);
  const inside = path.join(workspace, '.agents', 'worktrees', 'dsh-abc');
  await gitOk(workspace, ['worktree', 'add', '-q', '-b', 'dsh-abc', inside], home);
  const outside = path.join(root, 'outside');
  await gitOk(workspace, ['worktree', 'add', '-q', '-b', 'far', outside], home);
  return { root, home, workspace, inside, outside, runtime: runtimeFor(home) };
}

/**
 * Build the endpoint handler for one workspace.
 * @param {object} runtime the runtime helpers.
 * @param {string} workspacePath the workspace path.
 * @returns {Function} the handler.
 */
function handlerFor(runtime, workspacePath) {
  const workspace = { id: 'ws-1', title: 'Test', path: workspacePath };
  return createHandler(
    {
      workspaceRegistry: { get: (id) => (id === 'ws-1' ? workspace : undefined) },
      get: () => undefined,
    },
    runtime,
  );
}

test('AC-074: status follows a Session that works inside a linked worktree', { skip }, async (t) => {
  const setup = await workspaceWithWorktrees(t);
  await writeFile(path.join(setup.inside, 'in-worktree.txt'), 'here\n');
  await writeFile(path.join(setup.workspace, 'in-main.txt'), 'here\n');
  const handler = handlerFor(setup.runtime, setup.workspace);

  const result = await handler('status', { workspaceId: 'ws-1', sessionDir: setup.inside }, undefined, PEER);

  assert.equal(result.ok, true, JSON.stringify(result.error));
  assert.equal(result.value.sessionRoot, await realpath(setup.inside));
  assert.equal(result.value.worktree, true);
  assert.equal(result.value.root, await realpath(setup.inside));
  assert.equal(result.value.branch.name, 'dsh-abc');
  assert.deepEqual(
    result.value.entries.map((entry) => entry.path),
    ['in-worktree.txt'],
  );
});

test('AC-075: a commit through the worktree root moves only that branch', { skip }, async (t) => {
  const setup = await workspaceWithWorktrees(t);
  await writeFile(path.join(setup.inside, 'b.txt'), 'new\n');
  await gitOk(setup.inside, ['add', 'b.txt'], setup.home);
  const mainHead = (await gitOk(setup.workspace, ['rev-parse', 'HEAD'], setup.home)).stdout.trim();
  const handler = handlerFor(setup.runtime, setup.workspace);

  const result = await handler(
    'commit',
    { workspaceId: 'ws-1', repo: setup.inside, message: 'worktree commit' },
    undefined,
    PEER,
  );

  assert.equal(result.ok, true, JSON.stringify(result.error));
  const worktreeHead = (await gitOk(setup.inside, ['rev-parse', 'HEAD'], setup.home)).stdout.trim();
  assert.notEqual(worktreeHead, mainHead, 'the worktree branch moved');
  assert.equal(
    (await gitOk(setup.workspace, ['rev-parse', 'HEAD'], setup.home)).stdout.trim(),
    mainHead,
    'the main checkout kept its HEAD',
  );
  assert.equal(
    (await gitOk(setup.workspace, ['diff', '--cached', '--name-only'], setup.home)).stdout.trim(),
    '',
    'the main checkout index is untouched',
  );
  assert.equal(await readFile(path.join(setup.workspace, 'a.txt'), 'utf8'), 'base\n');
  await assert.rejects(readFile(path.join(setup.workspace, 'b.txt')), (error) => error.code === 'ENOENT');
});

test('AC-076: the repository list adds linked worktrees and drops a prunable one', { skip }, async (t) => {
  const setup = await workspaceWithWorktrees(t);
  const doomed = path.join(setup.root, 'doomed');
  await gitOk(setup.workspace, ['worktree', 'add', '-q', '-b', 'doomed', doomed], setup.home);
  await rm(doomed, { recursive: true, force: true });

  const list = await discoverRepositories(setup.runtime, setup.workspace);

  const inside = list.find((item) => item.root === setup.inside);
  assert.notEqual(inside, undefined, 'the worktree inside the workspace is listed');
  assert.equal(inside.worktree, true);
  assert.equal(inside.branch, 'dsh-abc');
  assert.equal(inside.label, 'dsh-abc');

  const main = list[0];
  assert.equal(main.root, await realpath(setup.workspace));
  assert.equal(main.worktree, false);
  assert.equal(main.branch, 'main');

  const outside = list.find((item) => item.root === setup.outside);
  assert.equal(outside?.worktree, true, 'a worktree outside the folder is still listed');
  assert.equal(list.some((item) => item.root === doomed), false, 'the deleted worktree is not listed');
});

test('AC-077: a worktree outside the folder is accepted only when its repository is inside', { skip }, async (t) => {
  const setup = await workspaceWithWorktrees(t);

  const accepted = await resolveRepository(setup.runtime, setup.workspace, setup.outside);
  assert.equal(accepted, await realpath(setup.outside));

  const other = path.join(setup.root, 'other');
  await mkdir(other);
  await gitOk(other, ['init', '-q', '-b', 'main'], setup.home);
  await assert.rejects(
    () => resolveRepository(setup.runtime, setup.workspace, other),
    (error) => error.code === 'git/repo-invalid',
  );
});

test('AC-078: a branch checked out in another worktree is marked and refused', { skip }, async (t) => {
  const setup = await workspaceWithWorktrees(t);
  const list = await branches(setup.runtime, setup.workspace);

  const taken = list.branches.find((item) => item.name === 'dsh-abc');
  assert.notEqual(taken, undefined);
  assert.equal(taken.worktree, setup.inside);
  assert.equal(list.branches.find((item) => item.name === 'main')?.worktree, null);
  assert.equal(list.branches.find((item) => item.name === 'far')?.worktree, setup.outside);

  await assert.rejects(
    () => checkout(setup.runtime, setup.workspace, { branch: 'dsh-abc', remote: false }),
    (error) => error.code === 'git/branch-in-worktree',
  );
  assert.equal(
    (await gitOk(setup.workspace, ['rev-parse', '--abbrev-ref', 'HEAD'], setup.home)).stdout.trim(),
    'main',
    'the checkout never ran',
  );
});

test('AC-079: a Session in the main checkout reports the workspace repository', { skip }, async (t) => {
  const setup = await workspaceWithWorktrees(t);
  const handler = handlerFor(setup.runtime, setup.workspace);

  const result = await handler('status', { workspaceId: 'ws-1', sessionDir: setup.workspace }, undefined, PEER);

  assert.equal(result.ok, true, JSON.stringify(result.error));
  assert.equal(result.value.sessionRoot, await realpath(setup.workspace));
  assert.equal(result.value.worktree, false);
  assert.equal(result.value.branch.name, 'main');
  assert.equal(result.value.repos.length, 3, 'the workspace repository and both worktrees are listed');
});
