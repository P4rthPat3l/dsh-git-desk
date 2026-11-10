import type { DiffSide, RepoInfo, StatusSnapshot, WorkspaceInfo } from '../../contract.js';
import { preferences, writeCommitMessage } from './ai.js';
import { GitError } from './exec.js';
import type { GitRuntime } from './exec.js';
import {
  applyBlocks,
  branches,
  checkout,
  cherryPickCommit,
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
  resetToCommit,
  resolveConflict,
  resolveRepository,
  revertCommit,
  stagePaths,
  stagedPatch,
  stashApply,
  stashDrop,
  stashList,
  stashPush,
  status,
  undoCommit,
  unstagePaths,
} from './git.js';
import type { EndpointHandler, WorkspaceRecord, WorkspaceRegistry } from './types.js';

/** The host surface the endpoints need. */
export interface HandlerContext {
  readonly workspaceRegistry: WorkspaceRegistry;
  get(name: string): unknown;
}

/**
 * Read one field from a client payload.
 * @param payload the payload.
 * @param key the field name.
 * @returns the field value.
 */
function valueOf(payload: unknown, key: string): unknown {
  return payload !== null && typeof payload === 'object' ? (payload as Record<string, unknown>)[key] : undefined;
}

/**
 * Read one required string field.
 * @param payload the payload.
 * @param key the field name.
 * @returns the field.
 */
function stringField(payload: unknown, key: string): string {
  const value = valueOf(payload, key);
  if (typeof value !== 'string' || value === '') {
    throw new GitError('git/bad-request', `The request is missing "${key}".`);
  }
  return value;
}

/**
 * Read one optional string field.
 * @param payload the payload.
 * @param key the field name.
 * @returns the field, or undefined.
 */
function optionalString(payload: unknown, key: string): string | undefined {
  const value = valueOf(payload, key);
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * Read one list of path strings.
 * @param payload the payload.
 * @param key the field name.
 * @returns the paths, empty when the field is absent.
 */
function pathsField(payload: unknown, key: string): string[] {
  const value = valueOf(payload, key);
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item !== '');
}

/**
 * Read the diff side a request names.
 * @param payload the payload.
 * @returns the side.
 */
function sideField(payload: unknown): DiffSide {
  const value = valueOf(payload, 'side');
  if (value !== 'unstaged' && value !== 'staged' && value !== 'conflict' && value !== 'log') {
    throw new GitError('git/invalid-side', 'Unknown diff side.');
  }
  return value;
}

/**
 * Resolve the workspace a request targets.
 * @param ctx the host context.
 * @param payload the client payload.
 * @returns the workspace.
 */
function workspaceOf(ctx: HandlerContext, payload: unknown): WorkspaceRecord {
  const id = valueOf(payload, 'workspaceId');
  if (typeof id !== 'string' || id === '') {
    throw new GitError('git/no-workspace', 'Choose a workspace first.');
  }
  const workspace = ctx.workspaceRegistry.get(id);
  if (workspace === undefined) {
    throw new GitError('git/no-workspace', 'That workspace is no longer registered.');
  }
  return workspace;
}

/**
 * Resolve the repository a request targets.
 * @param runtime the runtime helpers.
 * @param workspace the workspace.
 * @param payload the client payload.
 * @returns the repository root.
 */
async function repoOf(runtime: GitRuntime, workspace: WorkspaceRecord, payload: unknown): Promise<string> {
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

/**
 * Name one workspace for the panel.
 * @param workspace the workspace.
 * @returns the panel shape.
 */
function workspaceInfo(workspace: WorkspaceRecord): WorkspaceInfo {
  return { id: workspace.id, title: workspace.title, path: workspace.path };
}

/**
 * Read the status for one workspace, including the repository list.
 * @param runtime the runtime helpers.
 * @param workspace the workspace.
 * @param payload the client payload.
 * @returns the snapshot.
 */
async function statusFor(
  runtime: GitRuntime,
  workspace: WorkspaceRecord,
  payload: unknown,
): Promise<StatusSnapshot> {
  const requested = valueOf(payload, 'repo');
  if (typeof requested === 'string' && requested !== '') {
    const root = await resolveRepository(runtime, workspace.path, requested);
    const snapshot = await status(runtime, root);
    return { ...snapshot, selected: root, workspace: workspaceInfo(workspace) };
  }
  const repos: RepoInfo[] = await discoverRepositories(runtime, workspace.path);
  const workspaceRepo = await findRepository(runtime, workspace.path);
  if (workspaceRepo !== null) {
    const snapshot = await status(runtime, workspaceRepo);
    return { ...snapshot, repos, selected: workspaceRepo, workspace: workspaceInfo(workspace) };
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
    reverting: false,
    cherryPicking: false,
    conflicts: [],
    repos,
    selected: null,
    workspace: workspaceInfo(workspace),
  };
}

/**
 * Run one Git endpoint.
 * @param ctx the host context.
 * @param runtime the runtime helpers.
 * @param endpoint the endpoint name.
 * @param payload the client payload.
 * @returns the endpoint value.
 */
async function dispatch(
  ctx: HandlerContext,
  runtime: GitRuntime,
  endpoint: string,
  payload: unknown,
): Promise<unknown> {
  if (endpoint === 'preferences') return preferences(ctx);
  const workspace = workspaceOf(ctx, payload);
  if (endpoint === 'init') {
    const snapshot = await initRepository(runtime, workspace.path);
    return {
      ...snapshot,
      repos: await discoverRepositories(runtime, workspace.path),
      selected: snapshot.root,
      workspace: workspaceInfo(workspace),
    };
  }
  if (endpoint === 'status') return statusFor(runtime, workspace, payload);

  const root = await repoOf(runtime, workspace, payload);

  switch (endpoint) {
    case 'diff':
      return diff(runtime, root, {
        path: stringField(payload, 'path'),
        side: sideField(payload),
        commit: optionalString(payload, 'commit'),
        parent: optionalString(payload, 'parent'),
      });
    case 'stage':
      return stagePaths(runtime, root, pathsField(payload, 'paths'));
    case 'unstage':
      return unstagePaths(runtime, root, pathsField(payload, 'paths'));
    case 'applyBlocks':
      return applyBlocks(runtime, root, {
        path: stringField(payload, 'path'),
        side: stringField(payload, 'side'),
        blocks: valueOf(payload, 'blocks'),
        baseHash: valueOf(payload, 'baseHash'),
        targetHash: valueOf(payload, 'targetHash'),
        confirm: valueOf(payload, 'confirm'),
      });
    case 'commit':
      return commit(runtime, root, {
        message: optionalString(payload, 'message') ?? '',
        amend: valueOf(payload, 'amend') === true,
      });
    case 'createBranchAndCommit':
      return createBranchAndCommit(runtime, root, {
        name: stringField(payload, 'name'),
        message: stringField(payload, 'message'),
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
      return commitDetail(runtime, root, { hash: stringField(payload, 'hash') });
    case 'undoCommit':
      return undoCommit(runtime, root, { hash: stringField(payload, 'hash') });
    case 'revertCommit':
      return revertCommit(runtime, root, { hash: stringField(payload, 'hash') });
    case 'cherryPickCommit':
      return cherryPickCommit(runtime, root, { hash: stringField(payload, 'hash') });
    case 'resetToCommit':
      return resetToCommit(runtime, root, {
        hash: stringField(payload, 'hash'),
        mode: stringField(payload, 'mode'),
        confirm: valueOf(payload, 'confirm') === true,
      });
    case 'branches':
      return branches(runtime, root);
    case 'createBranch':
      return createBranch(runtime, root, { name: stringField(payload, 'name') });
    case 'checkout':
      return checkout(runtime, root, {
        branch: stringField(payload, 'branch'),
        remote: valueOf(payload, 'remote') === true,
      });
    case 'stashList':
      return stashList(runtime, root);
    case 'stashPush':
      return stashPush(runtime, root, {
        message: optionalString(payload, 'message'),
        paths: valueOf(payload, 'paths'),
        includeUntracked: valueOf(payload, 'includeUntracked') === true,
      });
    case 'stashApply':
      return stashApply(runtime, root, {
        ref: stringField(payload, 'ref'),
        pop: valueOf(payload, 'pop') === true,
      });
    case 'stashDrop':
      return stashDrop(runtime, root, { ref: stringField(payload, 'ref') });
    case 'resolve':
      return resolveConflict(runtime, root, {
        path: stringField(payload, 'path'),
        side: stringField(payload, 'side'),
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
        model: valueOf(payload, 'model'),
        instruction: valueOf(payload, 'instruction'),
      });
    }
    default:
      throw new GitError('git/unknown-method', `Unknown Git action: ${endpoint}`);
  }
}

/**
 * Build the endpoint handler that the HTTP route calls.
 * @param ctx the host context with `workspaceRegistry`.
 * @param runtime the runtime helpers.
 * @returns the handler.
 */
export function createHandler(ctx: HandlerContext, runtime: GitRuntime): EndpointHandler {
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
            details: error.details,
          },
        };
      }
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        error: {
          code: signal?.aborted === true ? 'git/cancelled' : 'git/internal',
          message: message === '' ? 'The Git action failed.' : message,
          details: {},
        },
      };
    }
  };
}
