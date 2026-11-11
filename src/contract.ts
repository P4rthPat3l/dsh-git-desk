/**
 * The shapes the Git channel exchanges. The host route and the browser client
 * both read this file, so the wire contract has one definition.
 */

/** The current branch. */
export interface BranchState {
  oid: string | null;
  name: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  detached: boolean;
  initial: boolean;
}

/** The kind of working-tree entry. */
export type EntryKind = 'tracked' | 'renamed' | 'unmerged' | 'untracked';

/** One entry as the porcelain parser builds it. */
export interface ParsedEntry {
  path: string;
  kind: EntryKind;
  from?: string | null;
  index: string;
  worktree: string;
  conflicted: boolean;
  untracked: boolean;
  staged: boolean;
  unstaged: boolean;
  letter: string;
  both: boolean;
}

/** One changed file with its line counts. */
export interface StatusEntry extends ParsedEntry {
  add: number | null;
  del: number | null;
  stagedAdd: number;
  stagedDel: number;
  binary: boolean;
}

/** One repository as the panel lists it. */
export interface RepoInfo {
  root: string;
  name: string;
  label: string;
}

/** One workspace, as the panel names it. */
export interface WorkspaceInfo {
  id?: string;
  title?: string;
  path: string;
}

/** The full state after any operation. */
export interface StatusSnapshot {
  repo: boolean;
  root: string | null;
  branch: BranchState;
  entries: StatusEntry[];
  merging: boolean;
  rebasing: boolean;
  reverting: boolean;
  cherryPicking: boolean;
  conflicts: string[];
  repos?: RepoInfo[];
  selected?: string | null;
  workspace?: WorkspaceInfo;
}

/** The row kind in a side-by-side diff. */
export type DiffRowKind = 'ctx' | 'add' | 'del' | 'mod';

/** One diff row. */
export interface DiffRow {
  l: number | null;
  r: number | null;
  k: DiffRowKind;
}

/** One change block before it gets an id. */
export interface DiffBlockRange {
  leftStart: number;
  leftEnd: number;
  rightStart: number;
  rightEnd: number;
  kind: 'add' | 'del' | 'mod';
  row: number;
}

/** One change block in a diff. */
export interface DiffBlock extends DiffBlockRange {
  id: string;
}

/** The side of a diff the caller asked for. */
export type DiffSide = 'unstaged' | 'staged' | 'conflict' | 'log' | 'revert';

/** One full-file diff. */
export interface DiffPayload {
  path: string;
  side: DiffSide;
  labels: { left: string; right: string };
  binary: boolean;
  conflict: boolean;
  left: string[];
  right: string[];
  leftTrailing: boolean;
  rightTrailing: boolean;
  rows: DiffRow[];
  blocks: DiffBlock[];
  add: number | null;
  del: number | null;
  baseHash: string | null;
  targetHash: string | null;
  leftMissing: boolean;
  rightMissing: boolean;
  leftSize?: number;
  rightSize?: number;
}

/** One commit in the log. */
export interface LogCommit {
  hash: string;
  parents: string[];
  author: string;
  email: string;
  date: string;
  refs: string[];
  subject: string;
}

/** One file in a commit. */
export interface CommitFile {
  path: string;
  add: number | null;
  del: number | null;
  binary: boolean;
}

/** One commit with its message and files. */
export interface CommitDetail {
  hash: string;
  parents: string[];
  author: string;
  email: string;
  date: string;
  subject: string;
  body: string;
  files: CommitFile[];
}

/** One branch. */
export interface BranchInfo {
  name: string;
  current: boolean;
  upstream: string | null;
  remote: boolean;
}

/** One stash entry. */
export interface StashEntry {
  ref: string;
  message: string;
  hash: string;
}

/** The result of an operation that leaves a fresh status behind. */
export interface OperationResult {
  output: string;
  status: StatusSnapshot;
  /** Set by pull when local changes were stashed; conflict means the stash was kept. */
  autoStash?: 'restored' | 'conflict';
}

/** The result of a commit. */
export interface CommitResult {
  hash: string;
  output: string;
  status: StatusSnapshot;
}

/** The result of an undo. */
export interface UndoResult {
  hash: string;
  message: string;
  output: string;
  status: StatusSnapshot;
}

/** The result of a revert. */
export interface RevertResult {
  hash: string;
  conflicted: boolean;
  paths: string[];
  message: string;
  output: string;
  status: StatusSnapshot;
}

/** The result of a reset. */
export interface ResetResult {
  hash: string;
  mode: string;
  output: string;
  status: StatusSnapshot;
}

/** The model list one preference read returns. */
export interface AiProviderGroup {
  id: string;
  label: string;
  models: { id: string; name: string }[];
}

/** The AI preferences the settings page reads. */
export interface AiPreferences {
  instruction: string;
  groups: AiProviderGroup[];
}

/** One provider and model pair. */
export interface ModelPair {
  provider: string;
  model: string;
}

/** One generated commit message. */
export interface AiMessage {
  message: string;
  provider: string | null;
  model: string | null;
}
