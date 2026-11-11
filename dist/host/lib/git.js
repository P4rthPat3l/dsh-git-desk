import path from 'node:path';
import { createHash } from 'node:crypto';
import { GitError } from './exec.js';
import { buildRows, joinLines, parseHunks, parseLog, parseNumstat, parseStashes, parseStatus, splitLines, } from './parse.js';
const ZERO_CONTEXT = ['-U0', '--no-color', '--no-ext-diff'];
const MAX_TEXT_BYTES = 5 * 1024 * 1024;
/**
 * Hash one text so a diff can prove the file has not changed since.
 * @param text the text.
 * @returns the SHA-1 digest.
 */
function hashText(text) {
    return createHash('sha1').update(text).digest('hex');
}
/**
 * Build the failure for a command that did not succeed.
 * @param result the command result.
 * @param fallback the message to use when Git printed nothing.
 * @returns the error.
 */
function failure(result, fallback) {
    const message = result.stderr.trim() || result.stdout.trim() || fallback;
    return new GitError('git/command-failed', message);
}
/**
 * Validate one commit hash.
 * @param value the caller value.
 * @returns the trimmed hash.
 */
function commitHash(value) {
    const hash = typeof value === 'string' ? value.trim() : '';
    if (!/^[0-9a-f]{4,64}$/i.test(hash)) {
        throw new GitError('git/invalid-commit', 'A commit hash is required.');
    }
    return hash;
}
/**
 * Resolve one commit and its parents.
 * @param runtime the runtime helpers.
 * @param root the repository root.
 * @param value the caller hash.
 * @returns the full hash and its parents.
 */
async function resolveCommit(runtime, root, value) {
    const hash = commitHash(value);
    const resolved = await runtime.run(root, ['rev-parse', '--verify', `${hash}^{commit}`]);
    const full = resolved.stdout.trim();
    if (resolved.code !== 0 || full === '') {
        throw new GitError('git/invalid-commit', 'That commit no longer exists.');
    }
    const listed = await runtime.run(root, ['rev-list', '--parents', '-n', '1', full]);
    if (listed.code !== 0)
        throw failure(listed, 'Git could not read that commit.');
    const fields = listed.stdout.trim().split(' ').filter(Boolean);
    return { hash: full, parents: fields.slice(1) };
}
/**
 * Name the operation the repository is in the middle of.
 * @param snapshot the current status.
 * @returns the operation name, or null.
 */
function operationOf(snapshot) {
    if (snapshot.merging)
        return 'merge';
    if (snapshot.rebasing)
        return 'rebase';
    if (snapshot.reverting)
        return 'revert';
    if (snapshot.cherryPicking)
        return 'cherry-pick';
    return null;
}
/**
 * Refuse a history change while an operation is pending.
 * @param snapshot the current status.
 */
function refuseOperation(snapshot) {
    const operation = operationOf(snapshot);
    if (operation !== null) {
        throw new GitError('git/operation-in-progress', `Finish or abort the ${operation} before changing history.`);
    }
}
/**
 * Normalize one repository-relative path and prove it stays inside the root.
 * @param root the repository root.
 * @param value the caller path.
 * @returns the normalized and absolute paths.
 */
function repoPath(root, value) {
    if (typeof value !== 'string' || value === '') {
        throw new GitError('git/invalid-path', 'A file path is required.');
    }
    if (value.includes('\0'))
        throw new GitError('git/invalid-path', 'A file path contains an invalid character.');
    if (value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value)) {
        throw new GitError('git/invalid-path', 'Only repository-relative paths are accepted.');
    }
    const normalized = path.posix.normalize(value.replaceAll('\\', '/'));
    if (normalized === '.' || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
        throw new GitError('git/invalid-path', 'The file path escapes the repository.');
    }
    if (normalized.split('/').includes('.git')) {
        throw new GitError('git/invalid-path', 'Git metadata cannot be addressed as a file.');
    }
    const absolute = path.resolve(root, ...normalized.split('/'));
    if (absolute !== root && !absolute.startsWith(root + path.sep)) {
        throw new GitError('git/invalid-path', 'The file path escapes the repository.');
    }
    return { path: normalized, absolute };
}
/**
 * Validate one block range from the client.
 * @param block the caller block.
 * @returns the block range.
 */
function validateBlock(block) {
    const numeric = (value) => Number.isInteger(value) && Number(value) >= 0;
    if (block === null || typeof block !== 'object') {
        throw new GitError('git/invalid-block', 'A block range is invalid.');
    }
    const candidate = block;
    if (!numeric(candidate.leftStart) ||
        !numeric(candidate.leftEnd) ||
        !numeric(candidate.rightStart) ||
        !numeric(candidate.rightEnd)) {
        throw new GitError('git/invalid-block', 'A block range is invalid.');
    }
    const kind = candidate.kind;
    if (kind !== 'add' && kind !== 'del' && kind !== 'mod') {
        throw new GitError('git/invalid-block', 'A block kind is invalid.');
    }
    const row = candidate.row;
    return {
        leftStart: candidate.leftStart,
        leftEnd: candidate.leftEnd,
        rightStart: candidate.rightStart,
        rightEnd: candidate.rightEnd,
        kind,
        row: typeof row === 'number' ? row : 0,
    };
}
/**
 * Read one blob from the object database.
 * @param runtime the runtime helpers.
 * @param root the repository root.
 * @param spec the object spec.
 * @returns the blob as text.
 */
async function readBlob(runtime, root, spec) {
    const result = await runtime.run(root, ['show', spec]);
    if (result.code !== 0) {
        return { text: '', missing: true, binary: false, size: 0 };
    }
    return {
        text: result.stdout,
        missing: false,
        binary: result.stdout.includes('\0') || result.stdout.includes('\uFFFD'),
        size: Buffer.byteLength(result.stdout, 'utf8'),
    };
}
/**
 * Read one worktree file, refusing symlinks and oversized files.
 * @param runtime the runtime helpers.
 * @param root the repository root.
 * @param value the caller path.
 * @returns the file as text.
 */
async function readWorktree(runtime, root, value) {
    const target = repoPath(root, value);
    const link = await runtime.lstatPath(target.absolute);
    if (link !== null && link.isSymbolicLink()) {
        return { text: '', missing: false, binary: true, symlink: true, size: link.size };
    }
    if (link !== null && link.size > MAX_TEXT_BYTES) {
        return { text: '', missing: false, binary: true, symlink: false, size: link.size };
    }
    const read = await runtime.readText(target.absolute);
    if (read === null)
        return { text: '', missing: true, binary: false, size: 0 };
    return { text: read.text, missing: false, binary: read.binary, symlink: false, size: read.size };
}
/**
 * Read both files of one diff request.
 * @param runtime the runtime helpers.
 * @param root the repository root.
 * @param options the diff request.
 * @returns the pair and its path.
 */
async function readPair(runtime, root, options) {
    const value = repoPath(root, options.path);
    if (options.side === 'staged') {
        const left = await readBlob(runtime, root, `HEAD:${value.path}`);
        const right = await readBlob(runtime, root, `:${value.path}`);
        return { left, right, path: value.path };
    }
    if (options.side === 'unstaged') {
        const left = await readBlob(runtime, root, `:${value.path}`);
        const right = await readWorktree(runtime, root, value.path);
        return { left, right, path: value.path };
    }
    if (options.side === 'conflict') {
        const left = await readBlob(runtime, root, `:2:${value.path}`);
        const right = await readBlob(runtime, root, `:3:${value.path}`);
        const worktree = await readWorktree(runtime, root, value.path);
        return { left, right, worktree, path: value.path };
    }
    if (options.side === 'log') {
        const commit = typeof options.commit === 'string' ? options.commit.trim() : '';
        const parent = typeof options.parent === 'string' ? options.parent.trim() : '';
        if (!/^[0-9a-f]{4,64}$/i.test(commit)) {
            throw new GitError('git/invalid-commit', 'A commit hash is required.');
        }
        const left = parent !== '' && /^[0-9a-f]{4,64}$/i.test(parent)
            ? await readBlob(runtime, root, `${parent}:${value.path}`)
            : { text: '', missing: true, binary: false, size: 0 };
        const right = await readBlob(runtime, root, `${commit}:${value.path}`);
        return { left, right, path: value.path };
    }
    throw new GitError('git/invalid-side', 'Unknown diff side.');
}
/**
 * Read the zero-context patch for one file.
 * @param runtime the runtime helpers.
 * @param root the repository root.
 * @param options the diff request.
 * @param value the normalized path.
 * @returns the patch text.
 */
async function patchFor(runtime, root, options, value) {
    if (options.side === 'unstaged') {
        const result = await runtime.run(root, ['diff', ...ZERO_CONTEXT, '--', value]);
        return result.code === 0 ? result.stdout : '';
    }
    if (options.side === 'staged') {
        const result = await runtime.run(root, ['diff', '--cached', ...ZERO_CONTEXT, '--', value]);
        return result.code === 0 ? result.stdout : '';
    }
    if (options.side === 'log') {
        const commit = typeof options.commit === 'string' ? options.commit.trim() : '';
        const parent = typeof options.parent === 'string' ? options.parent.trim() : '';
        const args = parent !== '' && /^[0-9a-f]{4,64}$/i.test(parent)
            ? ['diff', ...ZERO_CONTEXT, parent, commit, '--', value]
            : ['show', '--format=', ...ZERO_CONTEXT, commit, '--', value];
        const result = await runtime.run(root, args);
        return result.code === 0 ? result.stdout : '';
    }
    return '';
}
/**
 * Read the full repository status.
 * @param runtime the runtime helpers.
 * @param root the repository root.
 * @returns the snapshot.
 */
async function readStatus(runtime, root) {
    const porcelain = await runtime.run(root, ['status', '--porcelain=v2', '--branch', '-z', '-uall']);
    if (porcelain.code !== 0)
        throw failure(porcelain, 'Git status failed.');
    const parsed = parseStatus(porcelain.stdout);
    const [unstagedResult, stagedResult] = await Promise.all([
        runtime.run(root, ['diff', '--numstat', '-z', '--no-renames']),
        runtime.run(root, ['diff', '--cached', '--numstat', '-z', '--no-renames']),
    ]);
    const unstaged = parseNumstat(unstagedResult.code === 0 ? unstagedResult.stdout : '');
    const staged = parseNumstat(stagedResult.code === 0 ? stagedResult.stdout : '');
    const entries = [];
    for (const entry of parsed.entries) {
        const work = unstaged.get(entry.path);
        const index = staged.get(entry.path);
        let add = work?.add ?? 0;
        let del = work?.del ?? 0;
        let binary = work?.binary === true || index?.binary === true;
        if (entry.untracked) {
            const read = await readWorktree(runtime, root, entry.path);
            binary = read.binary;
            if (!read.binary) {
                const lines = splitLines(read.text);
                add = lines.lines.length;
                del = 0;
            }
            else {
                add = null;
                del = null;
            }
        }
        entries.push({
            ...entry,
            add,
            del,
            stagedAdd: index?.add ?? 0,
            stagedDel: index?.del ?? 0,
            binary,
        });
    }
    const [mergeHead, rebaseHead, revertHead, cherryHead] = await Promise.all([
        runtime.run(root, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']),
        runtime.run(root, ['rev-parse', '-q', '--verify', 'REBASE_HEAD']),
        runtime.run(root, ['rev-parse', '-q', '--verify', 'REVERT_HEAD']),
        runtime.run(root, ['rev-parse', '-q', '--verify', 'CHERRY_PICK_HEAD']),
    ]);
    return {
        repo: true,
        root,
        branch: parsed.branch,
        entries,
        merging: mergeHead.code === 0,
        rebasing: rebaseHead.code === 0,
        reverting: revertHead.code === 0,
        cherryPicking: cherryHead.code === 0,
        conflicts: entries.filter((entry) => entry.conflicted).map((entry) => entry.path),
    };
}
/**
 * Find the repository that owns a directory.
 * @param runtime the runtime helpers.
 * @param directory the directory.
 * @returns the root, or null.
 */
export async function findRepository(runtime, directory) {
    const result = await runtime.run(directory, ['rev-parse', '--show-toplevel']);
    if (result.code !== 0)
        return null;
    const root = result.stdout.trim();
    return root === '' ? null : root;
}
/**
 * Initialize a repository in one directory.
 * @param runtime the runtime helpers.
 * @param directory the directory.
 * @returns the fresh snapshot.
 */
export async function initRepository(runtime, directory) {
    const result = await runtime.run(directory, ['init']);
    if (result.code !== 0)
        throw failure(result, 'Git could not initialize this directory.');
    const root = await findRepository(runtime, directory);
    if (root === null)
        throw new GitError('git/init-failed', 'Git initialized the directory but did not report a root.');
    return readStatus(runtime, root);
}
const REPO_SCAN_DEPTH = 2;
const REPO_SCAN_LIMIT = 40;
const REPO_SKIP = new Set(['node_modules', '.dsh']);
/**
 * Tell whether a directory is a repository root.
 * @param runtime the runtime helpers.
 * @param directory the directory.
 * @returns whether it holds a `.git` entry.
 */
async function isRepoRoot(runtime, directory) {
    return (await runtime.lstatPath(path.join(directory, '.git'))) !== null;
}
/**
 * List the repositories inside one workspace.
 * @param runtime the runtime helpers.
 * @param workspacePath the workspace root.
 * @returns the repositories, workspace first.
 */
export async function discoverRepositories(runtime, workspacePath) {
    const found = new Map();
    let workspace = workspacePath;
    try {
        workspace = await runtime.realpath(workspacePath);
    }
    catch {
        workspace = workspacePath;
    }
    const root = await findRepository(runtime, workspace);
    if (root !== null)
        found.set(root, root);
    async function scan(directory, depth) {
        if (found.size >= REPO_SCAN_LIMIT || depth > REPO_SCAN_DEPTH)
            return;
        const entries = await runtime.readdir(directory);
        for (const entry of entries) {
            if (found.size >= REPO_SCAN_LIMIT)
                return;
            if (!entry.isDirectory() || entry.isSymbolicLink())
                continue;
            if (entry.name.startsWith('.') || REPO_SKIP.has(entry.name))
                continue;
            const child = path.join(directory, entry.name);
            if (await isRepoRoot(runtime, child)) {
                found.set(child, child);
            }
            else if (depth < REPO_SCAN_DEPTH) {
                await scan(child, depth + 1);
            }
        }
    }
    await scan(workspace, 1);
    return [...found.values()]
        .map((repoRoot) => ({
        root: repoRoot,
        name: path.relative(workspace, repoRoot) || '.',
        label: path.basename(repoRoot),
    }))
        .sort((a, b) => (a.name === '.' ? -1 : b.name === '.' ? 1 : a.name.localeCompare(b.name)));
}
/**
 * Resolve a requested repository inside one workspace.
 * @param runtime the runtime helpers.
 * @param workspacePath the workspace root.
 * @param requested the requested root.
 * @returns the repository root.
 */
export async function resolveRepository(runtime, workspacePath, requested) {
    if (requested.trim() === '') {
        throw new GitError('git/no-repository', 'Choose a repository first.');
    }
    if (!path.isAbsolute(requested.trim())) {
        throw new GitError('git/repo-invalid', 'Choose the repository root.');
    }
    let workspace;
    try {
        workspace = await runtime.realpath(workspacePath);
    }
    catch {
        workspace = workspacePath;
    }
    let target;
    try {
        target = await runtime.realpath(requested.trim());
    }
    catch {
        throw new GitError('git/not-repo', 'That repository is no longer available.');
    }
    const root = await findRepository(runtime, target);
    if (root === null)
        throw new GitError('git/not-repo', 'That folder is not a Git repository.');
    if (root !== target)
        throw new GitError('git/repo-invalid', 'Choose the repository root.');
    const inside = target === workspace || target.startsWith(`${workspace}${path.sep}`);
    if (!inside) {
        const workspaceRepo = await findRepository(runtime, workspace);
        if (workspaceRepo !== target) {
            throw new GitError('git/repo-invalid', 'That repository is outside this workspace.');
        }
    }
    return root;
}
/**
 * Read the repository status.
 * @param runtime the runtime helpers.
 * @param root the repository root.
 * @returns the snapshot.
 */
export async function status(runtime, root) {
    return readStatus(runtime, root);
}
/**
 * Build one full-file diff.
 * @param runtime the runtime helpers.
 * @param root the repository root.
 * @param options the diff request.
 * @returns the diff payload.
 */
export async function diff(runtime, root, options) {
    const pair = await readPair(runtime, root, options);
    const labels = options.side === 'staged'
        ? { left: 'HEAD', right: 'Staged' }
        : options.side === 'unstaged'
            ? { left: 'Staged', right: 'Local' }
            : options.side === 'conflict'
                ? { left: 'HEAD', right: 'Incoming' }
                : { left: 'Parent', right: 'Commit' };
    if (options.side === 'conflict') {
        const worktree = pair.worktree ?? { text: '', missing: true, binary: false, size: 0 };
        const text = worktree.text;
        const lines = splitLines(text);
        return {
            path: pair.path,
            side: options.side,
            labels,
            binary: worktree.binary,
            conflict: true,
            left: [],
            right: lines.lines,
            leftTrailing: false,
            rightTrailing: lines.trailing,
            rows: lines.lines.map((_, index) => ({ l: null, r: index + 1, k: 'ctx' })),
            blocks: [],
            add: null,
            del: null,
            baseHash: null,
            targetHash: hashText(text),
            leftMissing: true,
            rightMissing: worktree.missing,
        };
    }
    if (pair.left.binary ||
        pair.right.binary ||
        pair.left.text.length > MAX_TEXT_BYTES ||
        pair.right.text.length > MAX_TEXT_BYTES) {
        return {
            path: pair.path,
            side: options.side,
            labels,
            binary: true,
            conflict: false,
            left: [],
            right: [],
            leftTrailing: false,
            rightTrailing: false,
            rows: [],
            blocks: [],
            add: null,
            del: null,
            baseHash: hashText(pair.left.text),
            targetHash: hashText(pair.right.text),
            leftMissing: pair.left.missing,
            rightMissing: pair.right.missing,
            leftSize: pair.left.size,
            rightSize: pair.right.size,
        };
    }
    const left = splitLines(pair.left.text);
    const right = splitLines(pair.right.text);
    let hunks = parseHunks(await patchFor(runtime, root, options, pair.path));
    if (hunks.length === 0 && pair.left.missing && !pair.right.missing) {
        hunks = [{ oldStart: 0, oldCount: 0, newStart: 1, newCount: right.lines.length }];
    }
    else if (hunks.length === 0 && !pair.left.missing && pair.right.missing) {
        hunks = [{ oldStart: 1, oldCount: left.lines.length, newStart: 0, newCount: 0 }];
    }
    const built = buildRows(left.lines, right.lines, hunks);
    const blocks = built.blocks.map((block) => ({
        ...block,
        id: `b${block.leftStart}-${block.leftEnd}-${block.rightStart}-${block.rightEnd}`,
    }));
    return {
        path: pair.path,
        side: options.side,
        labels,
        binary: false,
        conflict: false,
        left: left.lines,
        right: right.lines,
        leftTrailing: left.trailing,
        rightTrailing: right.trailing,
        rows: built.rows,
        blocks,
        add: built.add,
        del: built.del,
        baseHash: hashText(pair.left.text),
        targetHash: hashText(pair.right.text),
        leftMissing: pair.left.missing,
        rightMissing: pair.right.missing,
    };
}
/**
 * Write one new index entry from full file content.
 * @param runtime the runtime helpers.
 * @param root the repository root.
 * @param value the file path.
 * @param content the new content.
 */
async function writeIndex(runtime, root, value, content) {
    const target = repoPath(root, value);
    const blob = await runtime.run(root, ['hash-object', '-w', '--stdin'], { input: content });
    if (blob.code !== 0)
        throw failure(blob, 'Git could not write the new index entry.');
    const hash = blob.stdout.trim();
    const entry = await runtime.run(root, ['ls-files', '-s', '--', target.path]);
    const hasEntry = entry.code === 0 && entry.stdout.trim() !== '';
    let mode = hasEntry ? (entry.stdout.trim().split(' ')[0] ?? '100644') : '100644';
    if (!hasEntry) {
        const stat = await runtime.statPath(target.absolute);
        if (stat !== null && (stat.mode & 0o111) !== 0)
            mode = '100755';
    }
    const update = await runtime.run(root, ['update-index', '--add', '--cacheinfo', mode, hash, target.path]);
    if (update.code !== 0)
        throw failure(update, 'Git could not update the index.');
}
/**
 * Replace one 1-based line range with new lines.
 * @param lines the current lines.
 * @param start the first line to replace, 1-based.
 * @param end the last line to replace, 1-based.
 * @param replacement the new lines.
 * @returns the new lines.
 */
function replaceRange(lines, start, end, replacement) {
    const begin = Math.max(0, start - 1);
    const stop = Math.max(begin, end);
    return [...lines.slice(0, begin), ...replacement, ...lines.slice(stop)];
}
/**
 * Apply or revert selected change blocks.
 * @param runtime the runtime helpers.
 * @param root the repository root.
 * @param options the block request.
 * @returns the fresh snapshot.
 */
export async function applyBlocks(runtime, root, options) {
    const value = repoPath(root, options.path);
    if (!Array.isArray(options.blocks) || options.blocks.length === 0 || options.blocks.length > 200) {
        throw new GitError('git/invalid-block', 'Select at least one block.');
    }
    if (options.side !== 'unstaged' && options.side !== 'staged' && options.side !== 'revert') {
        throw new GitError('git/invalid-side', 'Unknown block action.');
    }
    if (options.side === 'revert' && options.confirm !== true) {
        throw new GitError('git/confirm-required', 'Reverting a block needs confirmation.');
    }
    const indexEntry = await runtime.run(root, ['ls-files', '-s', '--', value.path]);
    if (indexEntry.code === 0 && indexEntry.stdout.trim() !== '') {
        const mode = indexEntry.stdout.trim().split(' ')[0];
        if (mode === '120000' || mode === '160000') {
            throw new GitError('git/unsupported', 'Block actions are not available for a symlink or a submodule.');
        }
    }
    const pair = await readPair(runtime, root, {
        path: value.path,
        side: options.side === 'staged' ? 'staged' : 'unstaged',
    });
    if (pair.left.binary || pair.right.binary) {
        throw new GitError('git/binary', 'Blocks cannot be changed in a binary or non-UTF-8 file.');
    }
    if (options.side === 'revert' && pair.left.missing) {
        throw new GitError('git/unsupported', 'A file with no staged version cannot be reverted block by block.');
    }
    if (options.baseHash !== hashText(pair.left.text) || options.targetHash !== hashText(pair.right.text)) {
        throw new GitError('git/stale', 'The file changed after the diff was read. Refresh and try again.');
    }
    const snapshot = await readStatus(runtime, root);
    const current = snapshot.entries.find((entry) => entry.path === value.path);
    if (current?.kind === 'renamed') {
        throw new GitError('git/unsupported', 'Block actions are not available for a rename. Use the file buttons.');
    }
    const left = splitLines(pair.left.text);
    const right = splitLines(pair.right.text);
    const blocks = options.blocks.map(validateBlock);
    if (options.side === 'unstaged' || options.side === 'staged') {
        const source = options.side === 'staged' ? right.lines : left.lines;
        const trailing = options.side === 'staged'
            ? pair.right.missing
                ? left.trailing
                : right.trailing
            : options.side === 'unstaged' && pair.left.missing
                ? right.trailing
                : left.trailing;
        let next = [...source];
        const ordered = [...blocks].sort((a, b) => options.side === 'staged' ? b.rightStart - a.rightStart : b.leftStart - a.leftStart);
        for (const block of ordered) {
            const start = options.side === 'staged' ? block.rightStart : block.leftStart;
            const end = options.side === 'staged' ? block.rightEnd : block.leftEnd;
            const piece = options.side === 'staged'
                ? left.lines.slice(block.leftStart - 1, block.leftEnd)
                : right.lines.slice(block.rightStart - 1, block.rightEnd);
            next = replaceRange(next, start, end, piece);
        }
        const content = joinLines(next, trailing);
        if ((options.side === 'staged' && pair.left.missing && content === '') ||
            (options.side === 'unstaged' && pair.right.missing)) {
            const removed = await runtime.run(root, ['update-index', '--force-remove', '--', value.path]);
            if (removed.code !== 0)
                throw failure(removed, 'Git could not remove the file from the index.');
        }
        else {
            await writeIndex(runtime, root, value.path, content);
        }
        return readStatus(runtime, root);
    }
    const source = right.lines;
    let next = [...source];
    const ordered = [...blocks].sort((a, b) => b.rightStart - a.rightStart);
    for (const block of ordered) {
        const piece = left.lines.slice(block.leftStart - 1, block.leftEnd);
        next = replaceRange(next, block.rightStart, block.rightEnd, piece);
    }
    const content = joinLines(next, right.trailing);
    const target = repoPath(root, value.path);
    await runtime.writeText(target.absolute, content);
    return readStatus(runtime, root);
}
/**
 * Stage the named paths.
 * @param runtime the runtime helpers.
 * @param root the repository root.
 * @param paths the caller paths.
 * @returns the fresh snapshot.
 */
export async function stagePaths(runtime, root, paths) {
    const safe = paths.map((value) => repoPath(root, value).path);
    if (safe.length === 0)
        return readStatus(runtime, root);
    const result = await runtime.run(root, ['add', '--', ...safe]);
    if (result.code !== 0)
        throw failure(result, 'Git could not stage the selected files.');
    return readStatus(runtime, root);
}
/**
 * Unstage the named paths.
 * @param runtime the runtime helpers.
 * @param root the repository root.
 * @param paths the caller paths.
 * @returns the fresh snapshot.
 */
export async function unstagePaths(runtime, root, paths) {
    const safe = paths.map((value) => repoPath(root, value).path);
    if (safe.length === 0)
        return readStatus(runtime, root);
    const head = await runtime.run(root, ['rev-parse', '--verify', 'HEAD']);
    const result = head.code === 0
        ? await runtime.run(root, ['restore', '--staged', '--', ...safe])
        : await runtime.run(root, ['rm', '--cached', '--', ...safe]);
    if (result.code !== 0)
        throw failure(result, 'Git could not unstage the selected files.');
    return readStatus(runtime, root);
}
/**
 * Discard every local change to the named files.
 *
 * The named entries are restored to HEAD in the index and the working tree. An
 * untracked file is deleted. A rename is expanded to its recorded old path, so
 * the old path returns and the new one leaves. The caller must confirm first.
 * @param runtime the runtime helpers.
 * @param root the repository root.
 * @param paths the caller paths.
 * @param confirm whether the caller confirmed the loss.
 * @returns the fresh snapshot.
 */
export async function discardPaths(runtime, root, paths, confirm) {
    if (confirm !== true)
        throw new GitError('git/confirm-required', 'Discarding changes needs confirmation.');
    const safe = [...new Set(paths.map((value) => repoPath(root, value).path))];
    if (safe.length === 0)
        return readStatus(runtime, root);
    const snapshot = await readStatus(runtime, root);
    if (snapshot.merging || snapshot.rebasing || snapshot.reverting || snapshot.cherryPicking) {
        throw new GitError('git/operation', 'Finish the current operation before discarding changes.');
    }
    const wanted = new Set(safe);
    const entries = snapshot.entries.filter((entry) => wanted.has(entry.path));
    if (entries.length === 0) {
        throw new GitError('git/stale', 'The file changed after the list was read. Refresh and try again.');
    }
    if (entries.some((entry) => entry.conflicted)) {
        throw new GitError('git/conflict', 'Resolve the conflict instead of discarding it.');
    }
    const selected = new Set(entries);
    for (const entry of entries) {
        if (entry.from === null || entry.from === undefined)
            continue;
        const occupant = snapshot.entries.find((other) => other.path === entry.from && !selected.has(other));
        if (occupant !== undefined) {
            throw new GitError('git/discard-blocked', 'The old path of this rename holds another file. Remove or discard that file first.');
        }
    }
    const untracked = new Set();
    const tracked = new Set();
    for (const entry of entries) {
        if (entry.untracked) {
            untracked.add(entry.path);
            continue;
        }
        tracked.add(entry.path);
        if (entry.from !== null && entry.from !== undefined)
            tracked.add(entry.from);
    }
    const literal = (values) => [...values].map((value) => `:(literal)${value}`);
    if (untracked.size > 0) {
        const cleaned = await runtime.run(root, ['clean', '-f', '--', ...literal(untracked)]);
        if (cleaned.code !== 0)
            throw failure(cleaned, 'Git could not delete the untracked files.');
    }
    if (tracked.size > 0) {
        const specs = literal(tracked);
        const head = await runtime.run(root, ['rev-parse', '--verify', 'HEAD']);
        if (head.code === 0) {
            const restored = await runtime.run(root, ['restore', '--source=HEAD', '--staged', '--worktree', '--', ...specs]);
            if (restored.code !== 0)
                throw failure(restored, 'Git could not discard the selected files.');
        }
        else {
            const removed = await runtime.run(root, ['rm', '--cached', '-f', '--', ...specs]);
            if (removed.code !== 0)
                throw failure(removed, 'Git could not remove the staged files.');
            const cleaned = await runtime.run(root, ['clean', '-f', '--', ...specs]);
            if (cleaned.code !== 0)
                throw failure(cleaned, 'Git could not delete the selected files.');
        }
    }
    const status = await readStatus(runtime, root);
    const remaining = [...untracked].filter((path) => status.entries.some((entry) => entry.path === path));
    if (remaining.length > 0) {
        throw new GitError('git/discard-incomplete', `An untracked path could not be deleted: ${remaining.join(', ')}. A nested repository must be removed outside the panel.`, { paths: remaining });
    }
    return status;
}
/**
 * Commit the staged changes.
 * @param runtime the runtime helpers.
 * @param root the repository root.
 * @param options the commit request.
 * @returns the new commit and status.
 */
export async function commit(runtime, root, options) {
    const message = typeof options.message === 'string' ? options.message.trim() : '';
    if (message === '')
        throw new GitError('git/message-required', 'Write a commit message first.');
    const snapshot = await readStatus(runtime, root);
    if (snapshot.entries.some((entry) => entry.conflicted)) {
        throw new GitError('git/conflict', 'Resolve the conflicts before committing.');
    }
    if (!snapshot.entries.some((entry) => entry.staged)) {
        throw new GitError('git/nothing-staged', 'Stage at least one file before committing.');
    }
    const args = ['commit'];
    if (options.noVerify === true)
        args.push('--no-verify');
    if (options.amend === true)
        args.push('--amend');
    args.push('-F', '-');
    const result = await runtime.run(root, args, {
        input: message.endsWith('\n') ? message : `${message}\n`,
    });
    if (result.code !== 0) {
        throw new GitError('git/commit-failed', result.stderr.trim() || result.stdout.trim() || 'Git could not commit.', {
            stdout: result.stdout,
            stderr: result.stderr,
        });
    }
    const head = await runtime.run(root, ['rev-parse', 'HEAD']);
    return {
        hash: head.stdout.trim(),
        output: `${result.stdout}${result.stderr}`.trim(),
        status: await readStatus(runtime, root),
    };
}
/**
 * Create one branch and switch to it.
 * @param runtime the runtime helpers.
 * @param root the repository root.
 * @param options the branch request.
 * @returns the command output and status.
 */
export async function createBranch(runtime, root, options) {
    const name = typeof options.name === 'string' ? options.name.trim() : '';
    if (name === '')
        throw new GitError('git/branch-required', 'Write a branch name first.');
    const valid = await runtime.run(root, ['check-ref-format', '--branch', name]);
    if (valid.code !== 0)
        throw new GitError('git/branch-invalid', 'Use a valid branch name.');
    const created = await runtime.run(root, ['checkout', '-b', name]);
    if (created.code !== 0) {
        throw new GitError('git/branch-failed', created.stderr.trim() || created.stdout.trim() || 'Git could not create the branch.');
    }
    return {
        output: `${created.stdout}${created.stderr}`.trim(),
        status: await readStatus(runtime, root),
    };
}
/**
 * Create one branch and commit the staged changes on it.
 * @param runtime the runtime helpers.
 * @param root the repository root.
 * @param options the branch and commit request.
 * @returns the commit result.
 */
export async function createBranchAndCommit(runtime, root, options) {
    const name = typeof options.name === 'string' ? options.name.trim() : '';
    if (name === '')
        throw new GitError('git/branch-required', 'Write a branch name first.');
    if (!/^[A-Za-z0-9._/-]+$/.test(name)) {
        throw new GitError('git/branch-invalid', 'Use letters, numbers, dots, slashes, or dashes in a branch name.');
    }
    const snapshot = await readStatus(runtime, root);
    if (snapshot.entries.some((entry) => entry.conflicted)) {
        throw new GitError('git/conflict', 'Resolve the conflicts before creating a branch.');
    }
    if (!snapshot.entries.some((entry) => entry.staged)) {
        throw new GitError('git/nothing-staged', 'Stage at least one file before creating a branch.');
    }
    const created = await runtime.run(root, ['checkout', '-b', name]);
    if (created.code !== 0) {
        throw new GitError('git/branch-failed', created.stderr.trim() || 'Git could not create the branch.');
    }
    try {
        return await commit(runtime, root, {
            message: options.message,
            amend: false,
            noVerify: options.noVerify === true,
        });
    }
    catch (error) {
        if (error instanceof GitError) {
            error.message = `Branch ${name} was created, but the commit failed. ${error.message}`;
        }
        throw error;
    }
}
/**
 * Read the remote and upstream state.
 * @param runtime the runtime helpers.
 * @param root the repository root.
 * @returns the upstream name and the remote.
 */
async function remoteStatus(runtime, root) {
    const upstream = await runtime.run(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
    const remotes = await runtime.run(root, ['remote']);
    const names = remotes.code === 0
        ? remotes.stdout
            .split('\n')
            .map((name) => name.trim())
            .filter(Boolean)
        : [];
    return {
        upstream: upstream.code === 0 ? upstream.stdout.trim() : null,
        hasRemote: names.length > 0,
        remote: names.includes('origin') ? 'origin' : (names[0] ?? null),
    };
}
/**
 * Push the current branch.
 * @param runtime the runtime helpers.
 * @param root the repository root.
 * @returns the command output and status.
 */
export async function push(runtime, root) {
    const remote = await remoteStatus(runtime, root);
    if (!remote.hasRemote || remote.remote === null) {
        throw new GitError('git/no-remote', 'This repository has no remote.');
    }
    const args = remote.upstream === null ? ['push', '-u', remote.remote, 'HEAD'] : ['push'];
    const result = await runtime.run(root, args, { network: true });
    if (result.code !== 0) {
        throw new GitError('git/push-failed', result.stderr.trim() || result.stdout.trim() || 'Push failed.', {
            stdout: result.stdout,
            stderr: result.stderr,
        });
    }
    return {
        output: `${result.stdout}${result.stderr}`.trim(),
        status: await readStatus(runtime, root),
    };
}
/** The stash message used when a pull has to carry local changes. */
const PULL_STASH_MESSAGE = 'dsh-git: changes before pull';
/**
 * Tell whether Git refused a pull because local changes are in the way.
 * @param text the combined command output.
 * @returns whether stashing the changes may let the pull continue.
 */
function blockedByLocalChanges(text) {
    return /would be overwritten|cannot pull with rebase|Please commit your changes or stash them|Please commit or stash them|Please move or remove them/i.test(text);
}
/**
 * Build the failure for a pull that did not succeed.
 * @param result the command result.
 * @returns the error.
 */
function pullFailure(result) {
    return new GitError('git/pull-failed', result.stderr.trim() || result.stdout.trim() || 'Pull failed.', {
        stdout: result.stdout,
        stderr: result.stderr,
    });
}
/**
 * Pull fast-forward only, carrying local changes through a stash.
 *
 * Git refuses a fast-forward when the update touches a file with local changes,
 * and when an untracked file would be overwritten. The working tree is stashed,
 * the pull is retried, and the stash is popped with the index intact. A pop
 * conflict keeps the stash and reports it, because the pull itself succeeded.
 * @param runtime the runtime helpers.
 * @param root the repository root.
 * @returns the command output, status, and whether local changes were carried.
 */
export async function pull(runtime, root) {
    const remote = await remoteStatus(runtime, root);
    if (remote.upstream === null)
        throw new GitError('git/no-upstream', 'This branch has no upstream branch.');
    const args = ['pull', '--ff-only', '--no-rebase'];
    let result = await runtime.run(root, args, { network: true });
    let autoStash;
    if (result.code !== 0) {
        const text = `${result.stderr}\n${result.stdout}`;
        const status = blockedByLocalChanges(text) ? await readStatus(runtime, root) : null;
        if (status === null ||
            status.entries.length === 0 ||
            status.conflicts.length > 0 ||
            status.merging ||
            status.rebasing ||
            status.reverting ||
            status.cherryPicking) {
            throw pullFailure(result);
        }
        const includeUntracked = /untracked working tree files would be overwritten/i.test(text);
        const before = await runtime.run(root, ['rev-parse', '-q', '--verify', 'refs/stash']);
        const stashed = await runtime.run(root, [
            'stash',
            'push',
            ...(includeUntracked ? ['--include-untracked'] : []),
            '-m',
            PULL_STASH_MESSAGE,
        ]);
        const after = await runtime.run(root, ['rev-parse', '-q', '--verify', 'refs/stash']);
        if (stashed.code !== 0 || after.stdout.trim() === before.stdout.trim())
            throw pullFailure(result);
        result = await runtime.run(root, args, { network: true });
        const current = await runtime.run(root, ['rev-parse', '-q', '--verify', 'refs/stash']);
        const otherStash = current.stdout.trim() !== after.stdout.trim();
        if (result.code !== 0) {
            if (otherStash) {
                throw new GitError('git/pull-stash-failed', `${pullFailure(result).message} Another stash was created while the pull ran, so the local changes stay in the stash.`, { stdout: result.stdout, stderr: result.stderr });
            }
            const restored = await runtime.run(root, ['stash', 'pop', '--index', 'stash@{0}']);
            if (restored.code !== 0) {
                throw new GitError('git/pull-stash-failed', `${pullFailure(result).message} The local changes could not be restored and remain in the stash.`, { stdout: result.stdout, stderr: result.stderr });
            }
            throw pullFailure(result);
        }
        if (otherStash) {
            autoStash = 'conflict';
        }
        else {
            const restored = await runtime.run(root, ['stash', 'pop', '--index', 'stash@{0}']);
            autoStash = restored.code === 0 ? 'restored' : 'conflict';
        }
    }
    return {
        output: `${result.stdout}${result.stderr}`.trim(),
        status: await readStatus(runtime, root),
        ...(autoStash === undefined ? {} : { autoStash }),
    };
}
/**
 * Fetch from the remote.
 * @param runtime the runtime helpers.
 * @param root the repository root.
 * @returns the command output and status.
 */
export async function fetch(runtime, root) {
    const remote = await remoteStatus(runtime, root);
    if (!remote.hasRemote)
        throw new GitError('git/no-remote', 'This repository has no remote.');
    const result = await runtime.run(root, ['fetch'], { network: true });
    if (result.code !== 0) {
        throw new GitError('git/fetch-failed', result.stderr.trim() || result.stdout.trim() || 'Fetch failed.');
    }
    return {
        output: `${result.stdout}${result.stderr}`.trim(),
        status: await readStatus(runtime, root),
    };
}
/**
 * Read the staged patch for the message writer.
 * @param runtime the runtime helpers.
 * @param root the repository root.
 * @returns the patch text.
 */
export async function stagedPatch(runtime, root) {
    const result = await runtime.run(root, [
        'diff',
        '--cached',
        '--patch',
        '--no-color',
        '--no-ext-diff',
        '--unified=2',
    ]);
    if (result.code !== 0)
        throw failure(result, 'Git could not read the staged changes.');
    return result.stdout;
}
/**
 * Read the most recent commit subjects.
 * @param runtime the runtime helpers.
 * @param root the repository root.
 * @param count how many to read.
 * @returns the subjects.
 */
export async function recentSubjects(runtime, root, count = 5) {
    const result = await runtime.run(root, ['log', `--max-count=${count}`, '--format=%s']);
    if (result.code !== 0)
        return [];
    return result.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '');
}
/**
 * Read the commit log.
 * @param runtime the runtime helpers.
 * @param root the repository root.
 * @returns the commits.
 */
export async function log(runtime, root) {
    const format = '%H%x00%P%x00%an%x00%ae%x00%ad%x00%D%x00%s%x1e';
    const result = await runtime.run(root, [
        'log',
        '--all',
        '--exclude=refs/stash',
        '--max-count=100',
        '--date=iso-strict',
        `--pretty=format:${format}`,
    ]);
    if (result.code !== 0) {
        if (result.stderr.includes('does not have any commits yet'))
            return { commits: [] };
        throw failure(result, 'Git log failed.');
    }
    return { commits: parseLog(result.stdout) };
}
/**
 * Read one commit with its message and files.
 * @param runtime the runtime helpers.
 * @param root the repository root.
 * @param options the commit request.
 * @returns the commit detail.
 */
export async function commitDetail(runtime, root, options) {
    const hash = commitHash(options.hash);
    const meta = await runtime.run(root, [
        'show',
        '-s',
        '--date=iso-strict',
        '--pretty=format:%H%x00%P%x00%an%x00%ae%x00%ad%x00%s%x00%b',
        hash,
    ]);
    if (meta.code !== 0)
        throw failure(meta, 'Git could not read that commit.');
    const fields = meta.stdout.split('\x00');
    const filesResult = await runtime.run(root, ['show', '--numstat', '-z', '--no-renames', '--format=', hash]);
    const files = [];
    if (filesResult.code === 0) {
        for (const record of filesResult.stdout.split('\0')) {
            if (record === '')
                continue;
            const parts = record.split('\t');
            if (parts.length < 3)
                continue;
            const rawAdd = parts[0] ?? '';
            const rawDel = parts[1] ?? '';
            const add = rawAdd === '-' ? null : Number(rawAdd);
            const del = rawDel === '-' ? null : Number(rawDel);
            files.push({
                path: parts.slice(2).join('\t'),
                add: add !== null && Number.isFinite(add) ? add : null,
                del: del !== null && Number.isFinite(del) ? del : null,
                binary: add === null || del === null,
            });
        }
    }
    return {
        hash: fields[0] ?? hash,
        parents: fields[1] !== undefined && fields[1] !== '' ? fields[1].split(' ').filter(Boolean) : [],
        author: fields[2] ?? '',
        email: fields[3] ?? '',
        date: fields[4] ?? '',
        subject: fields[5] ?? '',
        body: fields[6] ?? '',
        files,
    };
}
/**
 * Move the last commit back into the index.
 * @param runtime the runtime helpers.
 * @param root the repository root.
 * @param options the commit request.
 * @returns the undo result.
 */
export async function undoCommit(runtime, root, options) {
    const snapshot = await readStatus(runtime, root);
    refuseOperation(snapshot);
    if (snapshot.branch.detached) {
        throw new GitError('git/detached', 'Check out a branch before undoing a commit.');
    }
    const target = await resolveCommit(runtime, root, options.hash);
    const head = await runtime.run(root, ['rev-parse', '--verify', 'HEAD']);
    if (head.code !== 0 || head.stdout.trim() === '') {
        throw new GitError('git/no-head', 'This branch has no commit to undo.');
    }
    if (head.stdout.trim() !== target.hash) {
        throw new GitError('git/not-head', 'Only the last commit on the current branch can be undone.');
    }
    const parent = target.parents[0];
    if (parent === undefined) {
        throw new GitError('git/root-commit', 'The first commit has no parent to move back to.');
    }
    if (snapshot.branch.upstream !== null && snapshot.branch.ahead === 0) {
        throw new GitError('git/undo-pushed', `The last commit is already on ${snapshot.branch.upstream}. Revert it instead.`);
    }
    const logged = await runtime.run(root, ['log', '-1', '--pretty=%B', target.hash]);
    const reset = await runtime.run(root, ['reset', '--soft', parent]);
    if (reset.code !== 0)
        throw failure(reset, 'Git could not undo the commit.');
    return {
        hash: target.hash,
        message: logged.code === 0 ? logged.stdout.replace(/\s+$/, '') : '',
        output: `${reset.stdout}${reset.stderr}`.trim(),
        status: await readStatus(runtime, root),
    };
}
/**
 * Revert one commit without committing it.
 * @param runtime the runtime helpers.
 * @param root the repository root.
 * @param options the commit request.
 * @returns the revert result.
 */
export async function revertCommit(runtime, root, options) {
    const snapshot = await readStatus(runtime, root);
    refuseOperation(snapshot);
    if (snapshot.entries.some((entry) => entry.conflicted)) {
        throw new GitError('git/conflict', 'Resolve the conflicts before reverting a commit.');
    }
    if (snapshot.entries.some((entry) => entry.staged)) {
        throw new GitError('git/index-dirty', 'Commit or unstage the staged files before reverting a commit.');
    }
    const target = await resolveCommit(runtime, root, options.hash);
    if (target.parents.length > 1) {
        throw new GitError('git/merge-commit', 'A merge commit needs a mainline choice and cannot be reverted here.');
    }
    const subject = await runtime.run(root, ['show', '-s', '--format=%s', target.hash]);
    if (subject.code !== 0)
        throw failure(subject, 'Git could not read that commit.');
    const message = `Revert "${subject.stdout.trim()}"\n\nThis reverts commit ${target.hash}.`;
    const result = await runtime.run(root, ['revert', '--no-commit', target.hash]);
    const status = await readStatus(runtime, root);
    const output = `${result.stdout}${result.stderr}`.trim();
    if (result.code !== 0) {
        const paths = status.entries.filter((entry) => entry.conflicted).map((entry) => entry.path);
        if (paths.length > 0) {
            return { hash: target.hash, conflicted: true, paths, message, output, status };
        }
        throw new GitError('git/revert-failed', output || 'Git could not revert the commit.', {
            stdout: result.stdout,
            stderr: result.stderr,
        });
    }
    return { hash: target.hash, conflicted: false, paths: [], message, output, status };
}
/**
 * Cherry-pick one commit onto the current branch.
 * @param runtime the runtime helpers.
 * @param root the repository root.
 * @param options the commit request.
 * @returns the new commit and status.
 */
export async function cherryPickCommit(runtime, root, options) {
    const snapshot = await readStatus(runtime, root);
    refuseOperation(snapshot);
    if (snapshot.entries.some((entry) => entry.conflicted)) {
        throw new GitError('git/conflict', 'Resolve the conflicts before cherry-picking a commit.');
    }
    const target = await resolveCommit(runtime, root, options.hash);
    if (target.parents.length > 1) {
        throw new GitError('git/merge-commit', 'A merge commit cannot be cherry-picked here.');
    }
    const contained = await runtime.run(root, ['cherry', 'HEAD', target.hash]);
    if (contained.code !== 0)
        throw failure(contained, 'Git could not compare the commits.');
    const pending = contained.stdout
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.length > 0 && line.split(' ').pop() === target.hash);
    if (pending === undefined || pending.startsWith('-')) {
        throw new GitError('git/already-applied', 'This commit is already applied to the current branch.');
    }
    const result = await runtime.run(root, ['cherry-pick', target.hash]);
    const status = await readStatus(runtime, root);
    if (result.code !== 0) {
        const paths = status.entries.filter((entry) => entry.conflicted).map((entry) => entry.path);
        const aborted = await runtime.run(root, ['cherry-pick', '--abort']);
        if (paths.length > 0) {
            throw new GitError('git/cherry-pick-conflict', `Cherry-pick stopped with conflicts in ${paths.join(', ')}. The pick was aborted and the branch is unchanged.`, { paths, aborted: aborted.code === 0, stdout: result.stdout, stderr: result.stderr });
        }
        throw new GitError('git/cherry-pick-failed', result.stderr.trim() || result.stdout.trim() || 'Git could not cherry-pick the commit.', { stdout: result.stdout, stderr: result.stderr, aborted: aborted.code === 0 });
    }
    const head = await runtime.run(root, ['rev-parse', '--verify', 'HEAD']);
    return {
        hash: head.code === 0 ? head.stdout.trim() : target.hash,
        output: `${result.stdout}${result.stderr}`.trim(),
        status: await readStatus(runtime, root),
    };
}
const RESET_MODES = new Set(['soft', 'mixed', 'hard']);
/**
 * Reset the current branch to one commit.
 * @param runtime the runtime helpers.
 * @param root the repository root.
 * @param options the reset request.
 * @returns the reset result.
 */
export async function resetToCommit(runtime, root, options) {
    const mode = typeof options.mode === 'string' ? options.mode : '';
    if (!RESET_MODES.has(mode)) {
        throw new GitError('git/invalid-reset-mode', 'Choose soft, mixed, or hard.');
    }
    if (options.confirm !== true) {
        throw new GitError('git/confirm-required', 'Resetting the branch needs confirmation.');
    }
    const snapshot = await readStatus(runtime, root);
    refuseOperation(snapshot);
    if (snapshot.branch.detached) {
        throw new GitError('git/detached', 'Check out a branch before resetting it.');
    }
    const target = await resolveCommit(runtime, root, options.hash);
    const result = await runtime.run(root, ['reset', `--${mode}`, target.hash]);
    if (result.code !== 0)
        throw failure(result, 'Git could not reset the branch.');
    return {
        hash: target.hash,
        mode,
        output: `${result.stdout}${result.stderr}`.trim(),
        status: await readStatus(runtime, root),
    };
}
/**
 * List local and remote branches.
 * @param runtime the runtime helpers.
 * @param root the repository root.
 * @returns the branches.
 */
export async function branches(runtime, root) {
    const result = await runtime.run(root, [
        'for-each-ref',
        '--format=%(refname:short)%00%(HEAD)%00%(upstream:short)%00%(refname)',
        'refs/heads',
        'refs/remotes',
    ]);
    if (result.code !== 0)
        throw failure(result, 'Git could not list branches.');
    const list = [];
    for (const record of result.stdout.split('\n')) {
        if (record.trim() === '')
            continue;
        const [name, head, upstream, full] = record.split('\x00');
        if (name === undefined || name === '')
            continue;
        if (full?.includes('refs/remotes/') === true && name.endsWith('/HEAD'))
            continue;
        const remote = full?.startsWith('refs/remotes/') === true;
        list.push({
            name,
            current: head === '*',
            upstream: upstream !== undefined && upstream !== '' ? upstream : null,
            remote,
        });
    }
    return { branches: list };
}
/**
 * Check out one branch.
 * @param runtime the runtime helpers.
 * @param root the repository root.
 * @param options the checkout request.
 * @returns the command output and status.
 */
export async function checkout(runtime, root, options) {
    const name = typeof options.branch === 'string' ? options.branch.trim() : '';
    if (name === '' || name.startsWith('-') || name.includes('\0')) {
        throw new GitError('git/branch-invalid', 'Choose a branch.');
    }
    const result = await runtime.run(root, options.remote === true ? ['checkout', '--track', name] : ['checkout', name]);
    if (result.code !== 0) {
        throw new GitError('git/checkout-failed', result.stderr.trim() || result.stdout.trim() || 'Checkout failed.');
    }
    return {
        output: `${result.stdout}${result.stderr}`.trim(),
        status: await readStatus(runtime, root),
    };
}
/**
 * List the stashes.
 * @param runtime the runtime helpers.
 * @param root the repository root.
 * @returns the stashes.
 */
export async function stashList(runtime, root) {
    const result = await runtime.run(root, ['stash', 'list', '--pretty=format:%gd%x00%gs%x00%H%x1e']);
    if (result.code !== 0)
        throw failure(result, 'Git could not list stashes.');
    return { stashes: parseStashes(result.stdout) };
}
/**
 * Push the worktree changes onto the stash.
 * @param runtime the runtime helpers.
 * @param root the repository root.
 * @param options the stash request.
 * @returns the command output, status, and stashes.
 */
export async function stashPush(runtime, root, options) {
    const message = typeof options.message === 'string' && options.message.trim() !== '' ? options.message.trim() : 'WIP';
    const paths = Array.isArray(options.paths) ? options.paths.map((value) => repoPath(root, value).path) : [];
    const args = ['stash', 'push', '-m', message];
    if (options.includeUntracked === true)
        args.push('-u');
    if (paths.length > 0)
        args.push('--', ...paths);
    const result = await runtime.run(root, args);
    if (result.code !== 0)
        throw failure(result, 'Git could not stash the selected files.');
    return {
        output: `${result.stdout}${result.stderr}`.trim(),
        status: await readStatus(runtime, root),
        ...(await stashList(runtime, root)),
    };
}
/**
 * Validate one stash reference.
 * @param value the caller ref.
 * @returns the ref.
 */
function stashRef(value) {
    if (typeof value !== 'string' || !/^stash@\{\d+\}$/.test(value)) {
        throw new GitError('git/invalid-stash', 'Choose a stash.');
    }
    return value;
}
/**
 * Apply or pop one stash.
 * @param runtime the runtime helpers.
 * @param root the repository root.
 * @param options the stash request.
 * @returns the command output, status, and stashes.
 */
export async function stashApply(runtime, root, options) {
    const ref = stashRef(options.ref);
    const verb = options.pop === true ? 'pop' : 'apply';
    const result = await runtime.run(root, ['stash', verb, ref]);
    if (result.code !== 0) {
        throw new GitError('git/stash-failed', result.stderr.trim() || result.stdout.trim() || 'Git could not apply the stash.');
    }
    return {
        output: `${result.stdout}${result.stderr}`.trim(),
        status: await readStatus(runtime, root),
        ...(await stashList(runtime, root)),
    };
}
/**
 * Drop one stash.
 * @param runtime the runtime helpers.
 * @param root the repository root.
 * @param options the stash request.
 * @returns the command output, status, and stashes.
 */
export async function stashDrop(runtime, root, options) {
    const ref = stashRef(options.ref);
    const result = await runtime.run(root, ['stash', 'drop', ref]);
    if (result.code !== 0)
        throw failure(result, 'Git could not drop the stash.');
    return {
        output: `${result.stdout}${result.stderr}`.trim(),
        status: await readStatus(runtime, root),
        ...(await stashList(runtime, root)),
    };
}
/**
 * Resolve one conflicted file to one side.
 * @param runtime the runtime helpers.
 * @param root the repository root.
 * @param options the resolve request.
 * @returns the fresh snapshot.
 */
export async function resolveConflict(runtime, root, options) {
    const value = repoPath(root, options.path);
    if (options.side !== 'ours' && options.side !== 'theirs') {
        throw new GitError('git/invalid-side', 'Choose a conflict side.');
    }
    const checked = await runtime.run(root, ['checkout', `--${options.side}`, '--', value.path]);
    if (checked.code !== 0) {
        throw new GitError('git/resolve-failed', checked.stderr.trim() || 'Git could not resolve the file.');
    }
    const added = await runtime.run(root, ['add', '--', value.path]);
    if (added.code !== 0)
        throw failure(added, 'Git could not stage the resolved file.');
    return readStatus(runtime, root);
}
