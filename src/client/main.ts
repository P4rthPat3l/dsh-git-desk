import React from 'react';
import type {
  AiPreferences,
  BranchInfo,
  BranchState,
  CommitDetail,
  CommitResult,
  DiffBlock,
  DiffPayload,
  DiffRow,
  LogCommit,
  ModelPair,
  OperationResult,
  RepoInfo,
  ResetResult,
  RevertResult,
  StashEntry,
  StatusEntry,
  StatusSnapshot,
  UndoResult,
} from '../contract.js';
import type {
  ClientContext,
  SessionState,
  ShortcutCommand,
  SidebarRightService,
  StoreHook,
  Translator,
  UseTabInfo,
  WorkspaceState,
} from './harness.js';

const h = React.createElement;

const { useState, useEffect, useRef, useMemo, useCallback } = React;

/** A failed call, carrying the host's stable code. */
class GitCallError extends Error {
  readonly code: string;

  readonly details: Record<string, unknown>;

  constructor(code: string, message: string, details: Record<string, unknown>) {
    super(message);
    this.name = 'GitCallError';
    this.code = code;
    this.details = details;
  }
}

/** What each Git endpoint returns, so one call site infers its own shape. */
interface GitMethods {
  status: StatusSnapshot;
  init: StatusSnapshot;
  preferences: AiPreferences;
  diff: DiffPayload;
  stage: StatusSnapshot;
  unstage: StatusSnapshot;
  applyBlocks: StatusSnapshot;
  resolve: StatusSnapshot;
  commit: CommitResult;
  createBranchAndCommit: CommitResult;
  createBranch: OperationResult;
  push: OperationResult;
  pull: OperationResult;
  fetch: OperationResult;
  log: { commits: LogCommit[] };
  commitDetail: CommitDetail;
  undoCommit: UndoResult;
  revertCommit: RevertResult;
  cherryPickCommit: CommitResult;
  resetToCommit: ResetResult;
  branches: { branches: BranchInfo[] };
  checkout: OperationResult;
  stashList: { stashes: StashEntry[] };
  stashPush: OperationResult & { stashes: StashEntry[] };
  stashApply: OperationResult & { stashes: StashEntry[] };
  stashDrop: OperationResult & { stashes: StashEntry[] };
  aiMessage: { message: string; provider: string | null; model: string | null };
}

/** One call into the authenticated Git channel. */
type Call = <K extends keyof GitMethods>(
  method: K,
  payload: Record<string, unknown>,
  signal?: AbortSignal,
) => Promise<GitMethods[K]>;

/** What a history action reports back to the panel. */
interface AppliedResult {
  status?: StatusSnapshot;
  message?: string;
  goToChanges?: boolean;
  toast?: string;
}

/**
 * Read the stable code from a failed operation.
 * @param value the thrown value.
 * @returns the code, when the failure carries one.
 */
function codeOfFailure(value: unknown): string | undefined {
  if (!(value instanceof Error) || !('code' in value)) return undefined;
  const { code } = value as { code: unknown };
  return typeof code === 'string' ? code : undefined;
}

/**
 * Read a thrown value as an error.
 * @param value the thrown value.
 * @returns the error.
 */
function failureOf(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

const NS = 'git';
const GIT_TAB_ID = 'dsh-git';

const FILE_ADDRESS_PREFIX = 'dsh-resource://file/session/';
const isAbsoluteWorkspacePath = (path: string): boolean =>
  path.startsWith('/') || /^[A-Za-z]:[/\\]/.test(path) || path.startsWith('\\\\');
const encodeAddressPath = (path: string): string =>
  path
    .replace(/\\/g, '/')
    .replace(/^(?:\.\/)+/, '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
const sessionFileAddress = (sessionId: string, path: string): string =>
  `${FILE_ADDRESS_PREFIX}${encodeURIComponent(sessionId)}/${encodeAddressPath(path)}`;
/**
 * The address for a path as the Git panel holds it, matching the harness util.
 * @param {string} sessionId - the Session the path is read in.
 * @param {string | undefined} cwd - that Session's workspace root.
 * @param {string} path - absolute or workspace-relative path.
 * @returns {string} the `dsh-resource://file/...` address.
 */
function fileAddressFor(sessionId: string, cwd: string | undefined, path: string): string {
  const normalized = path.replace(/\\/g, '/');
  if (!isAbsoluteWorkspacePath(normalized)) return sessionFileAddress(sessionId, normalized);
  const root = cwd === undefined ? '' : cwd.replace(/\\/g, '/').replace(/\/+$/, '');
  if (root !== '' && normalized === root) return sessionFileAddress(sessionId, '');
  if (root !== '' && normalized.startsWith(`${root}/`)) {
    return sessionFileAddress(sessionId, normalized.slice(root.length + 1));
  }
  return sessionFileAddress(sessionId, normalized);
}
/**
 * The working-tree line of the first change in a diff.
 * @param diff the diff rows.
 * @returns a 1-based line.
 */
function openDiffLine(diff: { rows?: DiffRow[] } | null | undefined): number {
  const rows = diff?.rows ?? [];
  const index = rows.findIndex((row) => row.k !== 'ctx');
  if (index < 0) return 1;
  for (let i = index; i < rows.length; i += 1) {
    const row = rows[i];
    if (row !== undefined && row.r !== null) return row.r;
  }
  return 1;
}

const EN = {
  'panel': 'Git',
  'mode.changes': 'Changes',
  'mode.log': 'History',
  'mode.stash': 'Stashes',
  'guide.title': 'Git changes',
  'guide.description': 'Review, stage, commit, and sync the workspace repository.',
  'section.conflicts': 'Conflicts',
  'section.staged': 'Staged',
  'section.unstaged': 'Unstaged',
  'section.stagedCount': '{count} staged',
  'section.unstagedCount': '{count} changed',
  'section.conflictCount': '{count} unresolved',
  'empty.noChanges': 'No changes',
  'empty.noChangesHint': 'The working tree matches the last commit.',
  'empty.selectFile': 'Select a file to review it',
  'empty.selectFileHint': 'The full file is shown on both sides. Nothing is collapsed.',
  'empty.noRepo': 'Not a Git repository',
  'empty.noRepoHint': 'This workspace is not a repository yet.',
  'empty.init': 'Initialize repository',
  'empty.noWorkspace': 'No workspace is open',
  'empty.noWorkspaceHint': 'Open a workspace, then return to Git.',
  'empty.noHistory': 'No commits yet',
  'empty.noHistoryHint': 'The first commit will appear here.',
  'empty.noStashes': 'No stashes',
  'empty.noStashesHint': 'Park work here before switching tasks.',
  'action.stageFile': 'Stage file',
  'action.unstageFile': 'Unstage file',
  'action.stageAll': 'Stage all',
  'action.unstageAll': 'Unstage all',
  'ai.action': 'AI actions',
  'ai.write': 'Write a commit message',
  'ai.branch': 'Create a branch and commit',
  'ai.written': 'Message written with {model}',
  'action.stageBlock': 'Stage block',
  'action.unstageBlock': 'Unstage block',
  'action.revertBlock': 'Revert block to the staged version',
  'action.refresh': 'Refresh',
  'action.back': 'Back to changes',
  'action.openEditor': 'Open in editor',
  'action.prevChange': 'Previous change',
  'action.nextChange': 'Next change',
  'action.close': 'Close',
  'action.cancel': 'Cancel',
  'action.confirm': 'Confirm',
  'action.commit': 'Commit',
  'action.committing': 'Committing',
  'action.branch': 'Branch',
  'action.createBranch': 'Create branch and commit',
  'action.checkout': 'Checkout',
  'action.fetch': 'Fetch',
  'action.pull': 'Pull',
  'action.push': 'Push',
  'action.apply': 'Apply',
  'action.pop': 'Pop',
  'action.drop': 'Drop',
  'action.stash': 'Stash changes',
  'action.acceptOurs': 'Accept ours',
  'action.acceptTheirs': 'Accept theirs',
  'action.retry': 'Retry',
  'action.init': 'Initialize',
  'action.newBranch': 'New branch',
  'action.createAndSwitch': 'Create and switch',
  'repo.title': 'Repositories',
  'repo.current': 'Current repository',
  'repo.workspace': 'Workspace folder',
  'repo.pick': 'Switch repository',
  'repo.none': 'No repository found',
  'repo.initRoot': 'New repository at the workspace root',
  'repo.initRootTitle': 'Initialize at the workspace root?',
  'repo.initRootBody': 'The workspace contains {count} repositories. A repository at the workspace root treats each of them as an untracked folder. Pick one of the repositories instead.',
  'repo.initRootConfirm': 'Initialize anyway',
  'action.revert': 'Revert block',
  'diff.split': 'Split',
  'diff.unified': 'Unified',
  'diff.head': 'HEAD',
  'diff.staged': 'Staged',
  'diff.local': 'Local',
  'diff.parent': 'Parent',
  'diff.commit': 'Commit',
  'diff.binary': 'Binary file changed',
  'diff.binaryHint': '{before} to {after}',
  'diff.conflictBanner': 'This file has unresolved conflicts. Commit is blocked until you resolve it.',
  'diff.loading': 'Loading diff',
  'diff.noChanges': 'No changes in this file',
  'diff.fullFile': 'Full file',
  'diff.layout': 'Diff layout',
  'diff.changes': 'Changes in this file',
  'diff.lines': '{count} lines',
  'commit.placeholder': 'Describe the change',
  'commit.hintStage': 'Stage a file to commit.',
  'commit.hintConflict': 'Resolve conflicts before committing.',
  'commit.hintMessage': 'Write a commit message.',
  'commit.done': 'Committed {hash}',
  'commit.amend': 'Amend last commit',
  'branch.title': 'Branch and commit',
  'branch.name': 'Branch name',
  'branch.nameHint': 'Created from the current HEAD, then the staged changes are committed.',
  'branch.message': 'Commit message',
  'branch.created': 'Created {branch} and committed',
  'branch.current': 'Current branch',
  'branch.local': 'Local branches',
  'branch.loading': 'Loading branches',
  'branch.none': 'No branches',
  'branch.new': 'New branch',
  'branch.newTitle': 'New branch',
  'branch.newHint': 'Created from the current HEAD and checked out. No commit is made.',
  'branch.search': 'Search branches',
  'branch.remote': 'Remote branches',
  'branch.createdOnly': 'Created {branch}',
  'branch.noneMatch': 'No branch matches',
  'stash.title': 'Stash changes',
  'stash.message': 'Stash message',
  'stash.select': 'Files to stash',
  'stash.selectHint': 'Only the selected files are stashed. Untracked files are included.',
  'stash.default': 'WIP',
  'stash.nothing': 'No files to stash.',
  'stash.created': 'Stashed {count} files',
  'stash.applied': 'Applied {ref}',
  'stash.popped': 'Popped {ref}',
  'stash.dropped': 'Dropped {ref}',
  'stash.dropTitle': 'Drop stash',
  'stash.dropBody': 'This deletes {ref} permanently. The changes are not applied.',
  'sync.fetched': 'Fetched',
  'sync.pulled': 'Pulled',
  'sync.pushed': 'Pushed',
  'sync.ahead': '{count} ahead',
  'sync.behind': '{count} behind',
  'sync.noUpstream': 'This branch has no upstream. Push sets one.',
  'sync.none': 'Up to date',
  'log.title': 'History',
  'log.loading': 'Loading history',
  'log.select': 'Select a commit',
  'log.files': 'Changed files',
  'log.noFiles': 'No file changes',
  'log.author': 'Author',
  'log.date': 'Date',
  'log.parent': 'Parent',
  'log.message': 'Message',
  'history.actions': 'Commit actions',
  'history.copy': 'Copy commit hash',
  'history.undo': 'Undo last commit',
  'history.undoHint': 'Moves HEAD back and keeps the change staged.',
  'history.revert': 'Revert commit',
  'history.revertHint': 'Stages the inverse change with a revert message.',
  'history.cherryPick': 'Cherry-pick commit',
  'history.cherryPickHint': 'Applies the commit here and commits it.',
  'history.reset': 'Reset branch to here',
  'history.resetHint': 'Moves this branch to the selected commit.',
  'history.blockedOperation': 'Finish the current operation first.',
  'history.blockedNotHead': 'Only the last commit can be undone.',
  'history.blockedDetached': 'Check out a branch first.',
  'history.blockedNoParent': 'The first commit cannot be undone.',
  'history.blockedPushed': 'This commit is already on the upstream branch. Revert it instead.',
  'history.blockedMerge': 'Merge commits are not supported here.',
  'history.blockedStaged': 'Commit or unstage the staged files first.',
  'history.blockedContained': 'Already in this branch.',
  'history.blockedConflict': 'Resolve the conflicts first.',
  'history.undoTitle': 'Undo the last commit?',
  'history.undoBody': 'The commit leaves the branch and its changes stay staged, so you can edit and commit again.',
  'history.undoAction': 'Undo commit',
  'history.revertTitle': 'Revert this commit?',
  'history.revertBody': 'A new set of changes that reverses this commit is staged with a generated message. The commit stays in history.',
  'history.revertAction': 'Revert commit',
  'history.resetTitle': 'Reset this branch?',
  'history.resetBody': 'This branch moves to {hash}. Choose what happens to the changes after it.',
  'history.resetModeSoft': 'Soft',
  'history.resetModeSoftHint': 'Keep the changes staged for a new commit.',
  'history.resetModeMixed': 'Mixed',
  'history.resetModeMixedHint': 'Keep the changes in the working tree, unstaged.',
  'history.resetModeHard': 'Hard',
  'history.resetModeHardHint': 'Discard the commits and their changes.',
  'history.resetHardWarning': 'Hard reset discards every local change after this commit. This cannot be undone.',
  'history.resetAction': 'Reset branch',
  'history.undone': 'Commit undone. Changes are staged.',
  'history.reverted': 'Revert ready. Review it, then commit.',
  'history.revertConflicts': 'Revert stopped with conflicts. Resolve them, then commit.',
  'history.picked': 'Cherry-picked as {hash}',
  'history.resetDone': 'Branch reset to {hash}',
  'status.loading': 'Reading repository',
  'status.detached': 'Detached HEAD',
  'error.title': 'Git action failed',
  'error.notInstalled': 'Git is not installed',
  'error.notInstalledHint': 'Install Git and make it available on PATH, then refresh.',
  'confirm.revertTitle': 'Revert this block?',
  'confirm.revertBody': 'The local block is replaced by the staged version. This working tree change is lost.',
  'confirm.checkoutTitle': 'Switch branch?',
  'confirm.checkoutBody': 'Local changes are carried over when Git can keep them, otherwise the checkout is refused.',
  'confirm.yesRevert': 'Revert block',
  'confirm.yesCheckout': 'Switch branch',
  'meta.binary': 'binary',
  'meta.blocks': '{count} blocks',
  'meta.add': '{count} added',
  'meta.del': '{count} deleted',
  'filter.placeholder': 'Filter files',
  'filter.clear': 'Clear filter',
  'meta.partial': 'partial',
  'meta.partialHint': 'Some changes in this file are staged',
  'commit.stagedSummary': '{count} staged',
  'commit.shortcut': '{key}+Enter to commit',
  'diff.added': 'Added',
  'diff.removed': 'Removed',
  'diff.blockCount': '{count} changes',
  'diff.blockCountOne': '1 change',
  'stash.applyHint': 'Apply the changes and keep the stash',
  'stash.popHint': 'Apply the changes and delete the stash',
  'stash.dropHint': 'Delete the stash',
  'filter.empty': 'No files match "{filter}"',
  'action.copyHash': 'Copy commit hash',
  'action.copied': 'Copied!',
  'diff.unstaged': 'Unstaged',
  'stash.selectAll': 'Select all',
  'stash.deselectAll': 'Deselect all',
  'header.label': 'Git panel',
  'settings.section': 'Git',
  'settings.model': 'AI model',
  'settings.modelHint': 'Used by the commit message actions. The default follows the Composer selection, including later changes.',
  'settings.modelSame': 'Same as Composer',
  'settings.modelEmpty': 'No models are available in this build.',
  'settings.modelFailed': 'The model list could not be read.',
  'settings.instruction': 'Commit instructions',
  'settings.instructionHint': 'These lines shape the wording. The title line type(scope): summary stays required; a short body is welcome.',
  'settings.instructionReset': 'Restore default',
  'settings.instructionFailed': 'The default instructions could not be read.',
  'command.toggle': 'Open or collapse the Git panel',
  'command.commit': 'Commit staged changes',
  'command.writeMessage': 'Write the commit message with AI',
  'command.stageAll': 'Stage all changes',
  'command.openFirst': 'Open the Git panel first',
  'command.nothingToStage': 'No changed files to stage',
  'command.notReady': 'Stage a file and write a message first',
  'split.files': 'Resize the file list',
  'split.commits': 'Resize the commit list',
};

const ZH = {
  'panel': 'Git',
  'mode.changes': '更改',
  'mode.log': '历史',
  'mode.stash': '贮藏',
  'guide.title': 'Git 更改',
  'guide.description': '查看、暂存、提交并同步工作区仓库。',
  'section.conflicts': '冲突',
  'section.staged': '已暂存',
  'section.unstaged': '未暂存',
  'section.stagedCount': '已暂存 {count}',
  'section.unstagedCount': '已更改 {count}',
  'section.conflictCount': '未解决 {count}',
  'empty.noChanges': '没有更改',
  'empty.noChangesHint': '工作区与最近一次提交一致。',
  'empty.selectFile': '选择一个文件查看更改',
  'empty.selectFileHint': '两侧都显示完整文件，不会折叠。',
  'empty.noRepo': '不是 Git 仓库',
  'empty.noRepoHint': '当前工作区还不是仓库。',
  'empty.init': '初始化仓库',
  'empty.noWorkspace': '没有打开的工作区',
  'empty.noWorkspaceHint': '打开一个工作区，然后回到 Git。',
  'empty.noHistory': '还没有提交',
  'empty.noHistoryHint': '第一次提交会出现在这里。',
  'empty.noStashes': '没有贮藏',
  'empty.noStashesHint': '切换任务前可以把工作放在这里。',
  'action.stageFile': '暂存文件',
  'action.unstageFile': '取消暂存文件',
  'action.stageAll': '全部暂存',
  'action.unstageAll': '全部取消暂存',
  'ai.action': 'AI 操作',
  'ai.write': '生成提交信息',
  'ai.branch': '创建分支并提交',
  'ai.written': '已由 {model} 生成提交信息',
  'action.stageBlock': '暂存区块',
  'action.unstageBlock': '取消暂存区块',
  'action.revertBlock': '将区块还原为已暂存版本',
  'action.refresh': '刷新',
  'action.back': '返回更改',
  'action.openEditor': '在编辑器中打开',
  'action.prevChange': '上一个更改',
  'action.nextChange': '下一个更改',
  'action.close': '关闭',
  'action.cancel': '取消',
  'action.confirm': '确认',
  'action.commit': '提交',
  'action.committing': '正在提交',
  'action.branch': '分支',
  'action.createBranch': '创建分支并提交',
  'action.checkout': '切换',
  'action.fetch': '获取',
  'action.pull': '拉取',
  'action.push': '推送',
  'action.apply': '应用',
  'action.pop': '弹出',
  'action.drop': '删除',
  'action.stash': '贮藏更改',
  'action.acceptOurs': '采用本地',
  'action.acceptTheirs': '采用远端',
  'action.retry': '重试',
  'action.init': '初始化',
  'action.newBranch': '新建分支',
  'action.createAndSwitch': '创建并切换',
  'repo.title': '仓库',
  'repo.current': '当前仓库',
  'repo.workspace': '工作区目录',
  'repo.pick': '切换仓库',
  'repo.none': '未找到仓库',
  'repo.initRoot': '在工作区根目录新建仓库',
  'repo.initRootTitle': '在根目录初始化？',
  'repo.initRootBody': '工作区包含 {count} 个仓库。在根目录初始化会把它们当成未跟踪目录。请改用仓库选择器。',
  'repo.initRootConfirm': '仍要初始化',
  'action.revert': '还原区块',
  'diff.split': '并排',
  'diff.unified': '统一',
  'diff.head': 'HEAD',
  'diff.staged': '已暂存',
  'diff.local': '本地',
  'diff.parent': '父提交',
  'diff.commit': '提交',
  'diff.binary': '二进制文件已更改',
  'diff.binaryHint': '{before} 到 {after}',
  'diff.conflictBanner': '此文件有未解决的冲突。解决前无法提交。',
  'diff.loading': '正在读取差异',
  'diff.noChanges': '此文件没有更改',
  'diff.fullFile': '完整文件',
  'diff.layout': '差异布局',
  'diff.changes': '此文件中的更改',
  'diff.lines': '{count} 行',
  'commit.placeholder': '描述这次更改',
  'commit.hintStage': '先暂存一个文件。',
  'commit.hintConflict': '请先解决冲突。',
  'commit.hintMessage': '写一条提交信息。',
  'commit.done': '已提交 {hash}',
  'commit.amend': '修补上次提交',
  'branch.title': '分支并提交',
  'branch.name': '分支名',
  'branch.nameHint': '从当前 HEAD 创建分支，然后提交已暂存的更改。',
  'branch.message': '提交信息',
  'branch.created': '已创建 {branch} 并提交',
  'branch.current': '当前分支',
  'branch.local': '本地分支',
  'branch.loading': '正在读取分支',
  'branch.none': '没有分支',
  'branch.new': '新建分支',
  'branch.newTitle': '新建分支',
  'branch.newHint': '从当前 HEAD 创建并切换，不产生提交。',
  'branch.search': '搜索分支',
  'branch.remote': '远端分支',
  'branch.createdOnly': '已创建 {branch}',
  'branch.noneMatch': '没有匹配的分支',
  'stash.title': '贮藏更改',
  'stash.message': '贮藏信息',
  'stash.select': '要贮藏的文件',
  'stash.selectHint': '只贮藏选中的文件。未跟踪文件也会包含。',
  'stash.default': 'WIP',
  'stash.nothing': '没有可贮藏的文件。',
  'stash.created': '已贮藏 {count} 个文件',
  'stash.applied': '已应用 {ref}',
  'stash.popped': '已弹出 {ref}',
  'stash.dropped': '已删除 {ref}',
  'stash.dropTitle': '删除贮藏',
  'stash.dropBody': '这会永久删除 {ref}，且不会应用其中的更改。',
  'sync.fetched': '已获取',
  'sync.pulled': '已拉取',
  'sync.pushed': '已推送',
  'sync.ahead': '领先 {count}',
  'sync.behind': '落后 {count}',
  'sync.noUpstream': '此分支没有上游，推送时会设置。',
  'sync.none': '已是最新',
  'log.title': '历史',
  'log.loading': '正在读取历史',
  'log.select': '选择一个提交',
  'log.files': '更改的文件',
  'log.noFiles': '没有文件更改',
  'log.author': '作者',
  'log.date': '日期',
  'log.parent': '父提交',
  'log.message': '信息',
  'history.actions': '提交操作',
  'history.copy': '复制提交哈希',
  'history.undo': '撤销最后一次提交',
  'history.undoHint': 'HEAD 回退，更改保留在暂存区。',
  'history.revert': '还原提交',
  'history.revertHint': '生成反向更改并写入还原信息。',
  'history.cherryPick': '拣选提交',
  'history.cherryPickHint': '在此分支应用并提交该提交。',
  'history.reset': '将分支重置到此处',
  'history.resetHint': '把当前分支移动到所选提交。',
  'history.blockedOperation': '请先完成当前操作。',
  'history.blockedNotHead': '只能撤销最后一次提交。',
  'history.blockedDetached': '请先切换到分支。',
  'history.blockedNoParent': '第一个提交无法撤销。',
  'history.blockedPushed': '该提交已在上游分支上，请改用还原。',
  'history.blockedMerge': '此处不支持合并提交。',
  'history.blockedStaged': '请先提交或取消暂存已暂存的文件。',
  'history.blockedContained': '已在当前分支中。',
  'history.blockedConflict': '请先解决冲突。',
  'history.undoTitle': '撤销最后一次提交？',
  'history.undoBody': '该提交会离开分支，更改保留在暂存区，可继续编辑并重新提交。',
  'history.undoAction': '撤销提交',
  'history.revertTitle': '还原这个提交？',
  'history.revertBody': '会暂存反向更改并填入还原信息，原提交仍保留在历史中。',
  'history.revertAction': '还原提交',
  'history.resetTitle': '重置这个分支？',
  'history.resetBody': '分支会移动到 {hash}。选择其后更改的处理方式。',
  'history.resetModeSoft': '软重置',
  'history.resetModeSoftHint': '更改保留在暂存区，可重新提交。',
  'history.resetModeMixed': '混合重置',
  'history.resetModeMixedHint': '更改保留在工作区，不暂存。',
  'history.resetModeHard': '硬重置',
  'history.resetModeHardHint': '丢弃这些提交及其更改。',
  'history.resetHardWarning': '硬重置会丢弃该提交之后的全部本地更改，且无法撤销。',
  'history.resetAction': '重置分支',
  'history.undone': '已撤销提交，更改已暂存。',
  'history.reverted': '还原已就绪，请检查后提交。',
  'history.revertConflicts': '还原遇到冲突，请解决后提交。',
  'history.picked': '已拣选为 {hash}',
  'history.resetDone': '分支已重置到 {hash}',
  'status.loading': '正在读取仓库',
  'status.detached': '游离 HEAD',
  'error.title': 'Git 操作失败',
  'error.notInstalled': '未安装 Git',
  'error.notInstalledHint': '安装 Git 并确保它在 PATH 中，然后刷新。',
  'confirm.revertTitle': '还原这个区块？',
  'confirm.revertBody': '本地区块会被已暂存版本替换，这部分工作区更改会丢失。',
  'confirm.checkoutTitle': '切换分支？',
  'confirm.checkoutBody': '如果 Git 能保留，本地更改会带到新分支，否则会拒绝切换。',
  'confirm.yesRevert': '还原区块',
  'confirm.yesCheckout': '切换分支',
  'meta.binary': '二进制',
  'meta.blocks': '{count} 个区块',
  'meta.add': '新增 {count}',
  'meta.del': '删除 {count}',
  'filter.placeholder': '过滤文件',
  'filter.clear': '清除过滤',
  'meta.partial': '部分',
  'meta.partialHint': '此文件的部分更改已暂存',
  'commit.stagedSummary': '已暂存 {count} 个',
  'commit.shortcut': '按 {key}+Enter 提交',
  'diff.added': '新增',
  'diff.removed': '删除',
  'diff.blockCount': '{count} 处更改',
  'diff.blockCountOne': '1 处更改',
  'stash.applyHint': '应用更改并保留贮藏',
  'stash.popHint': '应用更改并删除贮藏',
  'stash.dropHint': '删除贮藏',
  'filter.empty': '没有文件匹配 "{filter}"',
  'action.copyHash': '复制提交哈希',
  'action.copied': '已复制！',
  'diff.unstaged': '未暂存',
  'stash.selectAll': '全选',
  'stash.deselectAll': '全不选',
  'header.label': 'Git 面板',
  'settings.section': 'Git',
  'settings.model': 'AI 模型',
  'settings.modelHint': '用于生成提交信息。默认跟随输入框选择的模型，之后切换也会跟随。',
  'settings.modelSame': '与输入框相同',
  'settings.modelEmpty': '此版本没有可用模型。',
  'settings.modelFailed': '无法读取模型列表。',
  'settings.instruction': '提交信息指令',
  'settings.instructionHint': '这些内容决定措辞，标题行 type(scope): 摘要始终必填，可以再写一段说明。',
  'settings.instructionReset': '恢复默认',
  'settings.instructionFailed': '无法读取默认指令。',
  'command.toggle': '打开或收起 Git 面板',
  'command.commit': '提交已暂存的更改',
  'command.writeMessage': '用 AI 写提交信息',
  'command.stageAll': '暂存全部更改',
  'command.openFirst': '请先打开 Git 面板',
  'command.nothingToStage': '没有可暂存的更改',
  'command.notReady': '请先暂存文件并填写提交信息',
  'split.files': '调整文件列表宽度',
  'split.commits': '调整提交列表宽度',
};

const STORE_LAYOUT = 'dsh-git.layout';
const STORE_LAYOUT_COMPACT = 'dsh-git.layout.compact';
const STORE_REPO = 'dsh-git.repo.';

function readStore(key: string, fallback: string): string {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStore(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // A blocked storage area only loses the preference.
  }
}

const MOD_KEY = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl';

// Whether the Git tab is the one on screen. The tab body is the only place
// that knows, so it reports here and the header button reads it.
interface VisibilityHook {
  getSnapshot(): boolean;
  subscribe(listener: () => void): () => void;
}

interface VisibilitySource {
  hook: VisibilityHook;
  set(next: boolean): void;
}

const visibilityBySession = new Map<string, VisibilitySource>();

function visibilityOf(sessionId: string): VisibilitySource {
  let source = visibilityBySession.get(sessionId);
  if (source === undefined) {
    const listeners = new Set<() => void>();
    let visible = false;
    source = {
      hook: {
        getSnapshot: () => visible,
        subscribe(listener: () => void): () => void {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
      },
      set(next: boolean): void {
        if (next === visible) return;
        visible = next;
        for (const listener of [...listeners]) listener();
      },
    };
    visibilityBySession.set(sessionId, source);
  }
  return source;
}

// Model override and commit instructions for the AI actions. Stored in
// this browser, the same way the harness keeps its own key bindings.
const STORE_PREFS = 'dsh-git.preferences.v1';

interface Prefs {
  model: ModelPair | null;
  instruction: string;
}

function readPrefs(): Prefs {
  const empty: Prefs = { model: null, instruction: '' };
  const raw = readStore(STORE_PREFS, '');
  if (raw === '') return empty;
  try {
    const parsed: unknown = JSON.parse(raw);
    const record = parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    return {
      model: readPair(record.model),
      instruction: typeof record.instruction === 'string' ? record.instruction : '',
    };
  } catch {
    return empty;
  }
}

const prefs = (() => {
  let current: Prefs = readPrefs();
  const listeners = new Set<() => void>();
  return {
    hook: {
      getSnapshot: (): Prefs => current,
      subscribe(listener: () => void): () => void {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
    set(next: Prefs): void {
      current = {
        model: readPair(next.model),
        instruction: typeof next.instruction === 'string' ? next.instruction : '',
      };
      writeStore(STORE_PREFS, JSON.stringify(current));
      for (const listener of [...listeners]) listener();
    },
  };
})();

// Width of the list column shared by Changes and History. One value keeps
// the divider in the same place when the user switches views.
const STORE_SPLIT = 'dsh-git.split';
const SPLIT_DEFAULT = 320;
const SPLIT_MIN = 220;
const SPLIT_DIFF_MIN = 280;
const SPLIT_MAX = 10_000;
const SPLIT_STEP = 16;

function readSplit() {
  const raw = Number.parseInt(readStore(STORE_SPLIT, ''), 10);
  if (!Number.isFinite(raw)) return SPLIT_DEFAULT;
  return Math.min(Math.max(raw, SPLIT_MIN), SPLIT_MAX);
}

const split = (() => {
  let current = readSplit();
  const listeners = new Set<() => void>();
  return {
    get: (): number => current,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set(next: number): void {
      const value = Math.round(next);
      if (!Number.isFinite(value) || value === current) return;
      current = Math.min(Math.max(value, SPLIT_MIN), SPLIT_MAX);
      writeStore(STORE_SPLIT, String(current));
      for (const listener of [...listeners]) listener();
    },
  };
})();

function useSplitWidth(): [number, (next: number) => void] {
  const [value, setValue] = useState(split.get);
  useEffect(() => {
    setValue(split.get());
    return split.subscribe(() => setValue(split.get()));
  }, []);
  return [value, split.set];
}

// A multi-line field that shows its whole message: the height follows the
// content, and only a message past 45% of the panel scrolls. Refits when
// the column changes width, because that changes the line count.
function useAutoGrow(ref: React.RefObject<HTMLTextAreaElement | HTMLInputElement | null>, value: string): void {
  const lastWidth = useRef(0);
  useEffect(() => {
    const node = ref.current;
    if (node === null) return undefined;
    const fit = () => {
      node.style.height = 'auto';
      const border = node.offsetHeight - node.clientHeight;
      const root = node.closest('.gitp-root');
      const available = root === null ? 600 : root.getBoundingClientRect().height;
      const limit = Math.max(140, Math.round(available * 0.45));
      const content = node.scrollHeight + border;
      node.style.height = `${Math.min(content, limit)}px`;
      node.style.overflowY = content > limit ? 'auto' : 'hidden';
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const parent = node.parentElement;
    if (parent === null) return undefined;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry === undefined) return;
      const width = Math.round(entry.contentRect.width);
      if (width === lastWidth.current) return;
      lastWidth.current = width;
      fit();
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, [ref, value]);
}

// The select carries the pair as JSON so no separator can collide with a
// provider or model id.
function pairValue(pair: ModelPair): string {
  return JSON.stringify({ provider: pair.provider, model: pair.model });
}

function readPair(value: unknown): ModelPair | null {
  if (value === null || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.provider !== 'string' || record.provider === '') return null;
  if (typeof record.model !== 'string' || record.model === '') return null;
  return { provider: record.provider, model: record.model };
}

function parsePair(text: string): ModelPair | null {
  try {
    return readPair(JSON.parse(text));
  } catch {
    // A stored or selected value we cannot read changes nothing.
    return null;
  }
}

function cx(...names: unknown[]): string {
  return names.filter(Boolean).join(' ');
}

function splitPath(value: string): { dir: string; base: string } {
  const index = value.lastIndexOf('/');
  return index === -1
    ? { dir: '', base: value }
    : { dir: value.slice(0, index + 1), base: value.slice(index + 1) };
}

function shortHash(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, 7) : '';
}

function plural(t: Translator, key: string, count: number): string {
  return t(key, { count });
}

function statusClass(letter: string): string {
  switch (letter) {
    case 'A':
      return 'is-added';
    case 'D':
      return 'is-deleted';
    case 'R':
      return 'is-renamed';
    case 'U':
      return 'is-untracked';
    case 'C':
      return 'is-conflict';
    default:
      return 'is-modified';
  }
}

function slugify(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function defaultBranchName(message: unknown, firstPath: string | null | undefined): string {
  // Only the title names the branch; a commit body must not leak into it.
  const fromMessage = slugify(String(message ?? '').split(/\r?\n/)[0]);
  if (fromMessage !== '') return fromMessage;
  const base = firstPath ? splitPath(firstPath).base.replace(/\.[^.]+$/, '') : 'changes';
  const slug = slugify(base) || 'changes';
  return `${slug}-changes`.slice(0, 60);
}

function tokenize(value: string): string[] {
  return value.match(/\s+|[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g) ?? [];
}

interface WordParts {
  lPre: string;
  lMid: string;
  lSuf: string;
  rPre: string;
  rMid: string;
  rSuf: string;
}

function wordParts(left: string, right: string): WordParts | null {
  if (left === right) return null;
  if (left.length > 2000 || right.length > 2000) return null;
  const a = tokenize(left);
  const b = tokenize(right);
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  return {
    lPre: a.slice(0, prefix).join(''),
    lMid: a.slice(prefix, a.length - suffix).join(''),
    lSuf: suffix === 0 ? '' : a.slice(a.length - suffix).join(''),
    rPre: b.slice(0, prefix).join(''),
    rMid: b.slice(prefix, b.length - suffix).join(''),
    rSuf: suffix === 0 ? '' : b.slice(b.length - suffix).join(''),
  };
}

function renderParts(prefix: string, middle: string, suffix: string): React.ReactNode {
  if (middle === '') return h(React.Fragment, null, prefix, suffix);
  return h(React.Fragment, null, prefix, h('span', { className: 'gitp-word' }, middle), suffix);
}

function relativeDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, 'second');
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour');
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return formatter.format(days, 'day');
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

interface LaneRow extends LogCommit {
  lane: number;
  laneCount: number;
}

function computeLanes(commits: LogCommit[]): LaneRow[] {
  const lanes: (string | null)[] = [];
  const rows: LaneRow[] = [];
  for (const commit of commits) {
    let lane = lanes.indexOf(commit.hash);
    if (lane === -1) {
      lane = lanes.length;
      lanes.push(commit.hash);
    }
    const parents = commit.parents ?? [];
    lanes[lane] = parents[0] ?? null;
    for (let index = 1; index < parents.length; index += 1) {
      const parent = parents[index];
      if (parent !== undefined) lanes.splice(lane + index, 0, parent);
    }
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop();
    rows.push({ ...commit, lane, laneCount: Math.max(1, lanes.length) });
  }
  return rows;
}

function errorMessage(error: unknown): string {
  if (error === null || error === undefined) return '';
  if (error instanceof Error) return error.message;
  return String(error);
}

interface IconProps {
  path: string;
  size?: number;
  viewBox?: string;
  className?: string;
  filled?: boolean;
}

function Icon({ path, size = 16, viewBox = '0 0 24 24', className, filled = false }: IconProps) {
  return h(
    'svg',
    {
      className,
      width: size,
      height: size,
      viewBox,
      fill: filled ? 'currentColor' : 'none',
      stroke: filled ? 'none' : 'currentColor',
      strokeWidth: filled ? 0 : 1.8,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': 'true',
    },
    h('path', { d: path }),
  );
}

const paths = {
  branch:
    'M6 3v12a3 3 0 0 0 3 3h6M6 9h6a3 3 0 0 0 3-3V3M6 3.5a1 1 0 1 0 0-.1M18 3.5a1 1 0 1 0 0-.1M18 21a1 1 0 1 0 0-.1',
  changes: 'M4 6h16M4 12h10M4 18h13M18 9l3 3-3 3',
  history: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2',
  stash: 'M4 8h16M6 8v11a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8M9 8V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3M10 12h4',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  left: 'M19 12H5m0 0l6-6m-6 6l6 6',
  right: 'M5 12h14m0 0l-6-6m6 6l-6 6',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  fetch: 'M6 15a4 4 0 0 1 .8-7.9 5 5 0 0 1 9.6-1.1A3.5 3.5 0 0 1 17 15M12 11v7m0 0l-3-3m3 3l3-3',
  pull: 'M12 4v11m0 0l-4-4m4 4l4-4M5 20h14',
  push: 'M12 20V9m0 0l-4 4m4-4l4 4M5 4h14',
  close: 'M6 6l12 12M18 6L6 18',
  chevron: 'M6 9l6 6 6-6',
  chevronUp: 'M6 15l6-6 6 6',
  sparkles: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM18.5 15l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z',
  file: 'M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7zM14 3v4h4',
  code: 'M8 7l-5 5 5 5M16 7l5 5-5 5',
  warning: 'M12 3l9 16H3zM12 9v5M12 17v.5',
  check: 'M5 12l5 5L20 7',
  folder: 'M3 6a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z',
  split: 'M4 5h16v14H4zM12 5v14',
  unified: 'M4 5h16M4 9h16M4 13h16M4 17h16',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35',
  copy: 'M8 4v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7.242a2 2 0 0 0-.602-1.43L16.08 2.5a2 2 0 0 0-1.43-.5H10a2 2 0 0 0-2 2zM4 8H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1',
  checkAlt: 'M20 6L9 17l-5-5',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-2',
  revert: 'M10 7L5 12l5 5M5 12h9a5 5 0 0 1 5 5',
  cherry:
    'M12 17.5m-3.5 0a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0M7 6.5m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0M12 14c0-3 2-5.5 6-7M12 14c-1-2.5-2.5-4-5-5.5',
  reset: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 8v4l2.5 2',
};

const ROW = 20;

function GitMark({ size = 20 }: { size?: number }) {
  return h(
    'svg',
    { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
    h('path', { d: 'M12 3v18', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' }),
    h('path', {
      d: 'M12 12c0-4 3-6 7-6h1',
      stroke: 'currentColor',
      strokeWidth: 1.8,
      strokeLinecap: 'round',
    }),
    h('circle', { cx: 12, cy: 3.5, r: 2.3, fill: 'currentColor' }),
    h('circle', { cx: 12, cy: 12, r: 2.3, fill: 'currentColor' }),
    h('circle', { cx: 12, cy: 20.5, r: 2.3, fill: 'currentColor' }),
  );
}

function GitIcon({ size = 20 }: { size?: number }) {
  return h(GitMark, { size });
}

const CSS = `
.gitp-root{--gitp-mono:var(--dsh-font-family-code,var(--dsh-font-family-code-default,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace));--gitp-ease:cubic-bezier(.2,.7,.3,1);--gitp-hair:var(--dsh-hairline-width,.5px);--gitp-ring:var(--dsw-alias-state-business-primary);position:relative;display:flex;flex-direction:column;height:100%;min-height:0;width:100%;overflow:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family,system-ui,sans-serif);font-size:13px;line-height:20px;-webkit-font-smoothing:antialiased}
.gitp-root *{box-sizing:border-box}
.gitp-root button,.gitp-root input,.gitp-root textarea{font:inherit;color:inherit}
.gitp-root button{-webkit-tap-highlight-color:transparent}
.gitp-root :focus-visible{outline:2px solid var(--gitp-ring);outline-offset:-2px}
.gitp-root ::selection{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 28%,transparent)}
.gitp-root ::placeholder{color:var(--dsw-alias-label-tertiary);opacity:1}
.gitp-root ::-webkit-scrollbar{width:8px;height:8px}
.gitp-root ::-webkit-scrollbar-track,.gitp-root ::-webkit-scrollbar-corner{background:transparent}
.gitp-root ::-webkit-scrollbar-thumb{background:var(--dsw-alias-scrollbar-bg-l1,var(--dsw-alias-border-l2));border:2px solid transparent;background-clip:content-box;border-radius:8px}
.gitp-root ::-webkit-scrollbar-thumb:hover{background-color:var(--dsw-alias-scrollbar-hover-l1,var(--dsw-alias-label-tertiary))}
.gitp-head{display:flex;align-items:center;gap:8px;height:44px;padding:0 8px 0 12px;flex:none;background:var(--dsw-alias-bg-base)}
.gitp-head-left{display:flex;align-items:center;gap:4px;min-width:0;flex:1}
.gitp-head-right{display:flex;align-items:center;gap:2px;flex:none}
.gitp-repo{font-size:13px;font-weight:500;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:160px;padding-right:2px}
.gitp-repo::after{content:'/';margin-left:6px;color:var(--dsw-alias-label-dimmed,var(--dsw-alias-label-tertiary))}
.gitp-branch{display:inline-flex;align-items:center;gap:6px;height:28px;max-width:240px;min-width:0;padding:0 6px 0 8px;border:0;border-radius:var(--dsw-radius-sm,8px);background:transparent;cursor:pointer;color:var(--dsw-alias-label-primary);transition:background-color 120ms ease}
.gitp-branch svg{flex:none;color:var(--dsw-alias-label-secondary)}
.gitp-branch:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.gitp-branch:active:not(:disabled){background:var(--dsw-alias-interactive-bg-active)}
.gitp-branch:disabled{opacity:.4;cursor:default}
.gitp-branch-name{font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gitp-branch .gitp-chevron{display:flex;align-items:center;flex:none;color:var(--dsw-alias-label-tertiary)}
.gitp-repo-pick{max-width:160px}
.gitp-toolbtn,.gitp-iconbtn{display:inline-flex;align-items:center;justify-content:center;gap:4px;height:28px;min-width:28px;padding:0 6px;border:0;border-radius:var(--dsw-radius-sm,8px);background:transparent;cursor:pointer;color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:500;font-variant-numeric:tabular-nums;flex:none;transition:background-color 120ms ease,color 120ms ease}
.gitp-iconbtn{width:28px;padding:0}
.gitp-toolbtn:hover:not(:disabled),.gitp-iconbtn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.gitp-toolbtn:active:not(:disabled),.gitp-iconbtn:active:not(:disabled){background:var(--dsw-alias-interactive-bg-active)}
.gitp-toolbtn:disabled,.gitp-iconbtn:disabled{opacity:.4;cursor:default}
.gitp-iconbtn.is-active{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-active)}
.gitp-header-btn:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}
/* The built-in change request button sits in the same strip with a similar
   branch glyph, so this plugin hides it and keeps that panel in the tab strip.
   The attribute is the host button's own marker; drop this rule to get it back. */
button[data-forge-header]{display:none}
.gitp-toolbtn.has-count{color:var(--dsw-alias-label-primary)}
.gitp-toolbtn-num{font-size:12px;font-weight:600}
.gitp-body{display:flex;flex-direction:column;flex:1;min-height:0}
.gitp-rail{display:flex;flex:none;align-self:flex-start;gap:2px;margin:0 12px 8px;padding:3px;border-radius:var(--dsw-radius-md,12px);background:var(--dsw-alias-interactive-bg-hover);max-width:calc(100% - 24px);overflow-x:auto;scrollbar-width:none}
.gitp-rail::-webkit-scrollbar{display:none}
.gitp-rail-item{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:28px;padding:0 14px;border:0;border-radius:calc(var(--dsw-radius-md,12px) - 3px);background:transparent;cursor:pointer;color:var(--dsw-alias-label-secondary);font-size:13px;font-weight:500;white-space:nowrap;transition:color 120ms ease,background-color 160ms var(--gitp-ease),box-shadow 160ms var(--gitp-ease)}
.gitp-rail-item:hover:not(.is-active){color:var(--dsw-alias-label-primary)}
.gitp-rail-item.is-active{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-soft,0 1px 3px rgba(0,0,0,.12))}
.gitp-rail-label{white-space:nowrap}
.gitp-rail-count{min-width:16px;font-size:12px;font-weight:500;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;text-align:center}
.gitp-content{display:flex;flex:1;min-width:0;min-height:0;border-top:1px solid var(--dsw-alias-border-l1)}
.gitp-changes{display:flex;flex:1;min-width:0;min-height:0}
.gitp-listcol{display:flex;flex-direction:column;width:320px;max-width:calc(100% - 280px);flex:none;min-width:0;min-height:0;background:var(--dsw-alias-bg-base)}
.gitp-filter-box{display:flex;align-items:center;gap:6px;flex:none;margin:8px 8px 4px;padding:0 8px;height:30px;border:var(--gitp-hair) solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-sm,8px);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-tertiary);transition:border-color 120ms ease}
.gitp-filter-box:focus-within{border-color:var(--dsw-alias-state-business-primary)}
.gitp-filter-box input{flex:1;min-width:0;border:0;background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;outline:none;padding:0}
.gitp-filter-clear{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border:0;border-radius:50%;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;padding:0}
.gitp-filter-clear:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.gitp-filelist{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:0 8px 8px}
.gitp-section-head{display:flex;align-items:center;gap:6px;height:28px;padding:0 4px 0 6px;margin-top:6px;font-size:13px;font-weight:500;color:var(--dsw-alias-label-tertiary);user-select:none;cursor:pointer;border-radius:var(--dsw-radius-sm,8px);transition:color 100ms ease}
.gitp-section-head:hover{color:var(--dsw-alias-label-secondary)}
.gitp-section-head.is-conflict{color:var(--dsw-alias-state-error-primary)}
.gitp-section-chev{flex:none;color:currentColor;transition:transform 160ms var(--gitp-ease)}
.gitp-section-chev.is-collapsed{transform:rotate(-90deg)}
.gitp-section-title{display:flex;align-items:center;gap:6px;flex:1;min-width:0}
.gitp-section-count{font-size:12px;font-weight:500;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.gitp-section-head.is-conflict .gitp-section-count{color:inherit}
.gitp-section-action{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;flex:none;opacity:0;transition:opacity 120ms ease,background-color 120ms ease,color 120ms ease}
.gitp-section-head:hover .gitp-section-action,.gitp-section-head:focus-within .gitp-section-action,.gitp-section-action:focus-visible{opacity:1}
.gitp-section-action:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.gitp-section-action:disabled{opacity:.4;cursor:default}
.gitp-filerow{display:flex;align-items:center;gap:8px;width:100%;height:30px;padding:0 4px 0 8px;border:0;border-radius:var(--dsw-radius-sm,8px);background:transparent;cursor:pointer;text-align:left;color:var(--dsw-alias-label-primary);transition:background-color 100ms ease;user-select:none}
.gitp-filerow:hover{background:var(--dsw-alias-interactive-bg-hover)}
.gitp-filerow.is-selected{background:var(--dsw-alias-interactive-bg-active)}
.gitp-status{display:inline-flex;align-items:center;justify-content:center;width:14px;font-family:var(--gitp-mono);font-size:11px;font-weight:600;flex:none}
.gitp-status.is-modified{color:var(--dsw-alias-state-business-primary)}
.gitp-status.is-added{color:var(--dsw-alias-state-success-primary)}
.gitp-status.is-deleted,.gitp-status.is-conflict{color:var(--dsw-alias-state-error-primary)}
.gitp-status.is-renamed,.gitp-status.is-untracked{color:var(--dsw-alias-state-warn-primary)}
.gitp-filename{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
.gitp-filedir{color:var(--dsw-alias-label-tertiary)}
.gitp-both-tag{display:inline-flex;align-items:center;margin-left:6px;padding:0 6px;border-radius:999px;font-size:11px;line-height:16px;font-weight:500;background:var(--dsw-alias-bg-module-platform,var(--dsw-alias-interactive-bg-hover));color:var(--dsw-alias-label-secondary);vertical-align:1px}
.gitp-delta{display:inline-flex;gap:6px;flex:none;font-size:12px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.gitp-add{color:var(--dsw-alias-state-success-primary)}
.gitp-del{color:var(--dsw-alias-state-error-primary)}
.gitp-rowaction{opacity:0;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;flex:none;transition:opacity 100ms ease,background-color 100ms ease}
.gitp-filerow:hover .gitp-rowaction,.gitp-filerow:focus-within .gitp-rowaction,.gitp-filerow.is-selected .gitp-rowaction,.gitp-rowaction:focus-visible{opacity:1}
.gitp-rowaction:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-accent,var(--dsw-alias-interactive-bg-active));color:var(--dsw-alias-label-primary)}
.gitp-rowaction:disabled{opacity:.4;cursor:default}
.gitp-commitbox{position:relative;flex:none;padding:8px;display:flex;flex-direction:column;gap:6px;border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base)}
.gitp-commitbox textarea{display:block;box-sizing:border-box;width:100%;height:72px;min-height:72px;overflow-y:hidden;resize:none;padding:8px 10px;border:var(--gitp-hair) solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-sm,8px);background:var(--dsw-specific-input-major,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;transition:border-color 120ms ease}
.gitp-commitbox textarea:focus{outline:none;border-color:var(--dsw-alias-state-business-primary)}
.gitp-commit-status-line{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:0 2px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.gitp-commit-status-line.has-conflict{color:var(--dsw-alias-state-error-primary)}
.gitp-commit-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.gitp-amend{display:inline-flex;align-items:center;gap:6px;padding-left:2px;font-size:12px;color:var(--dsw-alias-label-secondary);cursor:pointer;flex:none;margin-right:auto;user-select:none}
.gitp-amend input,.gitp-check input{width:14px;height:14px;margin:0;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}
.gitp-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 14px;border:0;border-radius:var(--dsw-radius-sm,8px);background:transparent;box-shadow:inset 0 0 0 var(--gitp-hair) var(--dsw-alias-border-l3);color:var(--dsw-alias-label-primary);cursor:pointer;font-size:13px;font-weight:500;flex:none;white-space:nowrap;transition:background-color 120ms ease,opacity 120ms ease;user-select:none}
.gitp-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.gitp-btn:active:not(:disabled){background:var(--dsw-alias-interactive-bg-active)}
.gitp-btn:disabled{opacity:.4;cursor:default}
.gitp-btn.is-primary{background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary));box-shadow:none;color:var(--dsw-alias-label-primary-foreground,var(--dsw-alias-bg-base))}
.gitp-btn.is-primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover,var(--dsw-alias-button-primary-fill))}
.gitp-btn.is-danger{background:var(--dsw-alias-state-error-primary);box-shadow:none;color:#fff}
.gitp-btn.is-danger:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 88%,#000)}
.gitp-btn.is-small{height:28px;padding:0 10px;font-size:12px}
.gitp-btn.is-icon{width:28px;min-width:28px;padding:0}
.gitp-btn .gitp-spinner{width:12px;height:12px;border-width:1.5px;border-color:currentColor;border-top-color:transparent;opacity:.8}
.gitp-diffcol{display:flex;flex:1;min-width:0;min-height:0;flex-direction:column;background:var(--dsw-alias-bg-base)}
.gitp-diff{display:flex;flex-direction:column;flex:1;min-height:0;min-width:0}
.gitp-diff-head{display:flex;align-items:center;gap:8px;height:44px;padding:0 8px 0 12px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none}
.gitp-diff-title{display:flex;align-items:center;gap:8px;flex:1;min-width:0;overflow:hidden;white-space:nowrap}
.gitp-diff-path{display:block;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:13px}
.gitp-diff-dir{color:var(--dsw-alias-label-tertiary)}
.gitp-diff-base{font-weight:500;color:var(--dsw-alias-label-primary)}
.gitp-diff-pill{display:inline-flex;align-items:center;padding:1px 8px;border-radius:999px;font-size:11px;line-height:17px;font-weight:500;flex:none}
.gitp-diff-pill.is-staged{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 10%,transparent);color:var(--dsw-alias-state-success-primary)}
.gitp-diff-pill.is-unstaged{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 10%,transparent);color:var(--dsw-alias-state-business-primary)}
.gitp-diff-pill.is-conflict{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent);color:var(--dsw-alias-state-error-primary)}
.gitp-diff-pill.is-commit{background:var(--dsw-alias-bg-module-platform,var(--dsw-alias-interactive-bg-hover));color:var(--dsw-alias-label-secondary)}
.gitp-diff-stats{display:inline-flex;gap:6px;flex:none;font-size:12px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary)}
.gitp-change-nav{display:flex;align-items:center;gap:0;flex:none}
.gitp-change-nav .gitp-iconbtn{width:24px;height:24px;min-width:24px;border-radius:6px}
.gitp-change-count{min-width:32px;text-align:center;font-size:12px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.gitp-diff-actions{display:flex;align-items:center;gap:6px;flex:none}
.gitp-seg{display:inline-flex;gap:2px;padding:2px;height:28px;border-radius:var(--dsw-radius-sm,8px);background:var(--dsw-alias-interactive-bg-hover)}
.gitp-seg button{display:inline-flex;align-items:center;justify-content:center;width:28px;height:100%;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;transition:color 120ms ease,background-color 120ms ease}
.gitp-seg button:hover:not(.is-active){color:var(--dsw-alias-label-primary)}
.gitp-seg button.is-active{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-elevation-soft,0 1px 2px rgba(0,0,0,.12))}
.gitp-conflict-banner{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 8%,var(--dsw-alias-bg-base));color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px;flex:none}
.gitp-conflict-banner span{flex:1;min-width:160px}
.gitp-pane-heads{display:flex;flex:none;height:28px;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:12px;color:var(--dsw-alias-label-tertiary)}
.gitp-pane-head{display:flex;align-items:center;flex:1;min-width:0;padding:0 12px;font-weight:500}
.gitp-pane-head-gutter{width:52px;flex:none;border-left:1px solid var(--dsw-alias-border-l1);border-right:1px solid var(--dsw-alias-border-l1)}
.gitp-panes{display:flex;flex:1;min-height:0;position:relative}
.gitp-pane{flex:1;min-width:0;overflow:auto;font-family:var(--gitp-mono);font-size:12px;line-height:20px}
.gitp-gutter{position:relative;width:52px;flex:none;overflow:hidden;border-left:1px solid var(--dsw-alias-border-l1);border-right:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);z-index:1}
.gitp-gutter-inner{position:absolute;top:0;left:0;right:0;will-change:transform}
.gitp-arrows{position:absolute;left:0;right:0;height:20px;display:flex;align-items:center;justify-content:center;gap:2px}
.gitp-arrow{display:inline-flex;align-items:center;justify-content:center;width:22px;height:18px;padding:0;border:0;border-radius:var(--dsw-radius-xs,4px);background:var(--dsw-alias-bg-layer-1);box-shadow:inset 0 0 0 var(--gitp-hair) var(--dsw-alias-border-l3);color:var(--dsw-alias-label-secondary);cursor:pointer;transition:color 100ms ease,background-color 100ms ease,box-shadow 100ms ease}
.gitp-arrow:hover:not(:disabled){color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 12%,var(--dsw-alias-bg-layer-1));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--dsw-alias-state-success-primary) 60%,transparent)}
.gitp-arrow.is-revert:hover:not(:disabled){color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,var(--dsw-alias-bg-layer-1));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--dsw-alias-state-error-primary) 60%,transparent)}
.gitp-arrow:disabled{opacity:.35;cursor:default}
.gitp-line,.gitp-urow{display:flex;width:max-content;min-width:100%;height:20px;line-height:20px;white-space:pre}
.gitp-ln{position:sticky;left:0;width:48px;flex:none;padding-right:10px;text-align:right;color:var(--dsw-alias-label-dimmed,var(--dsw-alias-label-tertiary));background:var(--dsw-alias-bg-base);user-select:none;font-size:11px;z-index:1}
.gitp-code,.gitp-ucontent{display:block;width:max-content;padding:0 16px 0 10px;white-space:pre;flex:none}
.gitp-line.is-add,.gitp-urow.is-add{background:var(--dsw-alias-file-diff-added-bg,color-mix(in srgb,var(--dsw-alias-state-success-primary) 12%,transparent))}
.gitp-line.is-del,.gitp-urow.is-del{background:var(--dsw-alias-file-diff-deleted-bg,color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent))}
.gitp-line.is-add .gitp-ln{background:var(--dsw-alias-file-diff-added-gutter,var(--dsw-alias-bg-base));color:var(--dsw-alias-file-diff-added-marker,var(--dsw-alias-state-success-primary))}
.gitp-line.is-del .gitp-ln{background:var(--dsw-alias-file-diff-deleted-gutter,var(--dsw-alias-bg-base));color:var(--dsw-alias-file-diff-deleted-marker,var(--dsw-alias-state-error-primary))}
.gitp-line.is-blank{background:repeating-linear-gradient(-45deg,transparent 0 5px,var(--dsw-alias-border-l1) 5px 6px)}
.gitp-line.is-blank .gitp-ln{background:var(--dsw-alias-bg-base)}
.gitp-line.is-add .gitp-word,.gitp-urow.is-add .gitp-word{background:color-mix(in srgb,var(--dsw-alias-file-diff-added-marker,var(--dsw-alias-state-success-primary)) 32%,transparent);border-radius:3px}
.gitp-line.is-del .gitp-word,.gitp-urow.is-del .gitp-word{background:color-mix(in srgb,var(--dsw-alias-file-diff-deleted-marker,var(--dsw-alias-state-error-primary)) 32%,transparent);border-radius:3px}
.gitp-unified{flex:1;min-height:0;overflow:auto;font-family:var(--gitp-mono);font-size:12px;line-height:20px}
.gitp-uarrows{position:sticky;left:0;width:52px;flex:none;display:flex;align-items:center;justify-content:center;gap:2px;background:var(--dsw-alias-bg-base);z-index:2}
.gitp-urow.is-conflict-marker{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 14%,transparent);color:var(--dsw-alias-state-error-primary);font-weight:600}
.gitp-uno{width:40px;flex:none;text-align:right;padding-right:8px;color:var(--dsw-alias-label-dimmed,var(--dsw-alias-label-tertiary));font-size:11px;user-select:none}
.gitp-urow.is-add .gitp-uno{color:var(--dsw-alias-file-diff-added-marker,var(--dsw-alias-state-success-primary))}
.gitp-urow.is-del .gitp-uno{color:var(--dsw-alias-file-diff-deleted-marker,var(--dsw-alias-state-error-primary))}
.gitp-diff-foot{display:flex;align-items:center;gap:12px;height:28px;padding:0 12px;border-top:1px solid var(--dsw-alias-border-l1);font-size:12px;color:var(--dsw-alias-label-tertiary);flex:none;font-variant-numeric:tabular-nums}
.gitp-diff-foot-spacer{flex:1}
.gitp-diff-legend{display:inline-flex;align-items:center;gap:6px}
.gitp-diff-dot{width:8px;height:8px;border-radius:2px}
.gitp-diff-dot.is-add{background:var(--dsw-alias-file-diff-added-marker,var(--dsw-alias-state-success-primary))}
.gitp-diff-dot.is-del{background:var(--dsw-alias-file-diff-deleted-marker,var(--dsw-alias-state-error-primary))}
.gitp-binary{display:flex;flex:1;align-items:center;justify-content:center;flex-direction:column;gap:4px;color:var(--dsw-alias-label-tertiary);padding:40px;text-align:center;font-variant-numeric:tabular-nums}
.gitp-binary-title{color:var(--dsw-alias-label-primary);font-weight:500;font-size:14px}
.gitp-loglist{flex:1 1 55%;min-height:140px;overflow:auto;padding:6px 8px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.gitp-commitrow{display:flex;align-items:stretch;gap:8px;width:100%;padding:6px 8px 6px 4px;border:0;border-radius:var(--dsw-radius-sm,8px);background:transparent;cursor:pointer;text-align:left;transition:background-color 100ms ease;user-select:none}
.gitp-commitrow:hover{background:var(--dsw-alias-interactive-bg-hover)}
.gitp-commitrow.is-selected{background:var(--dsw-alias-interactive-bg-active)}
.gitp-graph{position:relative;flex:none;align-self:stretch;min-height:36px}
.gitp-graph-line{position:absolute;top:-6px;bottom:-6px;width:1.5px;margin-left:-.75px;background:var(--dsw-alias-border-l2)}
.gitp-commitrow:first-child .gitp-graph-line{top:10px}
.gitp-commitrow:last-child .gitp-graph-line{bottom:calc(100% - 10px)}
.gitp-graph-dot{position:absolute;top:6px;width:9px;height:9px;margin-left:-4.5px;border-radius:50%;background:var(--dsw-alias-bg-base);box-shadow:inset 0 0 0 2px var(--dsw-alias-state-business-primary)}
.gitp-commitrow.is-selected .gitp-graph-dot{background:var(--dsw-alias-state-business-primary)}
.gitp-graph-dot.g1{box-shadow:inset 0 0 0 2px var(--dsw-alias-state-success-primary)}
.gitp-graph-dot.g2{box-shadow:inset 0 0 0 2px var(--dsw-alias-state-done-primary,var(--dsw-alias-state-warn-primary))}
.gitp-graph-dot.g3{box-shadow:inset 0 0 0 2px var(--dsw-alias-state-warn-primary)}
.gitp-commitmain{flex:1;min-width:0}
.gitp-commit-subject{font-size:13px;line-height:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary)}
.gitp-commit-meta{display:flex;gap:6px;align-items:center;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);min-width:0;white-space:nowrap;overflow:hidden}
.gitp-refs{display:flex;gap:4px;flex-wrap:wrap;margin-top:4px}
.gitp-ref{display:inline-flex;align-items:center;padding:0 7px;border-radius:999px;font-size:11px;line-height:17px;font-weight:500;color:var(--dsw-alias-label-tertiary);box-shadow:inset 0 0 0 var(--gitp-hair) var(--dsw-alias-border-l4);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gitp-ref.is-head{color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 10%,transparent);box-shadow:none}
.gitp-logdetail-summary{flex:1 1 45%;min-height:140px;overflow:auto;display:flex;flex-direction:column;background:var(--dsw-alias-bg-base)}
.gitp-detail-head{padding:12px 16px 10px;flex:none}
.gitp-detail-subject{font-size:14px;line-height:22px;font-weight:500;margin-bottom:4px;word-break:break-word;text-wrap:pretty}
.gitp-detail-meta{display:flex;gap:4px 10px;flex-wrap:wrap;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);align-items:center}
.gitp-detail-hash-btn{display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 6px;margin-left:-6px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font-family:var(--gitp-mono);font-size:12px;cursor:pointer;transition:background-color 100ms ease,color 100ms ease}
.gitp-detail-hash-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.gitp-detail-body{padding:0 16px 8px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-word;max-width:72ch}
.gitp-detail-section-head{display:flex;align-items:center;gap:6px;padding:8px 16px 4px;font-size:13px;font-weight:500;color:var(--dsw-alias-label-tertiary);border-top:1px solid var(--dsw-alias-border-l1)}
.gitp-detail-files{display:flex;flex-direction:column;padding:0 8px 8px;flex:none}
.gitp-detail-file{display:flex;align-items:center;gap:8px;height:30px;padding:0 8px;border:0;border-radius:var(--dsw-radius-sm,8px);background:transparent;cursor:pointer;text-align:left;font-size:13px;color:var(--dsw-alias-label-primary);transition:background-color 100ms ease}
.gitp-detail-file:hover{background:var(--dsw-alias-interactive-bg-hover)}
.gitp-detail-file.is-selected{background:var(--dsw-alias-interactive-bg-active)}
.gitp-detail-title{display:flex;align-items:flex-start;gap:4px;margin-bottom:4px}
.gitp-detail-title .gitp-detail-subject{margin-bottom:0;flex:1;min-width:0}
.gitp-action-row{display:flex;align-items:flex-start;gap:8px;width:100%;min-height:34px;padding:5px 8px;border:0;border-radius:var(--dsw-radius-sm,8px);background:transparent;text-align:left;cursor:pointer}
.gitp-action-row:hover:not(:disabled),.gitp-action-row:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}
.gitp-action-row:disabled{opacity:.55;cursor:default}
.gitp-action-row svg{flex:none;margin-top:2px;color:var(--dsw-alias-menu-icon,var(--dsw-alias-label-secondary))}
.gitp-action-text{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1}
.gitp-action-label{font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary)}
.gitp-action-reason{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);white-space:normal;text-wrap:pretty}
.gitp-popover-blurb{padding:0 8px 6px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gitp-reset-mode{display:flex;align-items:flex-start;gap:9px;padding:7px 8px;border-radius:var(--dsw-radius-sm,8px);cursor:pointer}
.gitp-reset-mode:hover{background:var(--dsw-alias-interactive-bg-hover)}
.gitp-reset-mode input{margin:3px 0 0;accent-color:var(--dsw-alias-state-business-primary)}
.gitp-reset-mode-text{display:flex;flex-direction:column;gap:1px;min-width:0}
.gitp-reset-mode-title{font-size:13px;line-height:20px;font-weight:500}
.gitp-reset-mode-hint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);text-wrap:pretty}
.gitp-modal-warn{margin-top:8px;padding:8px 10px;border-radius:var(--dsw-radius-sm,8px);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent);color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px;text-wrap:pretty}
.gitp-stash{display:flex;flex:1;min-width:0;min-height:0;flex-direction:column;background:var(--dsw-alias-bg-base)}
.gitp-stash-head{display:flex;align-items:center;justify-content:space-between;gap:8px;height:44px;padding:0 8px 0 16px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none}
.gitp-stash-title{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:500;color:var(--dsw-alias-label-secondary)}
.gitp-stashlist{flex:1;min-height:0;overflow:auto;padding:6px 8px}
.gitp-stashrow{display:flex;align-items:center;gap:12px;padding:8px 8px 8px 10px;border-radius:var(--dsw-radius-sm,8px);transition:background-color 100ms ease}
.gitp-stashrow+.gitp-stashrow{box-shadow:0 -1px 0 var(--dsw-alias-border-l1)}
.gitp-stashrow:hover{background:var(--dsw-alias-interactive-bg-hover);box-shadow:none}
.gitp-stashrow:hover+.gitp-stashrow{box-shadow:none}
.gitp-stash-main{flex:1;min-width:0}
.gitp-stash-msg{font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gitp-stash-meta{display:flex;align-items:center;gap:6px;margin-top:2px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.gitp-stash-ref{font-family:var(--gitp-mono);font-size:11px}
.gitp-stash-actions{display:flex;gap:4px;flex:none}
.gitp-stash-btn-danger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger,color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent));color:var(--dsw-alias-state-error-primary)}
.gitp-modal-layer{position:absolute;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.45));backdrop-filter:var(--dsw-mask-blur,blur(4px));animation:gitp-fade-in 160ms ease-out}
@keyframes gitp-fade-in{from{opacity:0}to{opacity:1}}
.gitp-modal{width:380px;max-width:100%;max-height:100%;overflow-y:auto;padding:22px 24px 24px;border:0;border-radius:var(--dsw-radius-xl,20px);background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-elevation-prominent,0 16px 48px rgba(0,0,0,.4));animation:gitp-modal-in 200ms var(--gitp-ease)}
@keyframes gitp-modal-in{from{opacity:0;transform:translateY(6px) scale(.985)}to{opacity:1;transform:none}}
.gitp-modal-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 -10px 12px 0}
.gitp-modal-title{font-size:16px;line-height:24px;font-weight:500;color:var(--dsw-alias-label-primary)}
.gitp-modal-sub{font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary);margin-bottom:12px;text-wrap:pretty}
.gitp-field{display:flex;flex-direction:column;gap:6px;margin-bottom:14px}
.gitp-field label{font-size:13px;color:var(--dsw-alias-label-secondary);font-weight:500}
.gitp-field input,.gitp-field textarea{width:100%;height:36px;padding:0 10px;border:var(--gitp-hair) solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-sm,8px);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:13px;transition:border-color 120ms ease}
.gitp-field textarea{box-sizing:border-box;height:80px;min-height:80px;padding:8px 10px;resize:vertical;line-height:20px}
.gitp-field input:focus,.gitp-field textarea:focus{outline:none;border-color:var(--dsw-alias-state-business-primary)}
.gitp-field-hint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.gitp-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:20px}
.gitp-modal-error{font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary);margin-bottom:8px;word-break:break-word}
.gitp-filechecks{max-height:200px;overflow:auto;border-radius:var(--dsw-radius-sm,8px);padding:4px;margin-bottom:12px;background:var(--dsw-alias-bg-layer-1);box-shadow:inset 0 0 0 var(--gitp-hair) var(--dsw-alias-border-l3)}
.gitp-check{display:flex;align-items:center;gap:8px;height:30px;padding:0 8px;font-size:13px;cursor:pointer;border-radius:6px}
.gitp-check:hover{background:var(--dsw-alias-interactive-bg-hover)}
.gitp-check-path{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gitp-linkbtn{border:0;padding:0 2px;background:transparent;color:var(--dsw-alias-link,var(--dsw-alias-state-business-primary));cursor:pointer;font-size:12px;font-weight:500}
.gitp-linkbtn:hover{text-decoration:underline;text-underline-offset:3px}
.gitp-popover-layer{position:absolute;inset:0;z-index:40}
.gitp-popover{position:absolute;top:44px;left:8px;width:280px;max-width:calc(100% - 16px);max-height:min(400px,calc(100% - 56px));overflow:auto;padding:4px;border-radius:var(--dsw-radius-md,12px);background:var(--dsw-menu-surface-fill,var(--dsw-alias-bg-overlay));backdrop-filter:var(--dsw-menu-backdrop-filter,none);box-shadow:var(--dsw-elevation-prominent,0 12px 32px rgba(0,0,0,.35));z-index:50;animation:gitp-pop-in 140ms var(--gitp-ease)}
@keyframes gitp-pop-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
.gitp-popover.is-wide{width:320px}
.gitp-ai-wrap{position:relative;display:inline-flex;flex:none}
.gitp-popover.is-menu{top:auto;left:auto;right:0;bottom:calc(100% + 6px);width:248px;max-height:none;animation-name:gitp-pop-up}
@keyframes gitp-pop-up{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.gitp-search{display:block;width:100%;height:32px;margin:0 0 4px;border:0;border-bottom:1px solid var(--dsw-alias-border-l1);border-radius:0;background:transparent;color:var(--dsw-alias-label-primary);padding:0 8px;font-size:13px;outline:none}
.gitp-popover-list{display:flex;flex-direction:column}
.gitp-popover-sep{height:1px;background:var(--dsw-alias-border-l1);margin:4px 6px}
.gitp-popover-title{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);padding:6px 8px 2px;font-weight:500}
.gitp-popover-row{display:flex;align-items:center;gap:8px;width:100%;min-height:30px;padding:4px 8px;border:0;border-radius:var(--dsw-radius-sm,8px);background:transparent;cursor:pointer;text-align:left;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary)}
.gitp-popover-row svg{flex:none;color:var(--dsw-alias-menu-icon,var(--dsw-alias-label-secondary))}
.gitp-popover-row:hover:not(:disabled),.gitp-popover-row:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}
.gitp-popover-row:disabled{opacity:.4;cursor:default}
.gitp-popover-row[aria-selected=true]:disabled{opacity:1;cursor:default}
.gitp-popover-row .gitp-checkmark{margin-left:auto;color:var(--dsw-alias-label-primary)}
.gitp-popover-row-text{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gitp-popover .gitp-modal-sub{padding:6px 8px;margin:0;color:var(--dsw-alias-label-tertiary)}
.gitp-center{display:flex;flex:1;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:32px 24px;text-align:center;color:var(--dsw-alias-label-tertiary)}
.gitp-center-title{font-size:14px;line-height:22px;font-weight:500;color:var(--dsw-alias-label-primary)}
.gitp-center-hint{max-width:320px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary);text-wrap:pretty}
.gitp-center-icon{display:flex;color:var(--dsw-alias-label-tertiary);margin-bottom:8px}
.gitp-center .gitp-btn{margin-top:12px}
.gitp-spinner{width:14px;height:14px;border:1.5px solid var(--dsw-alias-border-l3);border-top-color:var(--dsw-alias-label-secondary);border-radius:50%;animation:gitp-spin .7s linear infinite;display:inline-block;flex:none}
@keyframes gitp-spin{to{transform:rotate(360deg)}}
.gitp-error{display:flex;align-items:flex-start;gap:8px;margin:0 12px 8px;padding:8px 6px 8px 10px;border-radius:var(--dsw-radius-sm,8px);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent);color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px;flex:none}
.gitp-error>svg{margin-top:2px;flex:none}
.gitp-error-text{flex:1;min-width:0;padding-top:1px;word-break:break-word}
.gitp-error .gitp-iconbtn{color:inherit;width:22px;height:22px;min-width:22px;border-radius:6px}
.gitp-stash .gitp-error{margin:8px 8px 0}
.gitp-toast{position:absolute;left:50%;bottom:16px;z-index:60;width:max-content;max-width:calc(100% - 32px);padding:10px 16px;border-radius:var(--dsw-radius-md,12px);background:var(--dsw-alias-toast-bg,var(--dsw-alias-bg-overlay));color:var(--dsw-alias-toast-label,var(--dsw-alias-label-primary));box-shadow:var(--dsw-shadow-lv3,0 8px 24px rgba(0,0,0,.25));font-size:13px;line-height:20px;transform:translateX(-50%);pointer-events:none;animation:gitp-toast-in 180ms var(--gitp-ease)}
@keyframes gitp-toast-in{from{opacity:0;transform:translate(-50%,6px)}to{opacity:1;transform:translateX(-50%)}}
.gitp-toast.is-error{color:var(--dsw-static-red-400,var(--dsw-alias-state-error-primary))}
.gitp-tab-title{margin-left:6px}
@media (prefers-reduced-motion:reduce){.gitp-root *,.gitp-root *::before,.gitp-root *::after{animation-duration:1ms!important;transition-duration:1ms!important}}
.gitp-root.is-compact .gitp-head{padding:0 4px 0 8px;gap:4px}
.gitp-root.is-compact .gitp-repo{display:none}
.gitp-root.is-compact .gitp-branch{max-width:200px}
.gitp-root.is-compact .gitp-rail{margin:0 8px 8px;max-width:calc(100% - 16px)}
.gitp-root.is-compact .gitp-rail-item{padding:0 12px}
.gitp-root.is-compact .gitp-changes{flex-direction:column}
.gitp-root.is-compact .gitp-listcol{width:100%;max-width:none;flex:1;min-height:0}
.gitp-root.is-compact .gitp-diffcol{width:100%;flex:1;min-height:0;height:auto}
.gitp-root.is-compact .gitp-diff-head{gap:6px;padding:0 4px}
.gitp-root.is-compact .gitp-error{margin:0 8px 8px}
.gitp-resizer{position:relative;z-index:1;flex:none;width:0;cursor:col-resize;touch-action:none;-webkit-app-region:no-drag}
.gitp-resizer::before{content:"";position:absolute;top:0;bottom:0;left:-.25px;width:var(--gitp-hair,.5px);background:var(--dsw-alias-border-l4)}
.gitp-resizer::after{content:"";position:absolute;inset:0 -4px;opacity:0;transition:opacity 120ms ease-out;background:linear-gradient(to bottom,transparent,var(--dsw-alias-label-caption) 50%,transparent) center / 1px 100% no-repeat}
.gitp-resizer:hover::after,.gitp-resizer:focus-visible::after,.gitp-resizer:active::after{opacity:1}
.gitp-resizer:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:0}
.gitp-settings{--gitp-hair:var(--dsh-hairline-width,.5px);--gitp-ring:var(--dsw-alias-state-business-primary);display:flex;flex-direction:column;gap:24px;max-width:640px}
.gitp-settings-row{display:flex;flex-direction:column;gap:8px}
.gitp-settings-copy{display:flex;flex-direction:column;gap:2px}
.gitp-settings-label{font-size:13px;line-height:20px;font-weight:500;color:var(--dsw-alias-label-primary)}
.gitp-settings-hint{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.gitp-settings-error{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary)}
.gitp-settings select,.gitp-settings textarea{width:100%;padding:0 10px;border:var(--gitp-hair) solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-sm,8px);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;transition:border-color 120ms ease}
.gitp-settings select{height:36px}
.gitp-settings textarea{height:132px;padding:8px 10px;resize:vertical}
.gitp-settings select:focus,.gitp-settings textarea:focus{outline:none;border-color:var(--dsw-alias-state-business-primary)}
.gitp-settings select:focus-visible,.gitp-settings textarea:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}
.gitp-settings-actions{display:flex;justify-content:flex-end}
`;

// The stylesheet is needed outside the panel too, for the session header
// button, so it installs once when the module loads.
const CSS_TAG_ID = 'dsh-git-desk/styles';
if (
  typeof document !== 'undefined' &&
  document.querySelector(`style[data-plugin-css=${JSON.stringify(CSS_TAG_ID)}]`) === null
) {
  const tag = document.createElement('style');
  tag.dataset.plugin = 'dsh-git-desk';
  tag.dataset.pluginCss = CSS_TAG_ID;
  tag.textContent = CSS;
  document.head.appendChild(tag);
}

interface EmptyProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  hint?: React.ReactNode;
  action?: React.ReactNode;
}

function Empty({ icon, title, hint, action }: EmptyProps) {
  return h(
    'div',
    { className: 'gitp-center' },
    icon ? h('div', { className: 'gitp-center-icon' }, icon) : null,
    h('div', { className: 'gitp-center-title' }, title),
    hint ? h('div', { className: 'gitp-center-hint' }, hint) : null,
    action ?? null,
  );
}

function Spinner() {
  return h('span', { className: 'gitp-spinner', 'aria-hidden': 'true' });
}

interface IconButtonProps {
  label: string;
  icon: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}

function IconButton({ label, icon, onClick, disabled, active }: IconButtonProps) {
  return h(
    'button',
    {
      type: 'button',
      className: cx('gitp-iconbtn', active && 'is-active'),
      onClick,
      disabled,
      'aria-label': label,
      title: label,
    },
    h(Icon, { path: icon }),
  );
}

interface SyncButtonProps {
  label: string;
  icon: string;
  count: number;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
}

function SyncButton({ label, icon, count, onClick, disabled, busy }: SyncButtonProps) {
  return h(
    'button',
    {
      type: 'button',
      className: cx('gitp-toolbtn', count > 0 && 'has-count'),
      onClick,
      disabled: disabled || busy,
      'aria-label': count > 0 ? `${label}, ${count}` : label,
      title: count > 0 ? `${label} (${count})` : label,
    },
    busy ? h(Spinner) : h(Icon, { path: icon, size: 14 }),
    count > 0 ? h('span', { className: 'gitp-toolbtn-num' }, count > 99 ? '99+' : String(count)) : null,
  );
}

interface ModalProps {
  title: React.ReactNode;
  onClose: () => void;
  children?: React.ReactNode;
  danger?: boolean;
  closeLabel?: string;
}

function Modal({ title, onClose, children, danger, closeLabel = 'Close' }: ModalProps) {
  const card = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const node = card.current;
    const focusable = node?.querySelector<HTMLElement>('input, textarea, select, button');
    focusable?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || node === null) return;
      const items = [
        ...node.querySelectorAll<HTMLElement>(
          'button, input, textarea, select, [href], [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((item) => !item.hasAttribute('disabled') && item.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (first === undefined || last === undefined) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (previous instanceof HTMLElement && typeof previous.focus === 'function') previous.focus();
    };
  }, []);
  return h(
    'div',
    {
      className: 'gitp-modal-layer',
      onMouseDown: (event) => {
        if (event.target === event.currentTarget) closeRef.current();
      },
    },
    h(
      'div',
      {
        className: cx('gitp-modal', danger && 'is-danger'),
        ref: card,
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': title,
      },
      h(
        'div',
        { className: 'gitp-modal-head' },
        h('div', { className: 'gitp-modal-title' }, title),
        h(IconButton, { label: closeLabel, icon: paths.close, onClick: onClose }),
      ),
      children,
    ),
  );
}

interface ConfirmDialogProps {
  title: React.ReactNode;
  body: React.ReactNode;
  confirmLabel: React.ReactNode;
  cancelLabel: React.ReactNode;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

function ConfirmDialog({ title, body, confirmLabel, cancelLabel, danger, busy, onConfirm, onClose }: ConfirmDialogProps) {
  return h(
    Modal,
    { title, onClose, danger },
    h('div', { className: 'gitp-modal-sub' }, body),
    h(
      'div',
      { className: 'gitp-modal-actions' },
      h('button', { type: 'button', className: 'gitp-btn', onClick: onClose, disabled: busy }, cancelLabel),
      h(
        'button',
        {
          type: 'button',
          className: cx('gitp-btn', danger ? 'is-danger' : 'is-primary'),
          onClick: onConfirm,
          disabled: busy,
        },
        busy ? h(Spinner) : null,
        confirmLabel,
      ),
    ),
  );
}

interface BranchDialogProps {
  t: Translator;
  defaultName: string;
  defaultMessage: string;
  busy: boolean;
  error?: React.ReactNode;
  onCreate: (value: { name: string; message: string }) => void;
  onClose: () => void;
}

function BranchDialog({ t, defaultName, defaultMessage, busy, error, onCreate, onClose }: BranchDialogProps) {
  const [name, setName] = useState(defaultName);
  const [message, setMessage] = useState(defaultMessage);
  const messageRef = useRef<HTMLTextAreaElement | null>(null);
  useAutoGrow(messageRef, message);
  const canSubmit = name.trim() !== '' && message.trim() !== '' && !busy;
  return h(
    Modal,
    { title: t('branch.title'), onClose, closeLabel: t('action.close') },
    h(
      'div',
      { className: 'gitp-field' },
      h('label', { htmlFor: 'gitp-branch-name' }, t('branch.name')),
      h('input', {
        id: 'gitp-branch-name',
        value: name,
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => setName(event.target.value),
        spellCheck: false,
        autoComplete: 'off',
      }),
      h('div', { className: 'gitp-field-hint' }, t('branch.nameHint')),
    ),
    h(
      'div',
      { className: 'gitp-field' },
      h('label', { htmlFor: 'gitp-branch-message' }, t('branch.message')),
      h('textarea', {
        id: 'gitp-branch-message',
        ref: messageRef,
        value: message,
        onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => setMessage(event.target.value),
      }),
    ),
    error ? h('div', { className: 'gitp-modal-error' }, error) : null,
    h(
      'div',
      { className: 'gitp-modal-actions' },
      h('button', { type: 'button', className: 'gitp-btn', onClick: onClose, disabled: busy }, t('action.cancel')),
      h(
        'button',
        {
          type: 'button',
          className: 'gitp-btn is-primary',
          disabled: !canSubmit,
          onClick: () => onCreate({ name: name.trim(), message: message.trim() }),
        },
        busy ? h(Spinner) : null,
        t('action.createBranch'),
      ),
    ),
  );
}

interface StashDialogProps {
  t: Translator;
  files: StatusEntry[];
  busy: boolean;
  error?: React.ReactNode;
  onCreate: (value: { paths: string[]; message: string }) => void;
  onClose: () => void;
}

function StashDialog({ t, files, busy, error, onCreate, onClose }: StashDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(files.map((file) => file.path)));
  const [message, setMessage] = useState('');
  const toggle = (path: string): void => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };
  return h(
    Modal,
    { title: t('stash.title'), onClose, closeLabel: t('action.close') },
    h('div', { className: 'gitp-modal-sub' }, t('stash.selectHint')),
    files.length > 1
      ? h(
          'div',
          { style: { display: 'flex', justifyContent: 'flex-end', marginBottom: '4px' } },
          h(
            'button',
            {
              type: 'button',
              className: 'gitp-linkbtn',
              onClick: () =>
                setSelected(
                  selected.size === files.length ? new Set<string>() : new Set(files.map((file) => file.path)),
                ),
            },
            selected.size === files.length ? t('stash.deselectAll') : t('stash.selectAll'),
          ),
        )
      : null,
    files.length === 0
      ? h('div', { className: 'gitp-modal-sub' }, t('stash.nothing'))
      : h(
          'div',
          { className: 'gitp-filechecks' },
          files.map((file) =>
            h(
              'label',
              { className: 'gitp-check', key: file.path },
              h('input', {
                type: 'checkbox',
                checked: selected.has(file.path),
                onChange: () => toggle(file.path),
              }),
              h('span', { className: 'gitp-check-path' }, file.path),
            ),
          ),
        ),
    h(
      'div',
      { className: 'gitp-field' },
      h('label', { htmlFor: 'gitp-stash-message' }, t('stash.message')),
      h('input', {
        id: 'gitp-stash-message',
        value: message,
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => setMessage(event.target.value),
        placeholder: t('stash.default'),
      }),
    ),
    error ? h('div', { className: 'gitp-modal-error' }, error) : null,
    h(
      'div',
      { className: 'gitp-modal-actions' },
      h('button', { type: 'button', className: 'gitp-btn', onClick: onClose, disabled: busy }, t('action.cancel')),
      h(
        'button',
        {
          type: 'button',
          className: 'gitp-btn is-primary',
          disabled: busy || selected.size === 0,
          onClick: () =>
            onCreate({
              paths: [...selected],
              message: message.trim(),
            }),
        },
        busy ? h(Spinner) : null,
        t('action.stash'),
      ),
    ),
  );
}

interface FileRowProps {
  entry: StatusEntry;
  side: 'staged' | 'unstaged' | 'conflict';
  selected: boolean;
  busy: boolean;
  t: Translator;
  onSelect: () => void;
  onToggle: () => void;
}

function FileRow({ entry, side, selected, busy, t, onSelect, onToggle }: FileRowProps) {
  const path = splitPath(entry.path);
  const add = side === 'staged' ? entry.stagedAdd : entry.add;
  const del = side === 'staged' ? entry.stagedDel : entry.del;
  const actionLabel = side === 'staged' ? t('action.unstageFile') : t('action.stageFile');
  return h(
    'div',
    {
      className: cx('gitp-filerow', selected && 'is-selected'),
      role: 'button',
      tabIndex: 0,
      'aria-current': selected ? 'true' : undefined,
      onClick: () => onSelect(),
      onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      },
    },
    h('span', { className: cx('gitp-status', statusClass(entry.letter)) }, entry.letter),
    h(
      'span',
      { className: 'gitp-filename' },
      path.dir ? h('span', { className: 'gitp-filedir' }, path.dir) : null,
      path.base,
      entry.both ? h('span', { className: 'gitp-both-tag', title: t('meta.partialHint') }, t('meta.partial')) : null,
    ),
    entry.binary
      ? h('span', { className: 'gitp-delta' }, t('meta.binary'))
      : h(
          'span',
          { className: 'gitp-delta' },
          add !== null && add > 0 ? h('span', { className: 'gitp-add' }, `+${add}`) : null,
          del !== null && del > 0 ? h('span', { className: 'gitp-del' }, `−${del}`) : null,
        ),
    side === 'conflict'
      ? null
      : h(
          'button',
          {
            type: 'button',
            className: 'gitp-rowaction',
            'aria-label': actionLabel,
            title: actionLabel,
            disabled: busy,
            onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
              event.stopPropagation();
              onToggle();
            },
          },
          h(Icon, { path: side === 'staged' ? paths.minus : paths.plus, size: 14 }),
        ),
  );
}

type FileSide = 'staged' | 'unstaged' | 'conflict';

interface FileSelection {
  side: FileSide;
  path: string;
  renamed?: boolean;
  commit?: string;
}

interface ChangesViewProps {
  t: Translator;
  snapshot: StatusSnapshot;
  conflicts: StatusEntry[];
  staged: StatusEntry[];
  unstaged: StatusEntry[];
  selection: FileSelection | null;
  onSelect: (selection: FileSelection) => void;
  busy: boolean;
  fileBusy: boolean;
  onToggleFile: (entry: StatusEntry, side: 'staged' | 'unstaged') => void;
  onToggleAll: (side: 'staged' | 'unstaged') => void;
  diff: DiffPayload | null;
  diffLoading: boolean;
  layout: string;
  onLayout: (next: string) => void;
  onRefresh: () => void;
  onBlock: (block: DiffBlock, side: string) => void;
  onResolve: (side: 'ours' | 'theirs') => void;
  onOpen: (diff: DiffPayload) => void;
  message: string;
  onMessage: (text: string) => void;
  onCommit: () => void;
  onBranch: () => void;
  canCommit: boolean;
  commitBusy: boolean;
  aiBusy: boolean;
  aiMenuOpen: boolean;
  onAiToggle: () => void;
  onAiClose: () => void;
  onAiWrite: () => void;
  onAiBranch: () => void;
  selectionKey: string;
  amend: boolean;
  onAmend: (next: boolean) => void;
  canAmend: boolean;
  compact: boolean;
  onBack: () => void;
}

function ChangesView({
  t,
  snapshot,
  conflicts,
  staged,
  unstaged,
  selection,
  onSelect,
  busy,
  fileBusy,
  onToggleFile,
  onToggleAll,
  diff,
  diffLoading,
  layout,
  onLayout,
  onRefresh,
  onBlock,
  onResolve,
  onOpen,
  message,
  onMessage,
  onCommit,
  onBranch,
  canCommit,
  commitBusy,
  aiBusy,
  aiMenuOpen,
  onAiToggle,
  onAiClose,
  onAiWrite,
  onAiBranch,
  selectionKey,
  amend,
  onAmend,
  canAmend,
  compact,
  onBack,
}: ChangesViewProps) {
  const [filter, setFilter] = useState('');
  const [listWidth, setListWidth] = useSplitWidth();
  const changesRef = useRef<HTMLDivElement | null>(null);
  const changesListRef = useRef<HTMLDivElement | null>(null);
  const messageRef = useRef<HTMLTextAreaElement | null>(null);
  useAutoGrow(messageRef, message);
  const [collapsed, setCollapsed] = useState({ conflicts: false, staged: false, unstaged: false });
  const toggleSection = (key: 'conflicts' | 'staged' | 'unstaged'): void =>
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

  const needle = filter.trim().toLowerCase();
  const match = (item: StatusEntry): boolean => needle === '' || item.path.toLowerCase().includes(needle);
  const filteredConflicts = useMemo(() => conflicts.filter(match), [conflicts, needle]);
  const filteredStaged = useMemo(() => staged.filter(match), [staged, needle]);
  const filteredUnstaged = useMemo(() => unstaged.filter(match), [unstaged, needle]);

  const stagedStats = useMemo(() => {
    let add = 0;
    let del = 0;
    for (const e of staged) {
      add += e.stagedAdd ?? 0;
      del += e.stagedDel ?? 0;
    }
    return { add, del };
  }, [staged]);

  const showList = !compact || selection === null;
  const showDiff = !compact || selection !== null;

  const totalMatching = filteredConflicts.length + filteredStaged.length + filteredUnstaged.length;
  const totalRaw = conflicts.length + staged.length + unstaged.length;

  return h(
    'div',
    { className: 'gitp-changes', ref: changesRef },
    showList
      ? h(
      'div',
      {
        className: 'gitp-listcol',
        ref: changesListRef,
        style: compact ? undefined : { width: `${listWidth}px` },
      },
      totalRaw > 0
        ? h(
            'div',
            { className: 'gitp-filter-box' },
            h(Icon, { path: paths.search, size: 13 }),
            h('input', {
              type: 'text',
              value: filter,
              onChange: (event) => setFilter(event.target.value),
              placeholder: t('filter.placeholder'),
              'aria-label': t('filter.placeholder'),
              spellCheck: false,
            }),
            filter
              ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'gitp-filter-clear',
                    onClick: () => setFilter(''),
                    'aria-label': t('filter.clear'),
                  },
                  h(Icon, { path: paths.close, size: 10 }),
                )
              : null,
          )
        : null,
      h(
        'div',
        { className: 'gitp-filelist' },
        filteredConflicts.length > 0
          ? h(
              React.Fragment,
              null,
              h(
                'div',
                {
                  className: 'gitp-section-head is-conflict',
                  onClick: () => toggleSection('conflicts'),
                  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
                    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
                    event.preventDefault();
                    toggleSection('conflicts');
                  },
                  role: 'button',
                  'aria-expanded': !collapsed.conflicts,
                  tabIndex: 0,
                },
                h(Icon, {
                  path: paths.chevron,
                  size: 14,
                  className: cx('gitp-section-chev', collapsed.conflicts && 'is-collapsed'),
                }),
                h('span', { className: 'gitp-section-title' }, t('section.conflicts')),
                h('span', { className: 'gitp-section-count' }, String(filteredConflicts.length)),
              ),
              !collapsed.conflicts
                ? filteredConflicts.map((entry) =>
                    h(FileRow, {
                      key: `conflict:${entry.path}`,
                      entry,
                      side: 'conflict',
                      selected: selection?.side === 'conflict' && selection.path === entry.path,
                      busy: fileBusy,
                      t,
                      onSelect: () => onSelect({ side: 'conflict', path: entry.path, renamed: false }),
                      onToggle: () => {},
                    }),
                  )
                : null,
            )
          : null,
        filteredStaged.length > 0
          ? h(
              React.Fragment,
              null,
              h(
                'div',
                {
                  className: 'gitp-section-head',
                  onClick: () => toggleSection('staged'),
                  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
                    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
                    event.preventDefault();
                    toggleSection('staged');
                  },
                  role: 'button',
                  'aria-expanded': !collapsed.staged,
                  tabIndex: 0,
                },
                h(Icon, {
                  path: paths.chevron,
                  size: 14,
                  className: cx('gitp-section-chev', collapsed.staged && 'is-collapsed'),
                }),
                h('span', { className: 'gitp-section-title' }, t('section.staged')),
                h('span', { className: 'gitp-section-count' }, String(filteredStaged.length)),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'gitp-section-action',
                    'aria-label': t('action.unstageAll'),
                    title: t('action.unstageAll'),
                    disabled: fileBusy,
                    onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
                      event.stopPropagation();
                      onToggleAll('staged');
                    },
                  },
                  h(Icon, { path: paths.minus, size: 14 }),
                ),
              ),
              !collapsed.staged
                ? filteredStaged.map((entry) =>
                    h(FileRow, {
                      key: `staged:${entry.path}`,
                      entry,
                      side: 'staged',
                      selected: selection?.side === 'staged' && selection.path === entry.path,
                      busy: fileBusy,
                      t,
                      onSelect: () =>
                        onSelect({ side: 'staged', path: entry.path, renamed: entry.kind === 'renamed' }),
                      onToggle: () => onToggleFile(entry, 'staged'),
                    }),
                  )
                : null,
            )
          : null,
        filteredUnstaged.length > 0
          ? h(
              React.Fragment,
              null,
              h(
                'div',
                {
                  className: 'gitp-section-head',
                  onClick: () => toggleSection('unstaged'),
                  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
                    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
                    event.preventDefault();
                    toggleSection('unstaged');
                  },
                  role: 'button',
                  'aria-expanded': !collapsed.unstaged,
                  tabIndex: 0,
                },
                h(Icon, {
                  path: paths.chevron,
                  size: 14,
                  className: cx('gitp-section-chev', collapsed.unstaged && 'is-collapsed'),
                }),
                h('span', { className: 'gitp-section-title' }, t('section.unstaged')),
                h('span', { className: 'gitp-section-count' }, String(filteredUnstaged.length)),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'gitp-section-action',
                    'aria-label': t('action.stageAll'),
                    title: t('action.stageAll'),
                    disabled: fileBusy,
                    onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
                      event.stopPropagation();
                      onToggleAll('unstaged');
                    },
                  },
                  h(Icon, { path: paths.plus, size: 14 }),
                ),
              ),
              !collapsed.unstaged
                ? filteredUnstaged.map((entry) =>
                    h(FileRow, {
                      key: `unstaged:${entry.path}`,
                      entry,
                      side: 'unstaged',
                      selected: selection?.side === 'unstaged' && selection.path === entry.path,
                      busy: fileBusy,
                      t,
                      onSelect: () =>
                        onSelect({ side: 'unstaged', path: entry.path, renamed: entry.kind === 'renamed' }),
                      onToggle: () => onToggleFile(entry, 'unstaged'),
                    }),
                  )
                : null,
            )
          : null,
        needle !== '' && totalMatching === 0
          ? h('div', { className: 'gitp-center', style: { padding: '24px' } }, t('filter.empty', { filter }))
          : null,
        totalRaw === 0
          ? h(Empty, {
              icon: h(Icon, { path: paths.check, size: 28 }),
              title: t('empty.noChanges'),
              hint: t('empty.noChangesHint'),
              action: h(
                'button',
                { type: 'button', className: 'gitp-btn is-small', onClick: onRefresh, disabled: busy },
                t('action.refresh'),
              ),
            })
          : null,
      ),
      h(
        'div',
        { className: 'gitp-commitbox' },
        h('textarea', {
          ref: messageRef,
          value: message,
          onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => onMessage(event.target.value),
          onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (event.defaultPrevented) return;
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
              event.preventDefault();
              if (canCommit && !commitBusy) onCommit();
            }
          },
          placeholder: t('commit.placeholder'),
          'aria-label': t('commit.placeholder'),
        }),
        h(
          'div',
          { className: cx('gitp-commit-status-line', conflicts.length > 0 && 'has-conflict') },
          conflicts.length > 0
            ? h('span', null, t('commit.hintConflict'))
            : staged.length > 0
              ? h(
                  React.Fragment,
                  null,
                  h('span', null, t('commit.stagedSummary', { count: staged.length }), ' ', h('span', { className: 'gitp-add' }, `+${stagedStats.add}`), ' ', h('span', { className: 'gitp-del' }, `−${stagedStats.del}`)),
                  h('span', null, t('commit.shortcut', { key: MOD_KEY })),
                )
              : h('span', null, t('commit.hintStage')),
        ),
        h(
          'div',
          { className: 'gitp-commit-actions' },
          canAmend
            ? h(
                'label',
                { className: 'gitp-amend' },
                h('input', {
                  type: 'checkbox',
                  checked: amend,
                  onChange: (event) => onAmend(event.target.checked),
                }),
                t('commit.amend'),
              )
            : null,
          h(
            'div',
            { className: 'gitp-ai-wrap' },
            h(
              'button',
              {
                type: 'button',
                className: 'gitp-btn is-small is-icon',
                'aria-label': t('ai.action'),
                'aria-haspopup': 'menu',
                'aria-expanded': aiMenuOpen === true,
                title: t('ai.action'),
                disabled: commitBusy || aiBusy || staged.length === 0,
                onClick: onAiToggle,
              },
              aiBusy ? h(Spinner) : h(Icon, { path: paths.sparkles, size: 13 }),
            ),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'gitp-btn is-small',
              onClick: onBranch,
              disabled: commitBusy || conflicts.length > 0 || staged.length === 0,
              'aria-label': t('action.branch'),
            },
            h(Icon, { path: paths.branch, size: 13 }),
            t('action.branch'),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'gitp-btn is-primary is-small',
              onClick: onCommit,
              disabled: !canCommit || commitBusy,
            },
            commitBusy ? h(Spinner) : null,
            commitBusy ? t('action.committing') : t('action.commit'),
          ),
        ),
        aiMenuOpen
          ? h(AiMenu, {
              t,
              busy: aiBusy,
              canUse: staged.length > 0,
              canBranch: staged.length > 0 && conflicts.length === 0,
              onWrite: onAiWrite,
              onBranch: onAiBranch,
              onClose: onAiClose,
            })
          : null,
      ),
    )
      : null,
    showList && showDiff
      ? h(ColumnResizer, {
          label: t('split.files'),
          containerRef: changesRef,
          columnRef: changesListRef,
          width: listWidth,
          onChange: setListWidth,
        })
      : null,
    showDiff
      ? h(
      'div',
      { className: 'gitp-diffcol' },
      selection
        ? h(DiffView, {
            t,
            diff,
            loading: diffLoading,
            layout,
            onLayout,
            onBlock,
            onResolve,
            busy: fileBusy,
            selectionKey,
            renamed: selection.renamed === true,
            compact,
            onBack,
            onOpen,
          })
        : h(Empty, {
            icon: h(Icon, { path: paths.file, size: 28 }),
            title: t('empty.selectFile'),
            hint: t('empty.selectFileHint'),
          }),
    )
      : null,
  );
}

interface DiffViewProps {
  t: Translator;
  diff: DiffPayload | null;
  loading: boolean;
  layout: string;
  onLayout: (next: string) => void;
  onBlock: (block: DiffBlock, side: string) => void;
  onResolve?: (side: 'ours' | 'theirs') => void;
  busy: boolean;
  selectionKey: string;
  renamed?: boolean;
  compact: boolean;
  onBack?: () => void;
  onOpen?: (diff: DiffPayload) => void;
}

function DiffView({
  t,
  diff,
  loading,
  layout,
  onLayout,
  onBlock,
  onResolve,
  busy,
  selectionKey,
  renamed = false,
  compact,
  onBack,
  onOpen,
}: DiffViewProps) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [changeNav, setChangeNav] = useState({ index: -1, canPrev: false, canNext: false });
  const blocks = useMemo(() => {
    if (diff === null) return [];
    return [...(diff.blocks ?? [])].sort((left, right) => left.row - right.row);
  }, [diff]);

  const scrollers = (): HTMLElement[] => {
    const root = bodyRef.current;
    if (root === null) return [];
    const panes = [...root.querySelectorAll<HTMLElement>('.gitp-pane')];
    if (panes.length > 0) return panes;
    const unified = root.querySelector<HTMLElement>('.gitp-unified');
    return unified === null ? [] : [unified];
  };

  const readNav = (top: number) => {
    let index = -1;
    for (let i = 0; i < blocks.length; i += 1) {
      const block = blocks[i];
      if (block !== undefined && block.row * ROW <= top + 40) index = i;
    }
    return {
      index,
      canPrev: index > 0,
      canNext: blocks.some((block) => block.row * ROW > top + 40),
    };
  };

  useEffect(() => {
    const root = bodyRef.current;
    if (root === null) return undefined;
    let frame = 0;
    const sync = () => {
      const first = scrollers()[0];
      setChangeNav(readNav(first === undefined ? 0 : first.scrollTop));
    };
    const onScroll = () => {
      if (frame !== 0) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        sync();
      });
    };
    root.addEventListener('scroll', onScroll, true);
    sync();
    return () => {
      root.removeEventListener('scroll', onScroll, true);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [diff, layout]);

  const jumpToChange = (direction: number) => {
    const first = scrollers()[0];
    const top = first === undefined ? 0 : first.scrollTop;
    let target: DiffBlock | null = null;
    if (direction > 0) {
      target = blocks.find((block) => block.row * ROW > top + 40) ?? null;
    } else {
      for (const block of blocks) if (block.row * ROW <= top + 40) target = block;
      target = target === null ? null : blocks[blocks.indexOf(target) - 1] ?? null;
    }
    if (target === null) return;
    const next = Math.max(0, target.row * ROW - 40);
    const elements = scrollers();
    for (const element of elements) element.scrollTop = next;
    const actual = elements[0] === undefined ? next : elements[0].scrollTop;
    setChangeNav(readNav(actual));
  };

  if (loading && diff === null) {
    return h(
      'div',
      { className: 'gitp-diff' },
      h(
        'div',
        { className: 'gitp-center' },
        h(Spinner),
        h('div', { className: 'gitp-center-hint' }, t('diff.loading')),
      ),
    );
  }
  if (diff === null) {
    return h(
      'div',
      { className: 'gitp-diff' },
      h(Empty, {
        icon: h(Icon, { path: paths.file, size: 28 }),
        title: t('empty.selectFile'),
        hint: t('empty.selectFileHint'),
      }),
    );
  }
  const path = splitPath(diff.path);
  const labels = {
    left:
      diff.labels.left === 'HEAD'
        ? t('diff.head')
        : diff.labels.left === 'Staged'
          ? t('diff.staged')
          : diff.labels.left === 'Local'
            ? t('diff.local')
            : diff.labels.left === 'Parent'
              ? t('diff.parent')
              : diff.labels.left,
    right:
      diff.labels.right === 'Staged'
        ? t('diff.staged')
        : diff.labels.right === 'Local'
          ? t('diff.local')
          : diff.labels.right === 'Commit'
            ? t('diff.commit')
            : diff.labels.right === 'Incoming'
              ? t('action.acceptTheirs')
              : diff.labels.right,
  };
  return h(
    'div',
    { className: 'gitp-diff', ref: bodyRef },
    h(
      'div',
      { className: 'gitp-diff-head' },
      compact && onBack
        ? h(IconButton, {
            label: t('action.back'),
            icon: paths.left,
            onClick: onBack,
          })
        : null,
      h(
        'div',
        { className: 'gitp-diff-title' },
        h(
          'span',
          { className: cx('gitp-status', statusClass(diff.conflict ? 'C' : 'M')) },
          diff.conflict ? 'C' : 'M',
        ),
        h(
          'div',
          { className: 'gitp-diff-path' },
          path.dir ? h('span', { className: 'gitp-diff-dir' }, path.dir) : null,
          h('span', { className: 'gitp-diff-base' }, path.base),
        ),
        diff.conflict
          ? h('span', { className: 'gitp-diff-pill is-conflict' }, t('section.conflicts'))
          : diff.side === 'staged'
            ? h('span', { className: 'gitp-diff-pill is-staged' }, t('diff.staged'))
            : diff.side === 'unstaged'
              ? h('span', { className: 'gitp-diff-pill is-unstaged' }, t('diff.unstaged'))
              : diff.side === 'log'
                ? h('span', { className: 'gitp-diff-pill is-commit' }, t('diff.commit'))
                : null,
      ),
      diff.conflict
        ? h('span', { className: 'gitp-diff-stats gitp-del' }, t('section.conflicts'))
        : diff.binary
          ? h('span', { className: 'gitp-diff-stats' }, t('diff.binary'))
          : h(
              'span',
              { className: 'gitp-diff-stats' },
              h('span', { className: 'gitp-add' }, `+${diff.add ?? 0}`),
              h('span', { className: 'gitp-del' }, `−${diff.del ?? 0}`),
            ),
      blocks.length > 0 && !diff.conflict && !diff.binary
        ? h(
            'div',
            { className: 'gitp-change-nav', role: 'group', 'aria-label': t('diff.changes') },
            h(IconButton, {
              label: t('action.prevChange'),
              icon: paths.chevronUp,
              onClick: () => jumpToChange(-1),
              disabled: !changeNav.canPrev,
            }),
            h('span', { className: 'gitp-change-count' }, `${Math.max(0, changeNav.index) + 1}/${blocks.length}`),
            h(IconButton, {
              label: t('action.nextChange'),
              icon: paths.chevron,
              onClick: () => jumpToChange(1),
              disabled: !changeNav.canNext,
            }),
          )
        : null,
      h(
        'div',
        { className: 'gitp-diff-actions' },
        onOpen !== undefined && !diff.binary
          ? h(IconButton, {
              label: t('action.openEditor'),
              icon: paths.code,
              onClick: () => onOpen(diff),
            })
          : null,
        diff.conflict
          ? null
          : h(
              'div',
              { className: 'gitp-seg', role: 'group', 'aria-label': t('diff.layout') },
              h(
                'button',
                {
                  type: 'button',
                  className: layout === 'split' ? 'is-active' : '',
                  'aria-pressed': layout === 'split',
                  'aria-label': t('diff.split'),
                  title: t('diff.split'),
                  onClick: () => onLayout('split'),
                },
                h(Icon, { path: paths.split, size: 13 }),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: layout === 'unified' ? 'is-active' : '',
                  'aria-pressed': layout === 'unified',
                  'aria-label': t('diff.unified'),
                  title: t('diff.unified'),
                  onClick: () => onLayout('unified'),
                },
                h(Icon, { path: paths.unified, size: 13 }),
              ),
            ),
      ),
    ),
    diff.conflict
      ? h(
          'div',
          { className: 'gitp-conflict-banner' },
          h(Icon, { path: paths.warning, size: 14 }),
          h('span', null, t('diff.conflictBanner')),
          h(
            'button',
            {
              type: 'button',
              className: 'gitp-btn is-small',
              onClick: () => onResolve?.('ours'),
              disabled: busy,
            },
            t('action.acceptOurs'),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'gitp-btn is-small',
              onClick: () => onResolve?.('theirs'),
              disabled: busy,
            },
            t('action.acceptTheirs'),
          ),
        )
      : null,
    diff.binary
      ? h(
          'div',
          { className: 'gitp-binary' },
          h('div', { className: 'gitp-binary-title' }, t('diff.binary')),
          h(
            'div',
            null,
            t('diff.binaryHint', {
              before: diff.leftSize ?? 0,
              after: diff.rightSize ?? 0,
            }),
          ),
        )
      : diff.conflict
        ? h(ConflictDiff, { diff })
        : layout === 'unified'
          ? h(UnifiedDiff, { t, diff, onBlock, busy, selectionKey, renamed })
          : h(SplitDiff, { t, diff, labels, onBlock, busy, selectionKey, renamed }),
    !diff.binary && !diff.conflict
      ? h(
          'div',
          { className: 'gitp-diff-foot' },
          h('span', { className: 'gitp-diff-legend' }, h('span', { className: 'gitp-diff-dot is-add' }), t('diff.added')),
          h('span', { className: 'gitp-diff-legend' }, h('span', { className: 'gitp-diff-dot is-del' }), t('diff.removed')),
          h('span', { className: 'gitp-diff-foot-spacer' }),
          h('span', null, blocks.length === 1 ? t('diff.blockCountOne') : t('diff.blockCount', { count: blocks.length })),
        )
      : null,
  );
}

function ConflictDiff({ diff }: { diff: DiffPayload }) {
  return h(
    'div',
    { className: 'gitp-unified' },
    diff.right.map((text, index) =>
      h(
        'div',
        {
          className: cx('gitp-urow', /^(<{7}|={7}|>{7})/.test(text) && 'is-conflict-marker'),
          key: index,
        },
        h('span', { className: 'gitp-uno' }, index + 1),
        h('span', { className: 'gitp-ucontent' }, text || '\u00a0'),
      ),
    ),
  );
}

interface BlockAction {
  action: string;
  icon: string;
  label: string;
  revert: boolean;
}

interface SplitDiffProps {
  t: Translator;
  diff: DiffPayload;
  labels: { left: string; right: string };
  onBlock: (block: DiffBlock, side: string) => void;
  busy: boolean;
  selectionKey: string;
  renamed: boolean;
}

function SplitDiff({ t, diff, labels, onBlock, busy, selectionKey, renamed }: SplitDiffProps) {
  const leftRef = useRef<HTMLDivElement | null>(null);
  const rightRef = useRef<HTMLDivElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);

  const moveGutter = (top: number): void => {
    if (gutterRef.current) gutterRef.current.style.transform = `translateY(${-top}px)`;
  };

  const onScroll = (source: HTMLDivElement): void => {
    const top = source.scrollTop;
    if (leftRef.current && leftRef.current !== source) leftRef.current.scrollTop = top;
    if (rightRef.current && rightRef.current !== source) rightRef.current.scrollTop = top;
    moveGutter(top);
  };

  useEffect(() => {
    const first = diff.blocks[0];
    if (!first || first.row <= 10) return;
    const top = Math.max(0, first.row * ROW - 80);
    if (leftRef.current) leftRef.current.scrollTop = top;
    if (rightRef.current) rightRef.current.scrollTop = top;
    moveGutter(top);
  }, [selectionKey]);

  const parts = useMemo(() => {
    const map = new Map<DiffRow, WordParts | null>();
    for (const row of diff.rows) {
      if (row.k !== 'mod') continue;
      if (row.l === null || row.r === null) continue;
      const left = diff.left[row.l - 1] ?? '';
      const right = diff.right[row.r - 1] ?? '';
      map.set(row, wordParts(left, right));
    }
    return map;
  }, [diff]);

  const blocksByRow = useMemo(() => {
    const map = new Map<number, DiffBlock>();
    for (const block of diff.blocks) map.set(block.row, block);
    return map;
  }, [diff]);

  const actions = (block: DiffBlock): BlockAction[] => {
    if (renamed) return [];
    const stage = { action: 'unstaged', icon: paths.left, label: t('action.stageBlock'), revert: false };
    const revert = { action: 'revert', icon: paths.right, label: t('action.revertBlock'), revert: true };
    if (diff.side === 'unstaged') return diff.leftMissing ? [stage] : [stage, revert];
    if (diff.side === 'staged') {
      return [{ action: 'staged', icon: paths.right, label: t('action.unstageBlock'), revert: false }];
    }
    return [];
  };

  return h(
    React.Fragment,
    null,
    h(
      'div',
      { className: 'gitp-pane-heads' },
      h('div', { className: 'gitp-pane-head' }, labels.left),
      h('div', { className: 'gitp-pane-head-gutter' }),
      h('div', { className: 'gitp-pane-head' }, labels.right),
    ),
    h(
      'div',
      { className: 'gitp-panes' },
      h(
        'div',
        {
          className: 'gitp-pane',
          ref: leftRef,
          tabIndex: 0,
          role: 'region',
          'aria-label': labels.left,
          onScroll: (event: React.UIEvent<HTMLDivElement>) => onScroll(event.currentTarget),
        },
        diff.rows.map((row, index) => {
          const text = row.l ? diff.left[row.l - 1] ?? '' : '';
          const kind = row.k === 'add' ? 'blank' : row.k === 'mod' ? 'del' : row.k;
          const part = parts.get(row);
          return h(
            'div',
            { className: cx('gitp-line', kind !== 'ctx' && `is-${kind}`), key: `l${index}` },
            h('span', { className: 'gitp-ln' }, row.l ?? ''),
            h(
              'span',
              { className: 'gitp-code' },
              row.l === null
                ? '\u00a0'
                : part
                  ? renderParts(part.lPre, part.lMid, part.lSuf)
                  : text || '\u00a0',
            ),
          );
        }),
      ),
      h(
        'div',
        { className: 'gitp-gutter', 'aria-hidden': false },
        h(
          'div',
          { className: 'gitp-gutter-inner', ref: gutterRef },
          diff.blocks.map((block) => {
            const list = actions(block);
            if (list.length === 0) return null;
            return h(
              'div',
              { className: 'gitp-arrows', key: block.id, style: { top: block.row * ROW } },
              list.map((item) =>
                h(
                  'button',
                  {
                    type: 'button',
                    className: cx('gitp-arrow', item.revert && 'is-revert'),
                    key: item.action,
                    'aria-label': item.label,
                    title: item.label,
                    disabled: busy,
                    onClick: () => onBlock(block, item.action),
                  },
                  h(Icon, { path: item.icon, size: 12 }),
                ),
              ),
            );
          }),
        ),
      ),
      h(
        'div',
        {
          className: 'gitp-pane',
          ref: rightRef,
          tabIndex: 0,
          role: 'region',
          'aria-label': labels.right,
          onScroll: (event: React.UIEvent<HTMLDivElement>) => onScroll(event.currentTarget),
        },
        diff.rows.map((row, index) => {
          const text = row.r ? diff.right[row.r - 1] ?? '' : '';
          const kind = row.k === 'del' ? 'blank' : row.k === 'mod' ? 'add' : row.k;
          const part = parts.get(row);
          return h(
            'div',
            { className: cx('gitp-line', kind !== 'ctx' && `is-${kind}`), key: `r${index}` },
            h('span', { className: 'gitp-ln' }, row.r ?? ''),
            h(
              'span',
              { className: 'gitp-code' },
              row.r === null
                ? '\u00a0'
                : part
                  ? renderParts(part.rPre, part.rMid, part.rSuf)
                  : text || '\u00a0',
            ),
          );
        }),
      ),
    ),
  );
}

interface UnifiedDiffProps {
  t: Translator;
  diff: DiffPayload;
  onBlock: (block: DiffBlock, side: string) => void;
  busy: boolean;
  selectionKey: string;
  renamed: boolean;
}

interface UnifiedLine {
  l: number | null;
  r: number | null;
  text: string;
  kind: string;
  block?: DiffBlock;
}

function UnifiedDiff({ t, diff, onBlock, busy, selectionKey, renamed }: UnifiedDiffProps) {
  const lines = useMemo(() => {
    const blockByRow = new Map<number, DiffBlock>();
    for (const block of diff.blocks) blockByRow.set(block.row, block);
    const result: UnifiedLine[] = [];
    diff.rows.forEach((row, index) => {
      const block = blockByRow.get(index);
      const leftText = row.l === null ? '' : (diff.left[row.l - 1] ?? '');
      const rightText = row.r === null ? '' : (diff.right[row.r - 1] ?? '');
      if (row.k === 'ctx') {
        result.push({ l: row.l, r: row.r, text: leftText, kind: 'ctx', block });
      } else if (row.k === 'mod') {
        result.push({ l: row.l, r: null, text: leftText, kind: 'del', block });
        result.push({ l: null, r: row.r, text: rightText, kind: 'add' });
      } else if (row.k === 'del') {
        result.push({ l: row.l, r: null, text: leftText, kind: 'del', block });
      } else {
        result.push({ l: null, r: row.r, text: rightText, kind: 'add', block });
      }
    });
    return result;
  }, [diff]);
  const scroller = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const first = lines.find((line) => line.block !== undefined);
    if (!first || lines.indexOf(first) <= 10 || scroller.current === null) return;
    scroller.current.scrollTop = Math.max(0, lines.indexOf(first) * ROW - 80);
  }, [selectionKey]);
  const actions = (block: DiffBlock): BlockAction[] => {
    if (renamed) return [];
    const stage = { action: 'unstaged', icon: paths.left, label: t('action.stageBlock'), revert: false };
    const revert = { action: 'revert', icon: paths.right, label: t('action.revertBlock'), revert: true };
    if (diff.side === 'unstaged') return diff.leftMissing ? [stage] : [stage, revert];
    if (diff.side === 'staged') {
      return [{ action: 'staged', icon: paths.right, label: t('action.unstageBlock'), revert: false }];
    }
    return [];
  };
  return h(
    'div',
    { className: 'gitp-unified', ref: scroller, tabIndex: 0, role: 'region', 'aria-label': t('diff.unified') },
    lines.map((line, index) => {
      const list = line.block ? actions(line.block) : [];
      return h(
        'div',
        { className: cx('gitp-urow', line.kind !== 'ctx' && `is-${line.kind}`), key: index },
        h(
          'span',
          { className: 'gitp-uarrows' },
          list.map((item) =>
            h(
              'button',
              {
                type: 'button',
                className: cx('gitp-arrow', item.revert && 'is-revert'),
                key: item.action,
                'aria-label': item.label,
                title: item.label,
                disabled: busy,
                onClick: () => {
                  if (line.block !== undefined) onBlock(line.block, item.action);
                },
              },
              h(Icon, { path: item.icon, size: 12 }),
            ),
          ),
        ),
        h('span', { className: 'gitp-uno' }, line.l ?? ''),
        h('span', { className: 'gitp-uno' }, line.r ?? ''),
        h('span', { className: 'gitp-ucontent' }, line.text || '\u00a0'),
      );
    }),
  );
}

interface AiMenuProps {
  t: Translator;
  busy: boolean;
  canUse: boolean;
  canBranch: boolean;
  onWrite: () => void;
  onBranch: () => void;
  onClose: () => void;
}

function AiMenu({ t, busy, canUse, canBranch, onWrite, onBranch, onClose }: AiMenuProps) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      closeRef.current();
    };
    const onDown = (event: MouseEvent): void => {
      const target = event.target;
      if (menuRef.current !== null && target instanceof Node && menuRef.current.contains(target)) return;
      if (target instanceof Element && target.closest('.gitp-ai-wrap') !== null) return;
      closeRef.current();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDown, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onDown, true);
    };
  }, []);
  const row = (
    key: string,
    icon: string,
    label: string,
    disabled: boolean,
    onClick: () => void,
  ): React.ReactNode =>
    h(
      'button',
      {
        type: 'button',
        key,
        className: 'gitp-popover-row',
        role: 'menuitem',
        disabled,
        onClick,
      },
      h(Icon, { path: icon, size: 13 }),
      h('span', { className: 'gitp-popover-row-text' }, label),
    );
  return h(
    'div',
    { className: 'gitp-popover is-menu', ref: menuRef, role: 'menu', 'aria-label': t('ai.action') },
    row('write', paths.sparkles, t('ai.write'), !canUse || busy, onWrite),
    row('branch', paths.branch, t('ai.branch'), !canBranch || busy, onBranch),
  );
}

interface HeaderProps {
  t: Translator;
  workspaceTitle?: string;
  branch: BranchState | null;
  repo: boolean;
  ahead: number;
  behind: number;
  upstream: string | null;
  onBranchMenu: () => void;
  onRepoMenu: () => void;
  repos: RepoInfo[];
  repoRoot: string | null;
  onSync: (kind: 'fetch' | 'pull' | 'push') => void;
  busy: boolean;
  onRefresh: () => void;
  syncing: string | null;
}

function Header({
  t,
  workspaceTitle,
  branch,
  repo,
  ahead,
  behind,
  upstream,
  onBranchMenu,
  onRepoMenu,
  repos,
  repoRoot,
  onSync,
  busy,
  onRefresh,
  syncing,
}: HeaderProps) {
  const branchName =
    branch?.name ?? (branch?.oid ? shortHash(branch.oid) : repo === false ? t('empty.noRepo') : t('status.detached'));
  const currentRepo = repos.find((item) => item.root === repoRoot) ?? null;
  const firstRepo = repos[0];
  const showRepoPicker =
    repos.length > 1 ||
    (firstRepo !== undefined && repos.length === 1 && firstRepo.name !== '.' && !firstRepo.name.startsWith('..'));
  const repoLabel =
    currentRepo === null
      ? t('repo.none')
      : currentRepo.name === '.'
        ? t('repo.workspace')
        : currentRepo.label ?? currentRepo.name;
  return h(
    'div',
    { className: 'gitp-head' },
    h(
      'div',
      { className: 'gitp-head-left' },
      h('span', { className: 'gitp-repo' }, workspaceTitle),
      showRepoPicker
        ? h(
            'button',
            {
              type: 'button',
              className: 'gitp-branch gitp-repo-pick',
              onClick: onRepoMenu,
              'aria-haspopup': 'listbox',
              'aria-label': t('repo.pick'),
              title: t('repo.pick'),
            },
            h(Icon, { path: paths.folder, size: 13 }),
            h('span', { className: 'gitp-branch-name' }, repoLabel),
            h('span', { className: 'gitp-chevron' }, h(Icon, { path: paths.chevron, size: 11 })),
          )
        : null,
      h(
        'button',
        {
          type: 'button',
          className: 'gitp-branch',
          onClick: onBranchMenu,
          disabled: repo === false,
          'aria-haspopup': 'listbox',
          'aria-label': t('branch.title'),
          title: t('branch.title'),
        },
        h(Icon, { path: paths.branch, size: 13 }),
        h('span', { className: 'gitp-branch-name' }, branchName),
        h('span', { className: 'gitp-chevron' }, h(Icon, { path: paths.chevron, size: 11 })),
      ),
    ),
    h(
      'div',
      { className: 'gitp-head-right' },
      h(SyncButton, {
        label: t('action.fetch'),
        icon: paths.fetch,
        count: 0,
        onClick: () => onSync('fetch'),
        busy: syncing === 'fetch',
        disabled: busy,
      }),
      h(SyncButton, {
        label: t('action.pull'),
        icon: paths.pull,
        count: behind,
        onClick: () => onSync('pull'),
        busy: syncing === 'pull',
        disabled: busy || upstream === null,
      }),
      h(SyncButton, {
        label: t('action.push'),
        icon: paths.push,
        count: ahead,
        onClick: () => onSync('push'),
        busy: syncing === 'push',
        disabled: busy,
      }),
      h(IconButton, {
        label: t('action.refresh'),
        icon: paths.refresh,
        onClick: onRefresh,
        disabled: busy,
      }),
    ),
  );
}

interface ModeRailProps {
  t: Translator;
  mode: string;
  onMode: (next: string) => void;
  counts: { changes: number };
}

function ModeRail({ t, mode, onMode, counts }: ModeRailProps) {
  const items = [
    { id: 'changes', label: t('mode.changes'), count: counts.changes },
    { id: 'log', label: t('mode.log'), count: 0 },
    { id: 'stash', label: t('mode.stash'), count: 0 },
  ];
  return h(
    'nav',
    { className: 'gitp-rail', 'aria-label': t('panel') },
    items.map((item) =>
      h(
        'button',
        {
          type: 'button',
          key: item.id,
          className: cx('gitp-rail-item', mode === item.id && 'is-active'),
          onClick: () => onMode(item.id),
          'aria-label': item.count > 0 ? `${item.label}, ${item.count}` : item.label,
          'aria-current': mode === item.id ? 'page' : undefined,
        },
        h('span', { className: 'gitp-rail-label' }, item.label),
        item.count > 0 ? h('span', { className: 'gitp-rail-count' }, String(item.count)) : null,
      ),
    ),
  );
}

interface RepoMenuProps {
  t: Translator;
  repos: RepoInfo[];
  current: string | null;
  onPick: (root: string) => void;
  onInitRoot: () => void;
  onClose: () => void;
}

function RepoMenu({ t, repos, current, onPick, onInitRoot, onClose }: RepoMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      closeRef.current();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);
  const canInit = !repos.some((item) => item.name === '.' || item.name.startsWith('..'));
  return h(
    'div',
    {
      className: 'gitp-popover-layer',
      onMouseDown: (event) => {
        if (event.target === event.currentTarget) closeRef.current();
      },
    },
    h(
      'div',
      { className: 'gitp-popover is-wide', ref: menuRef, role: 'listbox', 'aria-label': t('repo.title') },
      h('div', { className: 'gitp-popover-title' }, t('repo.title')),
      h(
        'div',
        { className: 'gitp-popover-list' },
        repos.map((item) =>
          h(
            'button',
            {
              type: 'button',
              key: item.root,
              className: 'gitp-popover-row',
              role: 'option',
              'aria-selected': item.root === current,
              disabled: item.root === current,
              onClick: () => onPick(item.root),
            },
            h(Icon, { path: paths.folder, size: 13 }),
            h('span', { className: 'gitp-popover-row-text' }, item.name === '.' ? t('repo.workspace') : item.label ?? item.name),
            item.root === current ? h(Icon, { path: paths.check, size: 13, className: 'gitp-checkmark' }) : null,
          ),
        ),
      ),
      canInit
        ? h(
            React.Fragment,
            null,
            h('div', { className: 'gitp-popover-sep' }),
            h(
              'button',
              { type: 'button', className: 'gitp-popover-row', onClick: onInitRoot },
              h(Icon, { path: paths.plus, size: 13 }),
              h('span', { className: 'gitp-popover-row-text' }, t('repo.initRoot')),
            ),
          )
        : null,
    ),
  );
}

interface BranchMenuProps {
  t: Translator;
  branches: BranchInfo[];
  loading: boolean;
  busy: boolean;
  onCheckout: (name: string, remote: boolean) => void;
  onNew: () => void;
  onClose: () => void;
}

function BranchMenu({ t, branches, loading, busy, onCheckout, onNew, onClose }: BranchMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [query, setQuery] = useState('');
  useEffect(() => {
    menuRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      closeRef.current();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);
  const needle = query.trim().toLowerCase();
  const local = branches.filter((item) => !item.remote);
  const localNames = new Set(local.map((item) => item.name));
  const remotes = branches.filter((item) => {
    if (!item.remote) return false;
    const short = item.name.split('/').slice(1).join('/');
    return short !== '' && !localNames.has(short);
  });
  const match = (item: BranchInfo): boolean => needle === '' || item.name.toLowerCase().includes(needle);
  const filteredLocal = local.filter(match);
  const filteredRemote = remotes.filter(match);
  const rows = (items: BranchInfo[], remote: boolean): React.ReactNode[] =>
    items.map((item) =>
      h(
        'button',
        {
          type: 'button',
          key: `${remote ? 'r' : 'l'}:${item.name}`,
          className: 'gitp-popover-row',
          role: 'option',
          'aria-selected': item.current === true,
          disabled: busy || item.current === true,
          onClick: () => onCheckout(item.name, remote),
        },
        h(Icon, { path: paths.branch, size: 13 }),
        h('span', { className: 'gitp-popover-row-text' }, item.name),
        item.current ? h(Icon, { path: paths.check, size: 13, className: 'gitp-checkmark' }) : null,
      ),
    );
  return h(
    'div',
    {
      className: 'gitp-popover-layer',
      onMouseDown: (event) => {
        if (event.target === event.currentTarget) closeRef.current();
      },
    },
    h(
      'div',
      { className: 'gitp-popover is-wide', ref: menuRef, role: 'listbox', 'aria-label': t('branch.local') },
      h('input', {
        className: 'gitp-search',
        value: query,
        placeholder: t('branch.search'),
        onChange: (event) => setQuery(event.target.value),
        'aria-label': t('branch.search'),
      }),
      h(
        'button',
        { type: 'button', className: 'gitp-popover-row', disabled: busy, onClick: onNew },
        h(Icon, { path: paths.plus, size: 13 }),
        h('span', { className: 'gitp-popover-row-text' }, t('branch.new')),
      ),
      h('div', { className: 'gitp-popover-sep' }),
      loading ? h('div', { className: 'gitp-modal-sub' }, t('branch.loading')) : null,
      !loading && filteredLocal.length === 0 && filteredRemote.length === 0
        ? h('div', { className: 'gitp-modal-sub' }, needle === '' ? t('branch.none') : t('branch.noneMatch'))
        : null,
      filteredLocal.length > 0
        ? h(
            React.Fragment,
            null,
            h('div', { className: 'gitp-popover-title' }, t('branch.local')),
            h('div', { className: 'gitp-popover-list' }, rows(filteredLocal, false)),
          )
        : null,
      filteredRemote.length > 0
        ? h(
            React.Fragment,
            null,
            h('div', { className: 'gitp-popover-title' }, t('branch.remote')),
            h('div', { className: 'gitp-popover-list' }, rows(filteredRemote, true)),
          )
        : null,
    ),
  );
}

interface NewBranchDialogProps {
  t: Translator;
  busy: boolean;
  error?: React.ReactNode;
  onCreate: (value: { name: string }) => void;
  onClose: () => void;
}

function NewBranchDialog({ t, busy, error, onCreate, onClose }: NewBranchDialogProps) {
  const [name, setName] = useState('');
  return h(
    Modal,
    { title: t('branch.newTitle'), onClose, closeLabel: t('action.close') },
    h(
      'div',
      { className: 'gitp-field' },
      h('label', { htmlFor: 'gitp-new-branch' }, t('branch.name')),
      h('input', {
        id: 'gitp-new-branch',
        value: name,
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => setName(event.target.value),
        spellCheck: false,
        autoComplete: 'off',
      }),
      h('div', { className: 'gitp-field-hint' }, t('branch.newHint')),
    ),
    error ? h('div', { className: 'gitp-modal-error' }, error) : null,
    h(
      'div',
      { className: 'gitp-modal-actions' },
      h('button', { type: 'button', className: 'gitp-btn', onClick: onClose, disabled: busy }, t('action.cancel')),
      h(
        'button',
        {
          type: 'button',
          className: 'gitp-btn is-primary',
          disabled: busy || name.trim() === '',
          onClick: () => onCreate({ name: name.trim() }),
        },
        busy ? h(Spinner) : null,
        t('action.createAndSwitch'),
      ),
    ),
  );
}

/** The commit fields a history row needs. */
type CommitRef = Pick<LogCommit, 'hash' | 'parents' | 'subject'>;

interface HistoryRow {
  id: string;
  label: string;
  icon?: string;
  hint?: string | null;
  reason: string | null;
  danger?: boolean;
}

function historyMenu(
  commit: CommitRef,
  snapshot: StatusSnapshot | null,
  ancestors: Set<string>,
  t: Translator,
): HistoryRow[] {
  const branch = snapshot?.branch ?? null;
  const operation =
    snapshot?.merging === true ||
    snapshot?.rebasing === true ||
    snapshot?.reverting === true ||
    snapshot?.cherryPicking === true;
  const conflicted = (snapshot?.conflicts?.length ?? 0) > 0;
  const staged = (snapshot?.entries ?? []).some((entry) => entry.staged);
  const detached = branch === null || branch.detached === true;
  const isHead = branch?.oid !== null && branch?.oid !== undefined && branch.oid === commit.hash;
  const pushed = typeof branch?.upstream === 'string' && branch.upstream !== '' && branch.ahead === 0;
  const merge = (commit.parents?.length ?? 0) > 1;
  const rows: HistoryRow[] = [];

  rows.push({ id: 'copy', label: t('history.copy'), icon: paths.copy, hint: null, reason: null });

  let reason: string | null = null;
  if (operation) reason = t('history.blockedOperation');
  else if (detached) reason = t('history.blockedDetached');
  else if (!isHead) reason = t('history.blockedNotHead');
  else if ((commit.parents?.length ?? 0) === 0) reason = t('history.blockedNoParent');
  else if (pushed) reason = t('history.blockedPushed');
  rows.push({
    id: 'undo',
    label: t('history.undo'),
    icon: paths.undo,
    hint: t('history.undoHint'),
    reason,
  });

  reason = null;
  if (operation) reason = t('history.blockedOperation');
  else if (merge) reason = t('history.blockedMerge');
  else if (conflicted) reason = t('history.blockedConflict');
  else if (staged) reason = t('history.blockedStaged');
  rows.push({
    id: 'revert',
    label: t('history.revert'),
    icon: paths.revert,
    hint: t('history.revertHint'),
    reason,
  });

  reason = null;
  if (operation) reason = t('history.blockedOperation');
  else if (merge) reason = t('history.blockedMerge');
  else if (conflicted) reason = t('history.blockedConflict');
  else if (ancestors.has(commit.hash)) reason = t('history.blockedContained');
  rows.push({
    id: 'cherry',
    label: t('history.cherryPick'),
    icon: paths.cherry,
    hint: t('history.cherryPickHint'),
    reason,
  });

  reason = null;
  if (operation) reason = t('history.blockedOperation');
  else if (detached) reason = t('history.blockedDetached');
  rows.push({
    id: 'reset',
    label: t('history.reset'),
    icon: paths.reset,
    hint: t('history.resetHint'),
    reason,
  });

  return rows;
}

interface CommitActionsMenuProps {
  t: Translator;
  commit: CommitRef;
  rows: HistoryRow[];
  busy: boolean;
  onPick: (id: string) => void;
  onClose: () => void;
}

function CommitActionsMenu({ t, commit, rows, busy, onPick, onClose }: CommitActionsMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef(onClose);
  const previous = useRef<HTMLElement | null>(null);
  closeRef.current = onClose;
  useEffect(() => {
    previous.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      closeRef.current();
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (previous.current && typeof previous.current.focus === 'function') previous.current.focus();
    };
  }, []);
  return h(
    'div',
    {
      className: 'gitp-popover-layer',
      onMouseDown: (event) => {
        if (event.target === event.currentTarget) closeRef.current();
      },
    },
    h(
      'div',
      {
        className: 'gitp-popover is-wide',
        ref: menuRef,
        role: 'menu',
        'aria-label': t('history.actions'),
      },
      h('div', { className: 'gitp-popover-title' }, t('history.actions')),
      h(
        'div',
        { className: 'gitp-popover-blurb', title: commit.subject },
        `${shortHash(commit.hash)} · ${commit.subject}`,
      ),
      h('div', { className: 'gitp-popover-sep' }),
      rows.map((row) =>
        h(
          'button',
          {
            type: 'button',
            key: row.id,
            className: 'gitp-action-row',
            role: 'menuitem',
            disabled: busy || row.reason !== null,
            title: row.reason ?? row.hint ?? undefined,
            onClick: () => onPick(row.id),
          },
          h(Icon, { path: row.icon ?? paths.more, size: 13 }),
          h(
            'span',
            { className: 'gitp-action-text' },
            h('span', { className: 'gitp-action-label' }, row.label),
            row.reason !== null || row.hint !== null
              ? h('span', { className: 'gitp-action-reason' }, row.reason ?? row.hint)
              : null,
          ),
        ),
      ),
    ),
  );
}

interface ResetDialogProps {
  t: Translator;
  commit: CommitRef;
  busy: boolean;
  error?: React.ReactNode;
  onReset: (mode: string) => void;
  onClose: () => void;
}

function ResetDialog({ t, commit, busy, error, onReset, onClose }: ResetDialogProps) {
  const [mode, setMode] = useState('soft');
  const modes: [string, string, string][] = [
    ['soft', 'history.resetModeSoft', 'history.resetModeSoftHint'],
    ['mixed', 'history.resetModeMixed', 'history.resetModeMixedHint'],
    ['hard', 'history.resetModeHard', 'history.resetModeHardHint'],
  ];
  return h(
    Modal,
    { title: t('history.resetTitle'), onClose, danger: mode === 'hard' },
    h('div', { className: 'gitp-modal-sub' }, t('history.resetBody', { hash: shortHash(commit.hash) })),
    h(
      'div',
      { role: 'radiogroup', 'aria-label': t('history.resetTitle') },
      modes.map(([value, title, hint]) =>
        h(
          'label',
          { key: value, className: 'gitp-reset-mode' },
          h('input', {
            type: 'radio',
            name: 'gitp-reset-mode',
            value,
            checked: mode === value,
            disabled: busy,
            onChange: () => setMode(value),
          }),
          h(
            'span',
            { className: 'gitp-reset-mode-text' },
            h('span', { className: 'gitp-reset-mode-title' }, t(title)),
            h('span', { className: 'gitp-reset-mode-hint' }, t(hint)),
          ),
        ),
      ),
    ),
    mode === 'hard'
      ? h('div', { className: 'gitp-modal-warn', role: 'alert' }, t('history.resetHardWarning'))
      : null,
    error !== null ? h('div', { className: 'gitp-modal-error' }, error) : null,
    h(
      'div',
      { className: 'gitp-modal-actions' },
      h('button', { type: 'button', className: 'gitp-btn', onClick: onClose, disabled: busy }, t('action.cancel')),
      h(
        'button',
        {
          type: 'button',
          className: cx('gitp-btn', mode === 'hard' ? 'is-danger' : 'is-primary'),
          onClick: () => onReset(mode),
          disabled: busy,
        },
        busy ? h(Spinner) : null,
        t('history.resetAction'),
      ),
    ),
  );
}

interface LogViewProps {
  call: Call;
  workspaceId: string;
  repo: string;
  t: Translator;
  refreshToken: number;
  compact: boolean;
  layout: string;
  onLayout: (next: string) => void;
  snapshot: StatusSnapshot | null;
  onApplied: (result: AppliedResult) => void;
}

function LogView({
  call,
  workspaceId,
  repo,
  t,
  refreshToken,
  compact,
  layout,
  onLayout,
  snapshot,
  onApplied,
}: LogViewProps) {
  const [commits, setCommits] = useState<LaneRow[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<CommitDetail | null>(null);
  const [file, setFile] = useState<string | null>(null);
  const [diff, setDiff] = useState<DiffPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [diffLoading, setDiffLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [copiedHash, setCopiedHash] = useState(false);
  const [listWidth, setListWidth] = useSplitWidth();
  const [menuCommit, setMenuCommit] = useState<CommitRef | null>(null);
  const [confirm, setConfirm] = useState<{ type: 'undo' | 'revert'; commit: CommitRef } | null>(null);
  const [resetCommit, setResetCommit] = useState<CommitRef | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const logListRef = useRef<HTMLDivElement | null>(null);
  const repoRef = useRef(repo);

  const copyHash = (hash: string): void => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(hash).catch(() => {});
      setCopiedHash(true);
      setTimeout(() => setCopiedHash(false), 2000);
    }
  };

  useEffect(() => {
    if (notice === null) return;
    const id = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(id);
  }, [notice]);

  useEffect(() => {
    setMenuCommit(null);
    setConfirm(null);
    setResetCommit(null);
    setResetError(null);
  }, [repo]);

  useEffect(() => {
    if (repoRef.current === repo) return;
    repoRef.current = repo;
    setSelected(null);
    setDetail(null);
    setFile(null);
    setDiff(null);
  }, [repo]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    call('log', { workspaceId, repo }, controller.signal)
      .then((result) => {
        if (!active) return;
        const rows = computeLanes(result.commits ?? []);
        setCommits(rows);
        const firstRow = rows[0];
        if (firstRow !== undefined) setSelected((current) => current ?? firstRow.hash);
      })
      .catch((event: unknown) => {
        const failure = failureOf(event);
        if (active && failure.name !== 'AbortError') setError(failure);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [workspaceId, repo, refreshToken]);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    let active = true;
    const controller = new AbortController();
    setDetailLoading(true);
    call('commitDetail', { workspaceId, repo, hash: selected }, controller.signal)
      .then((result) => {
        if (active) {
          setDetail(result);
          const firstFile = result.files[0];
          if (!compact && firstFile !== undefined) {
            setFile((current) =>
              current !== null && result.files.some((entry) => entry.path === current) ? current : firstFile.path,
            );
          } else if (compact) {
            setFile(null);
          }
          setDiff(null);
        }
      })
      .catch((event: unknown) => {
        const failure = failureOf(event);
        if (active && failure.name !== 'AbortError') setError(failure);
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [workspaceId, repo, selected, compact]);

  useEffect(() => {
    if (!file || !detail) {
      setDiff(null);
      return;
    }
    let active = true;
    const controller = new AbortController();
    setDiffLoading(true);
    call(
      'diff',
      {
        workspaceId,
        repo,
        path: file,
        side: 'log',
        commit: detail.hash,
        parent: detail.parents?.[0],
      },
      controller.signal,
    )
      .then((result) => {
        if (active) setDiff(result);
      })
      .catch((event: unknown) => {
        const failure = failureOf(event);
        if (active && failure.name !== 'AbortError') setError(failure);
      })
      .finally(() => {
        if (active) setDiffLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [workspaceId, repo, file, detail]);

  const ancestors = useMemo(() => {
    const parents = new Map<string, string[]>();
    for (const row of commits ?? []) parents.set(row.hash, row.parents);
    const seen = new Set<string>();
    const queue: string[] = [];
    const head = snapshot?.branch?.oid;
    if (typeof head === 'string' && head !== '') queue.push(head);
    while (queue.length > 0) {
      const hash = queue.pop();
      if (hash === undefined) break;
      if (seen.has(hash)) continue;
      seen.add(hash);
      for (const parent of parents.get(hash) ?? []) queue.push(parent);
    }
    return seen;
  }, [commits, snapshot?.branch?.oid]);

  const menuRows = menuCommit === null ? [] : historyMenu(menuCommit, snapshot, ancestors, t);

  async function performUndo(commit: CommitRef): Promise<void> {
    setActionBusy('undo');
    try {
      const result = await call('undoCommit', { workspaceId, repo, hash: commit.hash });
      setConfirm(null);
      onApplied({
        status: result.status,
        message: result.message,
        goToChanges: true,
        toast: t('history.undone'),
      });
    } catch (event) {
      setConfirm(null);
      setNotice({ text: errorMessage(event), error: true });
      onApplied({});
    } finally {
      setActionBusy(null);
    }
  }

  async function performRevert(commit: CommitRef): Promise<void> {
    setActionBusy('revert');
    try {
      const result = await call('revertCommit', { workspaceId, repo, hash: commit.hash });
      setConfirm(null);
      onApplied({
        status: result.status,
        message: result.message,
        goToChanges: true,
        toast: t(result.conflicted ? 'history.revertConflicts' : 'history.reverted'),
      });
    } catch (event) {
      setConfirm(null);
      setNotice({ text: errorMessage(event), error: true });
      onApplied({});
    } finally {
      setActionBusy(null);
    }
  }

  async function performCherry(commit: CommitRef): Promise<void> {
    setActionBusy('cherry');
    try {
      const result = await call('cherryPickCommit', { workspaceId, repo, hash: commit.hash });
      setNotice({ text: t('history.picked', { hash: shortHash(result.hash) }), error: false });
      onApplied({ status: result.status });
    } catch (event) {
      setNotice({ text: errorMessage(event), error: true });
      onApplied({});
    } finally {
      setActionBusy(null);
    }
  }

  async function performReset(commit: CommitRef, mode: string): Promise<void> {
    setActionBusy('reset');
    setResetError(null);
    try {
      const result = await call('resetToCommit', {
        workspaceId,
        repo,
        hash: commit.hash,
        mode,
        confirm: true,
      });
      setResetCommit(null);
      setNotice({ text: t('history.resetDone', { hash: shortHash(commit.hash) }), error: false });
      onApplied({ status: result.status });
    } catch (event) {
      setResetError(errorMessage(event));
    } finally {
      setActionBusy(null);
    }
  }

  function pickAction(id: string): void {
    const commit = menuCommit;
    if (commit === null) return;
    if (id === 'copy') {
      copyHash(commit.hash);
      setMenuCommit(null);
      setNotice({ text: t('action.copied'), error: false });
      return;
    }
    setMenuCommit(null);
    if (id === 'undo') setConfirm({ type: 'undo', commit });
    else if (id === 'revert') setConfirm({ type: 'revert', commit });
    else if (id === 'cherry') performCherry(commit);
    else if (id === 'reset') setResetCommit(commit);
  }

  if (loading && commits === null) {
    return h(Empty, { icon: h(Spinner), title: t('log.loading') });
  }
  if (commits === null && error !== null) {
    return h(Empty, {
      icon: h(Icon, { path: paths.warning, size: 28 }),
      title: t('error.title'),
      hint: errorMessage(error),
    });
  }
  if (commits !== null && commits.length === 0) {
    return h(Empty, {
      icon: h(Icon, { path: paths.history, size: 28 }),
      title: t('empty.noHistory'),
      hint: t('empty.noHistoryHint'),
    });
  }

  const showList = !compact || !file;
  const showDiff = !compact || Boolean(file);

  return h(
    'div',
    { className: 'gitp-changes', ref: logRef },
    showList
      ? h(
          'div',
          {
            className: 'gitp-listcol',
            ref: logListRef,
            style: compact ? undefined : { width: `${listWidth}px` },
          },
          h(
            'div',
            { className: 'gitp-loglist' },
            error ? h('div', { className: 'gitp-error' }, h('span', { className: 'gitp-error-text' }, errorMessage(error))) : null,
            (commits ?? []).map((commit) =>
              h(
                'button',
                {
                  type: 'button',
                  key: commit.hash,
                  className: cx('gitp-commitrow', selected === commit.hash && 'is-selected'),
                  onClick: () => setSelected(commit.hash),
                  onContextMenu: (event: React.MouseEvent<HTMLDivElement>) => {
                    event.preventDefault();
                    setSelected(commit.hash);
                    setMenuCommit(commit);
                  },
                  'aria-haspopup': 'menu',
                },
                h(
                  'span',
                  { className: 'gitp-graph', style: { width: Math.max(14, commit.laneCount * 10 + 8) } },
                  h('span', {
                    className: 'gitp-graph-line',
                    style: { left: 6 + commit.lane * 10 },
                  }),
                  h('span', {
                    className: cx('gitp-graph-dot', commit.lane % 4 ? `g${commit.lane % 4}` : ''),
                    style: { left: 6 + commit.lane * 10 },
                  }),
                ),
                h(
                  'span',
                  { className: 'gitp-commitmain' },
                  h('div', { className: 'gitp-commit-subject' }, commit.subject),
                  h(
                    'div',
                    { className: 'gitp-commit-meta' },
                    h('span', null, commit.author),
                    h('span', null, '·'),
                    h('span', null, relativeDate(commit.date)),
                  ),
                  commit.refs.length > 0
                    ? h(
                        'div',
                        { className: 'gitp-refs' },
                        commit.refs.map((ref) =>
                          h(
                            'span',
                            {
                              key: ref,
                              className: cx('gitp-ref', ref.startsWith('HEAD') && 'is-head'),
                            },
                            ref.replace(/^HEAD -> /, ''),
                          ),
                        ),
                      )
                    : null,
                ),
              ),
            ),
          ),
          h(
            'div',
            { className: 'gitp-logdetail-summary' },
            detailLoading && detail === null
              ? h('div', { className: 'gitp-center', style: { padding: '24px' } }, h(Spinner))
              : detail === null
                ? h(Empty, { title: t('log.select') })
                : h(
                    React.Fragment,
                    null,
                    h(
                      'div',
                      { className: 'gitp-detail-head' },
                      h(
                        'div',
                        { className: 'gitp-detail-title' },
                        h('div', { className: 'gitp-detail-subject' }, detail.subject),
                        h(IconButton, {
                          label: t('history.actions'),
                          icon: paths.more,
                          disabled: actionBusy !== null,
                          onClick: () =>
                            setMenuCommit({
                              hash: detail.hash,
                              parents: detail.parents ?? [],
                              subject: detail.subject,
                            }),
                        }),
                      ),
                      h(
                        'div',
                        { className: 'gitp-detail-meta' },
                        h(
                          'button',
                          {
                            type: 'button',
                            className: 'gitp-detail-hash-btn',
                            onClick: () => copyHash(detail.hash),
                            title: copiedHash ? t('action.copied') : t('action.copyHash'),
                          },
                          shortHash(detail.hash),
                          h(Icon, { path: copiedHash ? paths.check : paths.copy, size: 11 }),
                        ),
                        h('span', null, detail.author),
                        h('span', null, relativeDate(detail.date)),
                      ),
                    ),
                    detail.body ? h('div', { className: 'gitp-detail-body' }, detail.body) : null,
                    h(
                      'div',
                      { className: 'gitp-detail-section-head' },
                      h('span', null, t('log.files')),
                      h('span', { className: 'gitp-section-count' }, String(detail.files?.length ?? 0)),
                    ),
                    h(
                      'div',
                      { className: 'gitp-detail-files' },
                      !detail.files || detail.files.length === 0
                        ? h('div', { className: 'gitp-center-hint', style: { padding: '4px 8px' } }, t('log.noFiles'))
                        : detail.files.map((item) => {
                            const filePath = splitPath(item.path);
                            return h(
                              'button',
                              {
                                type: 'button',
                                key: item.path,
                                className: cx('gitp-detail-file', file === item.path && 'is-selected'),
                                onClick: () => setFile(item.path),
                              },
                              h('span', { className: cx('gitp-status', statusClass('M')) }, 'M'),
                              h(
                                'span',
                                { className: 'gitp-filename' },
                                filePath.dir ? h('span', { className: 'gitp-filedir' }, filePath.dir) : null,
                                filePath.base,
                              ),
                              item.binary
                                ? h('span', { className: 'gitp-delta' }, t('meta.binary'))
                                : h(
                                    'span',
                                    { className: 'gitp-delta' },
                                    item.add !== null && item.add > 0
                                      ? h('span', { className: 'gitp-add' }, `+${item.add}`)
                                      : null,
                                    item.del !== null && item.del > 0
                                      ? h('span', { className: 'gitp-del' }, `−${item.del}`)
                                      : null,
                                  ),
                            );
                          }),
                    ),
                  ),
          ),
        )
      : null,
    showList && showDiff
      ? h(ColumnResizer, {
          label: t('split.commits'),
          containerRef: logRef,
          columnRef: logListRef,
          width: listWidth,
          onChange: setListWidth,
        })
      : null,
    showDiff
      ? h(
          'div',
          { className: 'gitp-diffcol' },
          file
            ? h(DiffView, {
                t,
                diff,
                loading: diffLoading,
                layout,
                onLayout,
                onBlock: () => {},
                busy: true,
                selectionKey: `${detail?.hash ?? ''}:${file}`,
                compact,
                onBack: compact ? () => setFile(null) : undefined,
              })
            : h(Empty, {
                icon: h(Icon, { path: paths.changes, size: 28 }),
                title: t('empty.selectFile'),
                hint: t('empty.selectFileHint'),
              }),
        )
      : null,
    menuCommit
      ? h(CommitActionsMenu, {
          t,
          commit: menuCommit,
          rows: menuRows,
          busy: actionBusy !== null,
          onPick: pickAction,
          onClose: () => setMenuCommit(null),
        })
      : null,
    confirm
      ? h(ConfirmDialog, {
          title: t(confirm.type === 'undo' ? 'history.undoTitle' : 'history.revertTitle'),
          body: t(confirm.type === 'undo' ? 'history.undoBody' : 'history.revertBody'),
          confirmLabel: t(confirm.type === 'undo' ? 'history.undoAction' : 'history.revertAction'),
          cancelLabel: t('action.cancel'),
          busy: actionBusy !== null,
          onConfirm: () =>
            confirm.type === 'undo' ? performUndo(confirm.commit) : performRevert(confirm.commit),
          onClose: () => {
            if (actionBusy === null) setConfirm(null);
          },
        })
      : null,
    resetCommit
      ? h(ResetDialog, {
          t,
          commit: resetCommit,
          busy: actionBusy === 'reset',
          error: resetError,
          onReset: (mode) => performReset(resetCommit, mode),
          onClose: () => {
            if (actionBusy === null) {
              setResetCommit(null);
              setResetError(null);
            }
          },
        })
      : null,
    notice
      ? h(
          'div',
          {
            className: cx('gitp-toast', notice.error && 'is-error'),
            role: 'status',
            'aria-live': 'polite',
          },
          notice.text,
        )
      : null,
  );
}

interface StashViewProps {
  call: Call;
  workspaceId: string;
  repo: string;
  t: Translator;
  snapshot: StatusSnapshot | null;
  onStatus: (status: StatusSnapshot) => void;
  refreshToken: number;
}

function StashView({ call, workspaceId, repo, t, snapshot, onStatus, refreshToken }: StashViewProps) {
  const [stashes, setStashes] = useState<StashEntry[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const repoRef = useRef(repo);

  useEffect(() => {
    if (repoRef.current === repo) return;
    repoRef.current = repo;
    setStashes(null);
  }, [repo]);

  const load = useCallback(
    async (signal: AbortSignal) => {
      try {
        const result = await call('stashList', { workspaceId, repo }, signal);
        setStashes(result.stashes ?? []);
        setError(null);
      } catch (event: unknown) {
        const failure = failureOf(event);
        if (failure.name !== 'AbortError') setError(failure);
      }
    },
    [workspaceId, repo, call],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load, refreshToken]);

  useEffect(() => {
    if (toast === null) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const files = (snapshot?.entries ?? []).filter((entry) => entry.unstaged && !entry.conflicted);

  async function create({ paths, message }: { paths: string[]; message: string }): Promise<void> {
    setBusy('create');
    setDialogError(null);
    try {
      const result = await call('stashPush', {
        workspaceId,
        repo,
        paths,
        message,
        includeUntracked: paths.some((path: string) => files.find((file) => file.path === path)?.untracked === true),
      });
      onStatus(result.status);
      setStashes(result.stashes ?? []);
      setDialogOpen(false);
      setToast(t('stash.created', { count: paths.length }));
    } catch (event) {
      setDialogError(errorMessage(event));
    } finally {
      setBusy(null);
    }
  }

  async function act(kind: 'apply' | 'drop', ref: string, pop: boolean): Promise<void> {
    setBusy(kind + ref);
    setError(null);
    try {
      const result = await call(kind === 'drop' ? 'stashDrop' : 'stashApply', {
        workspaceId,
        repo,
        ref,
        pop,
      });
      onStatus(result.status);
      setStashes(result.stashes ?? []);
      if (kind === 'drop') setToast(t('stash.dropped', { ref }));
      else setToast(t(pop ? 'stash.popped' : 'stash.applied', { ref }));
      setDropTarget(null);
    } catch (event) {
      setError(failureOf(event));
    } finally {
      setBusy(null);
    }
  }

  return h(
    'div',
    { className: 'gitp-stash' },
    h(
      'div',
      { className: 'gitp-stash-head' },
      h(
        'div',
        { className: 'gitp-stash-title' },
        h('span', null, t('mode.stash')),
        stashes?.length ? h('span', { className: 'gitp-section-count' }, String(stashes.length)) : null,
      ),
      h(
        'button',
        {
          type: 'button',
          className: 'gitp-btn is-small is-primary',
          onClick: () => setDialogOpen(true),
          disabled: files.length === 0,
        },
        h(Icon, { path: paths.plus, size: 12 }),
        t('action.stash'),
      ),
    ),
    error ? h('div', { className: 'gitp-error' }, h('span', { className: 'gitp-error-text' }, errorMessage(error))) : null,
    stashes === null
      ? h('div', { className: 'gitp-center' }, h(Spinner))
      : stashes.length === 0
        ? h(Empty, {
            icon: h(Icon, { path: paths.stash, size: 28 }),
            title: t('empty.noStashes'),
            hint: t('empty.noStashesHint'),
            action:
              files.length > 0
                ? h(
                    'button',
                    {
                      type: 'button',
                      className: 'gitp-btn is-primary is-small',
                      onClick: () => setDialogOpen(true),
                    },
                    h(Icon, { path: paths.plus, size: 12 }),
                    t('action.stash'),
                  )
                : null,
          })
        : h(
            'div',
            { className: 'gitp-stashlist' },
            stashes.map((stash) =>
              h(
                'div',
                { className: 'gitp-stashrow', key: stash.ref },
                h(
                  'div',
                  { className: 'gitp-stash-main' },
                  h('div', { className: 'gitp-stash-msg' }, stash.message || 'WIP'),
                  h(
                    'div',
                    { className: 'gitp-stash-meta' },
                    h('span', { className: 'gitp-stash-ref' }, stash.ref),
                    h('span', null, '·'),
                    h('span', null, shortHash(stash.hash)),
                  ),
                ),
                h(
                  'div',
                  { className: 'gitp-stash-actions' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'gitp-btn is-small',
                      onClick: () => act('apply', stash.ref, false),
                      disabled: busy !== null,
                      title: t('stash.applyHint'),
                    },
                    busy === 'apply' + stash.ref ? h(Spinner) : null,
                    t('action.apply'),
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'gitp-btn is-small',
                      onClick: () => act('apply', stash.ref, true),
                      disabled: busy !== null,
                      title: t('stash.popHint'),
                    },
                    busy === 'apply' + stash.ref ? h(Spinner) : null,
                    t('action.pop'),
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'gitp-btn is-small gitp-stash-btn-danger',
                      'aria-label': t('action.drop'),
                      onClick: () => setDropTarget(stash.ref),
                      disabled: busy !== null,
                      title: t('stash.dropHint'),
                    },
                    t('action.drop'),
                  ),
                ),
              ),
            ),
          ),
    dialogOpen
      ? h(StashDialog, {
          t,
          files,
          busy: busy === 'create',
          error: dialogError,
          onCreate: create,
          onClose: () => {
            setDialogOpen(false);
            setDialogError(null);
          },
        })
      : null,
    dropTarget
      ? h(ConfirmDialog, {
          title: t('stash.dropTitle'),
          body: t('stash.dropBody', { ref: dropTarget }),
          confirmLabel: t('action.drop'),
          cancelLabel: t('action.cancel'),
          danger: true,
          busy: busy === 'drop' + dropTarget,
          onConfirm: () => act('drop', dropTarget, false),
          onClose: () => setDropTarget(null),
        })
      : null,
    toast ? h('div', { className: 'gitp-toast', role: 'status', 'aria-live': 'polite' }, toast) : null,
  );
}

interface GitPanelProps {
  call: Call;
  t: Translator;
  useWorkspaces: StoreHook<WorkspaceState>;
  useSessions: StoreHook<SessionState>;
  sessionId: string;
  useTabInfo: UseTabInfo;
  sidebarRight: SidebarRightService;
}

function GitPanel({ call, t, useWorkspaces, useSessions, sessionId, useTabInfo, sidebarRight }: GitPanelProps) {
  const { tab } = useTabInfo();
  const reportVisible = visibilityOf(sessionId).set;

  useEffect(() => {
    reportVisible(tab.visible === true);
  }, [reportVisible, tab.visible]);

  useEffect(
    () => () => {
      reportVisible(false);
    },
    [reportVisible],
  );

  // Global commands run outside React, so the tab body publishes the
  // actions it owns while it is mounted. Replaced on every render to see
  // current staged files and busy flags.
  useEffect(() => {
    panelBridge = {
      visible: tab.visible === true,
      canStageAll: () => unstaged.length > 0 && busy === null,
      stageAll: () => toggleAll('unstaged'),
      canCommit: () => canCommit && busy === null,
      commit: () => doCommit(),
      canWriteMessage: () => staged.length > 0 && busy === null && !aiBusy,
      writeMessage: () => aiWrite(),
    };
  });

  useEffect(
    () => () => {
      panelBridge = null;
    },
    [],
  );

  const workspaces = useWorkspaces((state) => state.items);
  const session = useSessions((state) => state.byId[sessionId]);
  const workspace =
    workspaces.find((item) => item.sessionIds?.includes(sessionId)) ??
    workspaces.find(
      (item) =>
        session?.cwd !== undefined &&
        (session.cwd === item.path || session.cwd.startsWith(`${item.path}/`)),
    ) ??
    null;
  const workspaceId = workspace === null ? '' : workspace.workspaceId;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [compact, setCompact] = useState(false);
  const [snapshot, setSnapshot] = useState<StatusSnapshot | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [mode, setMode] = useState('changes');
  const [message, setMessage] = useState('');
  const [amend, setAmend] = useState(false);
  const [selection, setSelection] = useState<FileSelection | null>(null);
  const [diff, setDiff] = useState<DiffPayload | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffNonce, setDiffNonce] = useState(0);
  const [layout, setLayout] = useState(() => (readStore(STORE_LAYOUT, 'split') === 'unified' ? 'unified' : 'split'));
  const [compactLayout, setCompactLayout] = useState(() =>
    readStore(STORE_LAYOUT_COMPACT, 'split') === 'unified' ? 'unified' : 'split',
  );
  const [branchOpen, setBranchOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [branchError, setBranchError] = useState<string | null>(null);
  const [branchMenu, setBranchMenu] = useState<{ branches: BranchInfo[]; loading: boolean } | null>(null);
  const [branchBusy, setBranchBusy] = useState(false);
  const [confirm, setConfirm] = useState<{
    title: string;
    body: string;
    confirmLabel: string;
    danger: boolean;
    run: () => void;
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [repoRoot, setRepoRoot] = useState<string | null>(null);
  const openInEditor = (current: DiffPayload): void => {
    if (repoRoot === null || sidebarRight === undefined) return;
    const line = openDiffLine(current);
    const address = fileAddressFor(
      sessionId,
      session === undefined ? undefined : session.cwd,
      `${repoRoot}/${current.path}`,
    );
    sidebarRight.openResource(address, { params: { line } });
  };
  const [repoNonce, setRepoNonce] = useState(0);
  const [repoMenu, setRepoMenu] = useState(false);
  const [newBranchOpen, setNewBranchOpen] = useState(false);
  const epoch = useRef(0);
  const failedRepo = useRef<string | null>(null);

  useEffect(() => {
    const node = rootRef.current;
    if (node === null || typeof ResizeObserver === 'undefined') return;
    let frame = 0;
    const observer = new ResizeObserver((entries) => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        const width = entries[0]?.contentRect.width ?? 0;
        setCompact(width > 0 && width < 900);
      });
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [workspace?.workspaceId]);

  const applyStatus = useCallback((next: StatusSnapshot | null) => {
    if (!next || !Array.isArray(next.entries)) return;
    epoch.current += 1;
    setSnapshot(next);
  }, []);

  const loadStatus = useCallback(
    async (signal: AbortSignal | undefined, quiet: boolean) => {
      if (!workspace || repoRoot === null) return;
      const current = ++epoch.current;
      if (!quiet) setStatusLoading(true);
      try {
        const next = await call(
          'status',
          { workspaceId: workspaceId, repo: repoRoot },
          signal,
        );
        if (current === epoch.current) {
          failedRepo.current = null;
          setSnapshot(next);
          if (Array.isArray(next.repos) && next.repos.length > 0) setRepos(next.repos);
          setError(null);
        }
      } catch (event) {
        const failure = failureOf(event);
        if (failure.name === 'AbortError' || current !== epoch.current) return;
        const code = codeOfFailure(event);
        if (code === 'git/not-repo' || code === 'git/repo-invalid') {
          if (failedRepo.current === repoRoot) {
            setError(failure);
            return;
          }
          failedRepo.current = repoRoot;
          writeStore(STORE_REPO + workspaceId, '');
          setRepoRoot(null);
          setSnapshot(null);
          setError(null);
          setRepoNonce((value) => value + 1);
          return;
        }
        setError(failure);
      } finally {
        if (current === epoch.current) setStatusLoading(false);
      }
    },
    [workspace?.workspaceId, repoRoot, call],
  );

  const onLogApplied = useCallback(
    (update: AppliedResult) => {
      if (update?.status) applyStatus(update.status);
      if (typeof update.message === 'string') {
        setMessage(update.message);
        setAmend(false);
      }
      if (update?.goToChanges) {
        setSelection(null);
        setDiff(null);
        setMode('changes');
      }
      if (update?.toast) setToast(update.toast);
      setRefreshToken((value) => value + 1);
      loadStatus(undefined, false);
    },
    [applyStatus, loadStatus],
  );

  const prevWsId = useRef<string | null>(null);
  useEffect(() => {
    if (!workspace?.workspaceId) return;
    const wsId = workspaceId;
    if (prevWsId.current !== wsId) {
      prevWsId.current = wsId;
      setRepos([]);
      setRepoRoot(null);
      setSnapshot(null);
    }
    const controller = new AbortController();
    (async () => {
      try {
        const next = await call('status', { workspaceId: wsId }, controller.signal);
        if (controller.signal.aborted) return;
        const list = Array.isArray(next.repos) ? next.repos : [];
        setRepos(list);
        const stored = readStore(STORE_REPO + wsId, '');
        const pick = list.find((item) => item.root === stored) ?? list[0] ?? null;
        if (pick) {
          setRepoRoot(pick.root);
          writeStore(STORE_REPO + wsId, pick.root);
        } else {
          setSnapshot(next);
        }
      } catch (event) {
        const failure = failureOf(event);
        if (failure.name !== 'AbortError') setError(failure);
      }
    })();
    return () => controller.abort();
  }, [workspace?.workspaceId, call, repoNonce]);

  useEffect(() => {
    if (repoRoot === null) return;
    const controller = new AbortController();
    loadStatus(controller.signal, false);
    return () => controller.abort();
  }, [repoRoot, loadStatus]);

  useEffect(() => {
    if (!workspace || repoRoot === null) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') loadStatus(undefined, true);
    }, 8000);
    return () => clearInterval(id);
  }, [workspace?.workspaceId, repoRoot, loadStatus]);

  useEffect(() => {
    const onFocus = () => loadStatus(undefined, true);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadStatus]);

  useEffect(() => {
    if (toast === null) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const conflicts = snapshot?.entries?.filter((entry) => entry.conflicted) ?? [];
  const staged = snapshot?.entries?.filter((entry) => entry.staged && !entry.conflicted) ?? [];
  const unstaged = snapshot?.entries?.filter((entry) => entry.unstaged && !entry.conflicted) ?? [];
  const canCommit =
    staged.length > 0 && conflicts.length === 0 && message.trim() !== '' && snapshot?.repo !== false;
  const selectionKey = selection ? `${selection.side}:${selection.path}:${selection.commit ?? ''}` : '';

  const selectionExists =
    selection === null
      ? true
      : selection.side === 'staged'
        ? snapshot?.entries?.some((entry) => entry.path === selection.path && entry.staged && !entry.conflicted)
        : selection.side === 'unstaged'
          ? snapshot?.entries?.some((entry) => entry.path === selection.path && entry.unstaged && !entry.conflicted)
          : selection.side === 'conflict'
            ? snapshot?.entries?.some((entry) => entry.path === selection.path && entry.conflicted)
            : true;

  useEffect(() => {
    if (snapshot !== null && selection !== null && !selectionExists) setSelection(null);
  }, [snapshot, selectionKey]);

  useEffect(() => {
    if (!workspace || selection === null) {
      setDiff(null);
      return;
    }
    const controller = new AbortController();
    setDiffLoading(true);
    call(
      'diff',
      { workspaceId: workspaceId, repo: repoRoot, path: selection.path, side: selection.side },
      controller.signal,
    )
      .then((result) => {
        if (!controller.signal.aborted) setDiff(result);
      })
      .catch((event: unknown) => {
        const failure = failureOf(event);
        if (!controller.signal.aborted && failure.name !== 'AbortError') setError(failure);
      })
      .finally(() => {
        if (!controller.signal.aborted) setDiffLoading(false);
      });
    return () => controller.abort();
  }, [workspace?.workspaceId, repoRoot, selectionKey, diffNonce, call]);

  function bumpDiff() {
    setDiffNonce((value) => value + 1);
  }

  function selectFile(next: FileSelection): void {
    if (selection !== null && selection.side === next.side && selection.path === next.path) return;
    setDiff(null);
    setSelection(next);
  }

  function entryPaths(entries: StatusEntry[]): string[] {
    const paths = new Set<string>();
    for (const entry of entries) {
      paths.add(entry.path);
      if (entry.from) paths.add(entry.from);
    }
    return [...paths];
  }

  async function toggleFile(entry: StatusEntry, side: string): Promise<void> {
    if (busy !== null) return;
    setBusy('file');
    setError(null);
    try {
      const result = await call(side === 'staged' ? 'unstage' : 'stage', {
        workspaceId: workspaceId,
        repo: repoRoot,
        paths: entryPaths([entry]),
      });
      applyStatus(result);
      if (selection?.path === entry.path && selection.side === side) setSelection(null);
      bumpDiff();
    } catch (event) {
      setError(failureOf(event));
    } finally {
      setBusy(null);
    }
  }

  async function toggleAll(side: string): Promise<void> {
    const entries = side === 'staged' ? staged : unstaged;
    if (busy !== null || entries.length === 0) return;
    setBusy('file');
    setError(null);
    try {
      const result = await call(side === 'staged' ? 'unstage' : 'stage', {
        workspaceId: workspaceId,
        repo: repoRoot,
        paths: entryPaths(entries),
      });
      applyStatus(result);
      bumpDiff();
    } catch (event) {
      setError(failureOf(event));
    } finally {
      setBusy(null);
    }
  }

  async function blockAction(block: DiffBlock, action: string): Promise<void> {
    if (busy !== null || diff === null) return;
    if (action === 'revert') {
      setConfirm({
        title: t('confirm.revertTitle'),
        body: t('confirm.revertBody'),
        confirmLabel: t('confirm.yesRevert'),
        danger: true,
        run: () => performBlock(block, 'revert'),
      });
      return;
    }
    await performBlock(block, action);
  }

  async function performBlock(block: DiffBlock, action: string): Promise<void> {
    if (diff === null) return;
    setBusy('block');
    setError(null);
    try {
      const result = await call('applyBlocks', {
        workspaceId: workspaceId,
        repo: repoRoot,
        path: diff.path,
        side: action,
        blocks: [block],
        baseHash: diff.baseHash,
        targetHash: diff.targetHash,
        confirm: true,
      });
      applyStatus(result);
      bumpDiff();
    } catch (event) {
      setError(failureOf(event));
      if (codeOfFailure(event) === 'git/stale') bumpDiff();
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  }

  async function resolve(side: 'ours' | 'theirs'): Promise<void> {
    if (!selection || busy !== null) return;
    setBusy('resolve');
    setError(null);
    try {
      const result = await call('resolve', {
        workspaceId: workspaceId,
        repo: repoRoot,
        path: selection.path,
        side,
      });
      applyStatus(result);
      setSelection(null);
      bumpDiff();
    } catch (event) {
      setError(failureOf(event));
    } finally {
      setBusy(null);
    }
  }

  async function doCommit() {
    if (!canCommit || busy !== null) return;
    setBusy('commit');
    setError(null);
    try {
      const result = await call('commit', {
        workspaceId: workspaceId,
        repo: repoRoot,
        message,
        amend,
      });
      applyStatus(result.status);
      setMessage('');
      setAmend(false);
      setToast(t('commit.done', { hash: shortHash(result.hash) }));
      bumpDiff();
    } catch (event) {
      setError(failureOf(event));
    } finally {
      setBusy(null);
    }
  }

  function openBranch() {
    if (staged.length === 0 || conflicts.length > 0) return;
    setBranchError(null);
    setBranchOpen(true);
  }

  async function requestAiMessage() {
    if (aiBusy || staged.length === 0) return null;
    setAiBusy(true);
    setError(null);
    try {
      const settings = prefs.hook.getSnapshot();
      const result = await call('aiMessage', {
        workspaceId: workspaceId,
        repo: repoRoot,
        ...(settings.model === null ? {} : { model: settings.model }),
        ...(settings.instruction.trim() === '' ? {} : { instruction: settings.instruction }),
      });
      if (result.model !== null && result.model !== '') {
        setToast(t('ai.written', { model: result.model }));
      }
      return result.message !== '' ? result.message : null;
    } catch (event) {
      setError(failureOf(event));
      return null;
    } finally {
      setAiBusy(false);
    }
  }

  async function aiWrite() {
    setAiOpen(false);
    const generated = await requestAiMessage();
    if (generated !== null) setMessage(generated);
  }

  async function aiBranchAndCommit() {
    setAiOpen(false);
    if (staged.length === 0 || conflicts.length > 0) return;
    const generated = await requestAiMessage();
    if (generated === null) return;
    setMessage(generated);
    setBranchError(null);
    setBranchOpen(true);
  }

  async function createBranch({ name, message: branchMessage }: { name: string; message: string }): Promise<void> {
    setBranchBusy(true);
    setBranchError(null);
    try {
      const result = await call('createBranchAndCommit', {
        workspaceId: workspaceId,
        repo: repoRoot,
        name,
        message: branchMessage,
      });
      applyStatus(result.status);
      setMessage('');
      setBranchOpen(false);
      setToast(t('branch.created', { branch: name }));
      bumpDiff();
    } catch (event) {
      setBranchError(errorMessage(event));
    } finally {
      setBranchBusy(false);
    }
  }

  async function sync(kind: 'fetch' | 'pull' | 'push'): Promise<void> {
    if (busy !== null) return;
    setBusy('sync');
    setSyncing(kind);
    setError(null);
    try {
      const result = await call(kind, { workspaceId: workspaceId, repo: repoRoot });
      applyStatus(result.status);
      setToast(t(kind === 'fetch' ? 'sync.fetched' : kind === 'pull' ? 'sync.pulled' : 'sync.pushed'));
    } catch (event) {
      setError(failureOf(event));
    } finally {
      setBusy(null);
      setSyncing(null);
    }
  }

  async function openBranchMenu() {
    if (snapshot?.repo === false) return;
    if (branchMenu !== null) {
      setBranchMenu(null);
      return;
    }
    setBranchMenu({ branches: [], loading: true });
    try {
      const result = await call('branches', { workspaceId: workspaceId, repo: repoRoot });
      setBranchMenu({ branches: result.branches ?? [], loading: false });
    } catch (event) {
      setBranchMenu(null);
      setError(failureOf(event));
    }
  }

  function requestCheckout(name: string, remote: boolean): void {
    setBranchMenu(null);
    if ((snapshot?.entries?.length ?? 0) > 0) {
      setConfirm({
        title: t('confirm.checkoutTitle'),
        body: t('confirm.checkoutBody'),
        confirmLabel: t('confirm.yesCheckout'),
        danger: false,
        run: () => checkout(name, remote),
      });
      return;
    }
    void checkout(name, remote);
  }

  async function checkout(name: string, remote: boolean): Promise<void> {
    setConfirm(null);
    setBranchBusy(true);
    setError(null);
    try {
      const result = await call('checkout', { workspaceId: workspaceId, repo: repoRoot, branch: name, remote: remote === true });
      applyStatus(result.status);
      setBranchMenu(null);
      setSelection(null);
      bumpDiff();
    } catch (event) {
      setBranchMenu(null);
      setError(failureOf(event));
    } finally {
      setBranchBusy(false);
    }
  }

  async function initRepo() {
    if (busy !== null) return;
    setBusy('init');
    setError(null);
    try {
      const result = await call('init', { workspaceId: workspaceId });
      if (Array.isArray(result.repos)) setRepos(result.repos);
      const root = result.selected ?? result.root ?? null;
      if (typeof root === 'string' && root !== '') {
        writeStore(STORE_REPO + workspaceId, root);
        setRepoRoot(root);
      }
      applyStatus(result);
    } catch (event) {
      setError(failureOf(event));
    } finally {
      setBusy(null);
    }
  }

  function selectRepo(next: string | null): void {
    setRepoMenu(false);
    if (next === repoRoot) return;
    writeStore(STORE_REPO + workspaceId, next ?? '');
    setRepoRoot(next);
    setSnapshot(null);
    setSelection(null);
    setDiff(null);
    setBranchMenu(null);
  }

  function askInitAtRoot() {
    setRepoMenu(false);
    setConfirm({
      title: t('repo.initRootTitle'),
      body: t('repo.initRootBody', { count: repos.length }),
      confirmLabel: t('repo.initRootConfirm'),
      danger: true,
      run: () => {
        setConfirm(null);
        void initRepo();
      },
    });
  }

  async function createNewBranch({ name }: { name: string }): Promise<void> {
    if (repoRoot === null) return;
    setBranchBusy(true);
    setBranchError(null);
    try {
      const result = await call('createBranch', {
        workspaceId: workspaceId,
        repo: repoRoot,
        name,
      });
      applyStatus(result.status);
      setNewBranchOpen(false);
      setToast(t('branch.createdOnly', { branch: name }));
      bumpDiff();
    } catch (event) {
      setBranchError(errorMessage(event));
    } finally {
      setBranchBusy(false);
    }
  }

  const effectiveLayout = compact ? compactLayout : layout;

  function changeLayout(next: string): void {
    if (compact) {
      setCompactLayout(next);
      writeStore(STORE_LAYOUT_COMPACT, next);
    } else {
      setLayout(next);
      writeStore(STORE_LAYOUT, next);
    }
  }

  if (workspace === null) {
    return h('div', { className: 'gitp-root' }, h(Empty, {
      icon: h(Icon, { path: paths.branch, size: 28 }),
      title: t('empty.noWorkspace'),
      hint: t('empty.noWorkspaceHint'),
    }));
  }

  const branch = snapshot?.branch ?? null;
  const ahead = branch?.ahead ?? 0;
  const behind = branch?.behind ?? 0;
  const statusError = error;
  const firstStaged = staged[0]?.path;
  const branchDefault = defaultBranchName(message, firstStaged);
  const branchMessageDefault = message;

  return h(
    'div',
    { className: cx('gitp-root', compact && 'is-compact'), ref: rootRef },
    h(Header, {
      t,
      workspaceTitle: workspace.title,
      branch,
      repo: snapshot?.repo !== false,
      ahead,
      behind,
      upstream: branch?.upstream ?? null,
      onBranchMenu: openBranchMenu,
      onRepoMenu: () => setRepoMenu(true),
      repos,
      repoRoot,
      onSync: sync,
      busy: busy !== null,
      onRefresh: () => {
        loadStatus(undefined, false);
        if (selection) bumpDiff();
        setRefreshToken((value) => value + 1);
      },
      syncing,
    }),
    statusError
      ? h(
          'div',
          { className: 'gitp-error', role: 'alert' },
          h(Icon, { path: paths.warning, size: 14 }),
          h('span', { className: 'gitp-error-text' }, errorMessage(statusError)),
          h(IconButton, {
            label: t('action.close'),
            icon: paths.close,
            onClick: () => setError(null),
          }),
        )
      : null,
    h(
      'div',
      { className: 'gitp-body' },
      h(ModeRail, {
        t,
        mode,
        onMode: setMode,
        counts: { changes: (snapshot?.entries?.length ?? 0) },
      }),
      h(
        'div',
        { className: 'gitp-content' },
        snapshot === null
          ? h(Empty, {
              icon: h(Spinner),
              title: t('status.loading'),
            })
          : snapshot.repo === false
            ? h(Empty, {
                icon: h(Icon, { path: paths.branch, size: 28 }),
                title: t('empty.noRepo'),
                hint: t('empty.noRepoHint'),
                action: h(
                  'button',
                  {
                    type: 'button',
                    className: 'gitp-btn is-primary',
                    onClick: initRepo,
                    disabled: busy !== null,
                  },
                  busy === 'init' ? h(Spinner) : null,
                  t('empty.init'),
                ),
              })
            : mode === 'log'
              ? h(LogView, {
                  call,
                  workspaceId: workspaceId,
                  repo: repoRoot ?? '',
                  t,
                  refreshToken,
                  compact,
                  layout: effectiveLayout,
                  onLayout: changeLayout,
                  snapshot,
                  onApplied: onLogApplied,
                })
              : mode === 'stash'
                ? h(StashView, {
                    call,
                    workspaceId: workspaceId,
                    repo: repoRoot ?? '',
                    t,
                    snapshot,
                    onStatus: applyStatus,
                    refreshToken,
                  })
                : h(ChangesView, {
                    t,
                    snapshot,
                    conflicts,
                    staged,
                    unstaged,
                    selection,
                    onSelect: selectFile,
                    busy: busy !== null,
                    fileBusy: busy !== null,
                    onToggleFile: toggleFile,
                    onToggleAll: toggleAll,
                    diff,
                    diffLoading,
                    layout: effectiveLayout,
                    onLayout: changeLayout,
                    onRefresh: () => {
                      bumpDiff();
                      loadStatus(undefined, false);
                    },
                    onBlock: blockAction,
                    onResolve: resolve,
                    onOpen: openInEditor,
                    message,
                    onMessage: setMessage,
                    onCommit: doCommit,
                    onBranch: openBranch,
                    canCommit,
                    commitBusy: busy === 'commit',
                    aiBusy,
                    aiMenuOpen: aiOpen,
                    onAiToggle: () => setAiOpen((value) => !value),
                    onAiClose: () => setAiOpen(false),
                    onAiWrite: aiWrite,
                    onAiBranch: aiBranchAndCommit,
                    selectionKey,
                    amend,
                    onAmend: setAmend,
                    canAmend: snapshot.branch?.initial !== true,
                    compact,
                    onBack: () => setSelection(null),
                  }),
      ),
    ),
    branchMenu
      ? h(BranchMenu, {
          t,
          branches: branchMenu.branches,
          loading: branchMenu.loading === true,
          busy: branchBusy,
          onCheckout: requestCheckout,
          onNew: () => {
            setBranchMenu(null);
            setBranchError(null);
            setNewBranchOpen(true);
          },
          onClose: () => setBranchMenu(null),
        })
      : null,
    repoMenu
      ? h(RepoMenu, {
          t,
          repos,
          current: repoRoot,
          onPick: selectRepo,
          onInitRoot: askInitAtRoot,
          onClose: () => setRepoMenu(false),
        })
      : null,
    newBranchOpen
      ? h(NewBranchDialog, {
          t,
          busy: branchBusy,
          error: branchError,
          onCreate: createNewBranch,
          onClose: () => {
            setNewBranchOpen(false);
            setBranchError(null);
          },
        })
      : null,
    branchOpen
      ? h(BranchDialog, {
          t,
          defaultName: branchDefault,
          defaultMessage: branchMessageDefault,
          busy: branchBusy,
          error: branchError,
          onCreate: createBranch,
          onClose: () => {
            setBranchOpen(false);
            setBranchError(null);
          },
        })
      : null,
    confirm
      ? h(ConfirmDialog, {
          title: confirm.title,
          body: confirm.body,
          confirmLabel: confirm.confirmLabel,
          cancelLabel: t('action.cancel'),
          danger: confirm.danger,
          busy: busy === 'block' || branchBusy,
          onConfirm: () => confirm.run(),
          onClose: () => setConfirm(null),
        })
      : null,
    toast ? h('div', { className: 'gitp-toast', role: 'status', 'aria-live': 'polite' }, toast) : null,
  );
}

function GitTabTitle({ t }: { t: Translator }) {
  return h(
    React.Fragment,
    null,
    h(GitMark, { size: 14 }),
    h('span', { className: 'gitp-tab-title' }, t('panel')),
  );
}

interface GitHeaderButtonProps {
  sessionId: string;
  sidebarRight: SidebarRightService;
  useVisible: <R>(selector: (value: boolean) => R) => R;
  t: Translator;
}

function GitHeaderButton({ sessionId, sidebarRight, useVisible, t }: GitHeaderButtonProps) {
  const visible = useVisible((current: boolean) => current === true);
  const label = t('header.label');

  return h(
    'button',
    {
      type: 'button',
      className: cx('gitp-iconbtn', 'gitp-header-btn', visible && 'is-active'),
      'aria-label': label,
      'aria-pressed': visible,
      title: label,
      onClick() {
        if (!visible) {
          sidebarRight.openTab('git');
          return;
        }
        const record = sidebarRight.tabsIn(sessionId).find((tab) => tab.kind === 'git');
        if (record !== undefined) sidebarRight.hide(record.id);
      },
    },
    h(GitMark, { size: 16 }),
  );
}

// Drag, arrow keys, or double-click move the list column. The hairline and
// the 8px grab area follow the harness dockkit divider. A drag writes the
// width straight to the column so a large diff does not re-render on every
// pointer move; the store learns the result once, on release.
interface ColumnResizerProps {
  label: string;
  containerRef: React.RefObject<HTMLElement | null>;
  columnRef: React.RefObject<HTMLElement | null>;
  width: number;
  onChange: (next: number) => void;
}

function ColumnResizer({ label, containerRef, columnRef, width, onChange }: ColumnResizerProps) {
  const drag = useRef<{ x: number; width: number; next: number } | null>(null);

  const maxWidth = () => {
    const container = containerRef.current;
    if (container === null) return width;
    return Math.max(SPLIT_MIN, Math.round(container.getBoundingClientRect().width) - SPLIT_DIFF_MIN);
  };

  const clamp = (next: number): number => Math.min(Math.max(Math.round(next), SPLIT_MIN), maxWidth());

  useEffect(
    () => () => {
      drag.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    },
    [],
  );

  // A narrower panel caps the rendered column through CSS; this keeps the
  // stored value in step so the next drag starts from the divider the user
  // actually sees.
  useEffect(() => {
    const container = containerRef.current;
    if (container === null || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      const available = Math.round(container.getBoundingClientRect().width);
      if (available === 0) return;
      const maximum = Math.max(SPLIT_MIN, available - SPLIT_DIFF_MIN);
      if (width > maximum) onChange(maximum);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, width, onChange]);

  return h('div', {
    className: 'gitp-resizer',
    role: 'separator',
    'aria-orientation': 'vertical',
    'aria-label': label,
    'aria-valuemin': SPLIT_MIN,
    'aria-valuemax': maxWidth(),
    'aria-valuenow': width,
    tabIndex: 0,
    onPointerDown(event) {
      if (event.button !== 0) return;
      drag.current = { x: event.clientX, width, next: width };
      event.currentTarget.setPointerCapture(event.pointerId);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      event.preventDefault();
    },
    onPointerMove(event) {
      const state = drag.current;
      if (state === null) return;
      const next = clamp(state.width + (event.clientX - state.x));
      if (next === state.next) return;
      state.next = next;
      if (columnRef.current !== null) columnRef.current.style.width = `${next}px`;
      event.currentTarget.setAttribute('aria-valuenow', String(next));
    },
    onPointerUp(event) {
      const state = drag.current;
      if (state === null) return;
      drag.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      onChange(state.next);
    },
    onPointerCancel() {
      drag.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    },
    onDoubleClick() {
      onChange(clamp(SPLIT_DEFAULT));
    },
    onKeyDown(event) {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const step = event.key === 'ArrowRight' ? SPLIT_STEP : -SPLIT_STEP;
        onChange(clamp(width + step));
        return;
      }
      if (event.key === 'Home') {
        event.preventDefault();
        onChange(clamp(SPLIT_DEFAULT));
      }
    },
  });
}

// The actions a mounted Git tab publishes to global commands. Null while
// no tab body is on screen.
interface PanelBridge {
  visible: boolean;
  canStageAll: () => boolean;
  stageAll: () => void;
  canCommit: () => boolean;
  commit: () => void;
  canWriteMessage: () => boolean;
  writeMessage: () => void;
}

let panelBridge: PanelBridge | null = null;

interface GitSettingsSectionProps {
  t: Translator;
  call: Call;
  usePrefs: <R>(selector: (value: Prefs) => R) => R;
  savePrefs: (prefs: Prefs) => void;
}

function GitSettingsSection({ t, call, usePrefs, savePrefs }: GitSettingsSectionProps) {
  const stored = usePrefs((value) => value);
  const [catalog, setCatalog] = useState<AiPreferences | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    call('preferences', {}, controller.signal).then(
      (value) => {
        if (live) setCatalog(value);
      },
      () => {
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
      controller.abort();
    };
  }, [call]);

  const groups = catalog?.groups ?? [];
  const storedModel = stored.model;
  const selected = storedModel === null ? '' : pairValue(storedModel);
  const listed =
    storedModel !== null &&
    groups.some(
      (group) =>
        group.id === storedModel.provider && group.models.some((model) => model.id === storedModel.model),
    );
  const instruction =
    stored.instruction === '' ? (catalog?.instruction ?? '') : stored.instruction;
  const loading = catalog === null && !failed;

  return h(
    'div',
    { className: 'gitp-settings' },
    h(
      'div',
      { className: 'gitp-settings-row' },
      h(
        'div',
        { className: 'gitp-settings-copy' },
        h('label', { className: 'gitp-settings-label', htmlFor: 'gitp-settings-model' }, t('settings.model')),
        h('p', { className: 'gitp-settings-hint' }, t('settings.modelHint')),
      ),
      h(
        'select',
        {
          id: 'gitp-settings-model',
          value: selected,
          disabled: loading,
          onChange: (event: React.ChangeEvent<HTMLSelectElement>) => {
            const value = event.target.value;
            if (value === '') {
              savePrefs({ ...stored, model: null });
              return;
            }
            const next = parsePair(value);
            if (next !== null) savePrefs({ ...stored, model: next });
          },
        },
        h('option', { value: '' }, t('settings.modelSame')),
        listed || stored.model === null
          ? null
          : h(
              'option',
              { value: selected },
              `${stored.model.provider} · ${stored.model.model}`,
            ),
        groups.map((group) =>
          h(
            'optgroup',
            { key: group.id, label: group.label },
            group.models.map((model) =>
              h(
                'option',
                { key: model.id, value: pairValue({ provider: group.id, model: model.id }) },
                model.name,
              ),
            ),
          ),
        ),
      ),
      failed ? h('p', { className: 'gitp-settings-error' }, t('settings.modelFailed')) : null,
      !failed && catalog !== null && groups.length === 0
        ? h('p', { className: 'gitp-settings-error' }, t('settings.modelEmpty'))
        : null,
    ),
    h(
      'div',
      { className: 'gitp-settings-row' },
      h(
        'div',
        { className: 'gitp-settings-copy' },
        h(
          'label',
          { className: 'gitp-settings-label', htmlFor: 'gitp-settings-instruction' },
          t('settings.instruction'),
        ),
        h('p', { className: 'gitp-settings-hint' }, t('settings.instructionHint')),
      ),
      h('textarea', {
        id: 'gitp-settings-instruction',
        value: instruction,
        spellCheck: false,
        disabled: loading,
        onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) =>
          savePrefs({ ...stored, instruction: event.target.value }),
      }),
      h(
        'div',
        { className: 'gitp-settings-actions' },
        h(
          'button',
          {
            type: 'button',
            className: 'gitp-btn is-small',
            disabled: stored.instruction === '',
            onClick: () => savePrefs({ ...stored, instruction: '' }),
          },
          t('settings.instructionReset'),
        ),
      ),
      failed ? h('p', { className: 'gitp-settings-error' }, t('settings.instructionFailed')) : null,
    ),
  );
}

function GitSettingsIcon() {
  return h(GitMark, { size: 16 });
}

/**
 * Commands for the native Keyboard shortcuts dialog. Every binding starts
 * unassigned: the catalog lists the action and the user records a key.
 */
function gitCommands(ctx: ClientContext, t: Translator): ShortcutCommand[] {
  type Resolution = { status: 'handled'; run: () => void } | { status: 'blocked'; reason: string };
  const blocked = (reason: string): Resolution => ({ status: 'blocked', reason });
  const regions = ['page', 'editable', 'terminal'];
  const panel = (name: (bridge: PanelBridge) => Resolution): Resolution => {
    const bridge = panelBridge;
    if (bridge === null || !bridge.visible) return blocked(t('command.openFirst'));
    return name(bridge);
  };
  return [
    {
      id: 'git.panel.toggle',
      label: () => t('command.toggle'),
      aliases: ['git', 'source control', 'toggle panel'],
      defaults: {},
      regions,
      modals: [],
      resolve: () => ({
        status: 'handled',
        run: () => {
          const active = ctx.sidebarRight.active();
          // A collapsed column still reports its active tab, so the
          // expanded state decides whether this press closes or opens.
          if (ctx.sidebarRight.isExpanded() && active !== undefined && active.kind === 'git') {
            ctx.sidebarRight.hide(active.id);
            return;
          }
          try {
            ctx.sidebarRight.openTab('git');
          } catch {
            // No Session surface to open into; the command stays silent.
          }
        },
      }),
    },
    {
      id: 'git.stageAll',
      label: () => t('command.stageAll'),
      aliases: ['git', 'stage'],
      defaults: {},
      regions,
      modals: [],
      resolve: () =>
        panel((bridge) =>
          bridge.canStageAll()
            ? { status: 'handled', run: () => bridge.stageAll() }
            : blocked(t('command.nothingToStage')),
        ),
    },
    {
      id: 'git.commit',
      label: () => t('command.commit'),
      aliases: ['git', 'commit'],
      defaults: {},
      regions,
      modals: [],
      resolve: () =>
        panel((bridge) =>
          bridge.canCommit()
            ? { status: 'handled', run: () => bridge.commit() }
            : blocked(t('command.notReady')),
        ),
    },
    {
      id: 'git.writeMessage',
      label: () => t('command.writeMessage'),
      aliases: ['git', 'commit message', 'ai'],
      defaults: {},
      regions,
      modals: [],
      resolve: () =>
        panel((bridge) =>
          bridge.canWriteMessage()
            ? { status: 'handled', run: () => bridge.writeMessage() }
            : blocked(t('command.notReady')),
        ),
    },
  ];
}

export const inject = ['connection', 'slots', 'locale', 'sidebarRightTabs', 'sidebarRight'];

/**
 * Register the Git panel, its tab type, header button, settings section, and
 * keyboard commands.
 * @param ctx the plugin context.
 */
export function apply(ctx: ClientContext): void {
    ctx.locale.register(NS, 'en', EN);
    ctx.locale.register(NS, 'zh', ZH);
    const t = ctx.locale.bind(NS);
    const call: Call = async (method, payload, signal) => {
      const result = await ctx.connection.rpc.call('/git-rpc', method, payload, signal);
      if (!result.ok) throw new GitCallError(result.error.code, result.error.message, result.error.details);
      return result.value as GitMethods[typeof method];
    };
    ctx.effect(
      () =>
        ctx.sidebarRightTabs.register({
          id: GIT_TAB_ID,
          kind: 'git',
          priority: 'extension',
          title: () => t('panel'),
          guide: [
            {
              id: 'git',
              order: 50,
              title: () => t('guide.title'),
              description: () => t('guide.description'),
              icon: () => h(GitIcon, null),
            },
          ],
        }),
      'dsh-git: right sidebar tab type',
    );
    ctx.slots.inject('conversation.session.header.utilities', () =>
      ctx.slots.register(
        {
          name: 'conversation.session.header.utilities',
          id: 'git-panel',
          order: -7,
          locale: NS,
          inject: (sessionId) => ({
            sessionId,
            sidebarRight: ctx.sidebarRight,
            hooks: { visible: visibilityOf(sessionId).hook },
          }),
        },
        GitHeaderButton,
      ),
    );
    ctx.slots.inject('settings.section', () =>
      ctx.slots.register(
        {
          name: 'settings.section',
          id: 'git',
          order: 25,
          label: () => t('settings.section'),
          locale: NS,
          inject: () => ({ t, call, savePrefs: prefs.set, hooks: { prefs: prefs.hook } }),
        },
        GitSettingsSection,
      ),
    );
    ctx.slots.inject('settings.section.icon', () =>
      ctx.slots.register({ name: 'settings.section.icon', id: 'git', order: 25 }, GitSettingsIcon),
    );
    ctx.inject(['shortcuts'], (scope) => {
      for (const command of gitCommands(ctx, t)) {
        scope.effect(() => scope.shortcuts.register(command), `dsh-git: ${command.id}`);
      }
    });
    ctx.slots.inject('sidebar.right.pane.tab', () =>
      ctx.slots.register(
        {
          name: 'sidebar.right.pane.tab',
          key: GIT_TAB_ID,
          locale: NS,
          inject: () => ({ call, t, sidebarRight: ctx.sidebarRight }),
        },
        GitPanel,
      ),
    );
    ctx.slots.inject('sidebar.right.pane.tab.title', () =>
      ctx.slots.register(
        {
          name: 'sidebar.right.pane.tab.title',
          key: GIT_TAB_ID,
          locale: NS,
          inject: () => ({ t }),
        },
        GitTabTitle,
      ),
    );
}
