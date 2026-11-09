import { writeCommitMessage } from './ai.js';
import { GitError } from './exec.js';
import {
  applyBlocks,
  branches,
  checkout,
  commit,
  commitDetail,
  createBranch,
  createBranchAndCommit,
  discoverRepositories,
  diff,
  fetch,
  findRepository,
  initRepository,
  log,
  pull,
  push,
  recentSubjects,
  resolveConflict,
  resolveRepository,
  stagePaths,
  stagedPatch,
  stashApply,
  stashDrop,
  stashList,
  stashPush,
  status,
  unstagePaths,
} from './git.js';

function workspaceOf(ctx, payload) {
  const id = payload !== null && typeof payload === 'object' ? payload.workspaceId : undefined;
  if (typeof id !== 'string' || id === '') {
    throw new GitError('git/no-workspace', 'Choose a workspace first.');
  }
  const workspace = ctx.workspaceRegistry.get(id);
  if (workspace === undefined) {
    throw new GitError('git/no-workspace', 'That workspace is no longer registered.');
  }
  return workspace;
}

async function repoOf(runtime, workspace, payload) {
  const requested = valueOf(payload, 'repo');
  if (typeof requested === 'string' && requested !== '') {
    return resolveRepository(runtime, workspace.path, requested);
  }
  const root = await findRepository(runtime, workspace.path);
  if (root === null) {
    throw new GitError('git/not-repo', 'This workspace is not a Git repository.', {
      path: workspace.path,
    });
  }
  return root;
}

function workspaceInfo(workspace) {
  return { id: workspace.id, title: workspace.title, path: workspace.path };
}

function valueOf(payload, key) {
  return payload !== null && typeof payload === 'object' ? payload[key] : undefined;
}

async function dispatch(ctx, runtime, endpoint, payload) {
  const workspace = workspaceOf(ctx, payload);
  if (endpoint === 'status' || endpoint === 'init') {
    if (endpoint === 'init') {
      const snapshot = await initRepository(runtime, workspace.path);
      return {
        ...snapshot,
        repos: await discoverRepositories(runtime, workspace.path),
        selected: snapshot.root,
        workspace: workspaceInfo(workspace),
      };
    }
    const requested = valueOf(payload, 'repo');
    if (typeof requested === 'string' && requested !== '') {
      const root = await resolveRepository(runtime, workspace.path, requested);
      const snapshot = await status(runtime, root);
      return {
        ...snapshot,
        selected: root,
        workspace: workspaceInfo(workspace),
      };
    }
    const repos = await discoverRepositories(runtime, workspace.path);
    const workspaceRepo = await findRepository(runtime, workspace.path);
    if (workspaceRepo !== null) {
      const snapshot = await status(runtime, workspaceRepo);
      return {
        ...snapshot,
        repos,
        selected: workspaceRepo,
        workspace: workspaceInfo(workspace),
      };
    }
    return {
      repo: false,
      root: null,
      branch: {
        oid: null,
        name: null,
        upstream: null,
        ahead: 0,
        behind: 0,
        detached: false,
        initial: true,
      },
      entries: [],
      merging: false,
      rebasing: false,
      conflicts: [],
      repos,
      selected: null,
      workspace: workspaceInfo(workspace),
    };
  }

  const root = await repoOf(runtime, workspace, payload);

  switch (endpoint) {
    case 'diff':
      return diff(runtime, root, {
        path: valueOf(payload, 'path'),
        side: valueOf(payload, 'side'),
        commit: valueOf(payload, 'commit'),
        parent: valueOf(payload, 'parent'),
      });
    case 'stage':
      return stagePaths(runtime, root, Array.isArray(valueOf(payload, 'paths')) ? valueOf(payload, 'paths') : []);
    case 'unstage':
      return unstagePaths(runtime, root, Array.isArray(valueOf(payload, 'paths')) ? valueOf(payload, 'paths') : []);
    case 'applyBlocks':
      return applyBlocks(runtime, root, {
        path: valueOf(payload, 'path'),
        side: valueOf(payload, 'side'),
        blocks: valueOf(payload, 'blocks'),
        baseHash: valueOf(payload, 'baseHash'),
        targetHash: valueOf(payload, 'targetHash'),
        confirm: valueOf(payload, 'confirm'),
      });
    case 'commit':
      return commit(runtime, root, {
        message: valueOf(payload, 'message'),
        amend: valueOf(payload, 'amend') === true,
      });
    case 'createBranchAndCommit':
      return createBranchAndCommit(runtime, root, {
        name: valueOf(payload, 'name'),
        message: valueOf(payload, 'message'),
      });
    case 'push':
      return push(runtime, root);
    case 'pull':
      return pull(runtime, root);
    case 'fetch':
      return fetch(runtime, root);
    case 'log':
      return log(runtime, root);
    case 'commitDetail':
      return commitDetail(runtime, root, { hash: valueOf(payload, 'hash') });
    case 'branches':
      return branches(runtime, root);
    case 'createBranch':
      return createBranch(runtime, root, { name: valueOf(payload, 'name') });
    case 'checkout':
      return checkout(runtime, root, {
        branch: valueOf(payload, 'branch'),
        remote: valueOf(payload, 'remote') === true,
      });
    case 'stashList':
      return stashList(runtime, root);
    case 'stashPush':
      return stashPush(runtime, root, {
        message: valueOf(payload, 'message'),
        paths: Array.isArray(valueOf(payload, 'paths')) ? valueOf(payload, 'paths') : [],
        includeUntracked: valueOf(payload, 'includeUntracked') === true,
      });
    case 'stashApply':
      return stashApply(runtime, root, {
        ref: valueOf(payload, 'ref'),
        pop: valueOf(payload, 'pop') === true,
      });
    case 'stashDrop':
      return stashDrop(runtime, root, { ref: valueOf(payload, 'ref') });
    case 'resolve':
      return resolveConflict(runtime, root, {
        path: valueOf(payload, 'path'),
        side: valueOf(payload, 'side'),
      });
    case 'aiMessage': {
      const patch = await stagedPatch(runtime, root);
      if (patch.trim() === '') {
        throw new GitError('git/nothing-staged', 'Stage at least one file before asking AI for a message.');
      }
      const recent = await recentSubjects(runtime, root, 5);
      return writeCommitMessage(ctx, {
        patch,
        recent,
        signal: AbortSignal.timeout(60_000),
      });
    }
    default:
      throw new GitError('git/unknown-method', `Unknown Git action: ${endpoint}`);
  }
}

export function createHandler(ctx, runtime) {
  return async function handler(endpoint, payload, signal, peer) {
    if (peer === undefined || peer.principal?.kind !== 'owner') {
      return {
        ok: false,
        error: {
          code: 'git/forbidden',
          message: 'Git actions are available only to the local user.',
          details: {},
        },
      };
    }
    try {
      const value = await dispatch(ctx, runtime, endpoint, payload);
      return { ok: true, value };
    } catch (error) {
      if (error instanceof GitError) {
        return {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details ?? {},
          },
        };
      }
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        error: {
          code: signal?.aborted ? 'git/cancelled' : 'git/internal',
          message: message === '' ? 'The Git action failed.' : message,
          details: {},
        },
      };
    }
  };
}
