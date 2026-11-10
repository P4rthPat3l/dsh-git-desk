const STATUS_LETTERS = new Set(['A', 'C', 'D', 'M', 'R', 'T', 'U', 'X']);
/**
 * Split a porcelain record after its fixed leading fields, keeping spaces in the path.
 * @param record the record.
 * @param count the number of fields to skip.
 * @returns the prefix and the path, or null when the record is short.
 */
function splitFields(record, count) {
    let index = 0;
    for (let field = 0; field < count; field += 1) {
        const space = record.indexOf(' ', index);
        if (space === -1)
            return null;
        index = space + 1;
    }
    return [record.slice(0, index - 1), record.slice(index)];
}
/**
 * Read the two-letter porcelain code into display flags.
 * @param entry the entry being built.
 * @param xy the two-letter code.
 * @returns the flags.
 */
function branchCode(entry, xy) {
    const index = xy[0] ?? '.';
    const worktree = xy[1] ?? '.';
    const conflicted = entry.kind === 'unmerged' || index === 'U' || worktree === 'U';
    const untracked = entry.kind === 'untracked';
    const staged = !untracked && index !== '.' && index !== '?';
    const unstaged = untracked || (worktree !== '.' && worktree !== '?');
    let letter = 'M';
    if (conflicted)
        letter = 'C';
    else if (untracked)
        letter = 'U';
    else if (index === 'A')
        letter = 'A';
    else if (index === 'D' || worktree === 'D')
        letter = 'D';
    else if (index === 'R' || worktree === 'R')
        letter = 'R';
    else if (index === 'C' || worktree === 'C')
        letter = 'C';
    else if (index === 'T' || worktree === 'T')
        letter = 'T';
    return {
        index,
        worktree,
        conflicted,
        untracked,
        staged,
        unstaged,
        letter,
        both: staged && unstaged,
    };
}
/**
 * Parse one porcelain v2 status document.
 * @param text the document.
 * @returns the branch, entries, and operation flags.
 */
export function parseStatus(text) {
    const branch = {
        oid: null,
        name: null,
        upstream: null,
        ahead: 0,
        behind: 0,
        detached: false,
        initial: false,
    };
    const entries = [];
    let skipNext = false;
    let pendingRename = null;
    for (const record of text.split('\0')) {
        if (record === '')
            continue;
        if (skipNext) {
            skipNext = false;
            if (pendingRename !== null)
                pendingRename.from = record;
            pendingRename = null;
            continue;
        }
        if (record.startsWith('# ')) {
            const header = record.slice(2);
            const space = header.indexOf(' ');
            const key = space === -1 ? header : header.slice(0, space);
            const value = space === -1 ? '' : header.slice(space + 1);
            if (key === 'branch.oid') {
                branch.oid = value === '(initial)' ? null : value;
                branch.initial = value === '(initial)';
            }
            else if (key === 'branch.head') {
                branch.detached = value === '(detached)';
                branch.name = value === '(detached)' ? null : value;
            }
            else if (key === 'branch.upstream') {
                branch.upstream = value;
            }
            else if (key === 'branch.ab') {
                const match = /^\+(\d+) -(\d+)$/.exec(value);
                if (match !== null) {
                    branch.ahead = Number(match[1]);
                    branch.behind = Number(match[2]);
                }
            }
            continue;
        }
        if (record.startsWith('1 ')) {
            const fields = splitFields(record, 8);
            if (fields === null)
                continue;
            const xy = fields[0].split(' ')[1] ?? '.';
            entries.push({ path: fields[1], kind: 'tracked', ...branchCode({ kind: 'tracked' }, xy) });
            continue;
        }
        if (record.startsWith('2 ')) {
            const fields = splitFields(record, 9);
            if (fields === null)
                continue;
            const xy = fields[0].split(' ')[1] ?? '.';
            const entry = {
                path: fields[1],
                kind: 'renamed',
                from: null,
                ...branchCode({ kind: 'renamed' }, xy),
            };
            entries.push(entry);
            pendingRename = entry;
            skipNext = true;
            continue;
        }
        if (record.startsWith('u ')) {
            const fields = splitFields(record, 10);
            if (fields === null)
                continue;
            const xy = fields[0].split(' ')[1] ?? '.';
            entries.push({ path: fields[1], kind: 'unmerged', ...branchCode({ kind: 'unmerged' }, xy) });
            continue;
        }
        if (record.startsWith('? ')) {
            const path = record.slice(2);
            entries.push({ path, kind: 'untracked', ...branchCode({ kind: 'untracked' }, '??') });
            continue;
        }
    }
    for (const entry of entries) {
        if (!STATUS_LETTERS.has(entry.letter))
            entry.letter = 'M';
    }
    return {
        branch,
        entries,
        merging: entries.some((entry) => entry.conflicted),
        rebasing: false,
    };
}
/**
 * Parse one numstat document.
 * @param text the document.
 * @returns the counts per path.
 */
export function parseNumstat(text) {
    const result = new Map();
    for (const record of text.split('\0')) {
        if (record === '')
            continue;
        const parts = record.split('\t');
        if (parts.length < 3)
            continue;
        const path = parts.slice(2).join('\t');
        const rawAdd = parts[0] ?? '';
        const rawDel = parts[1] ?? '';
        const add = rawAdd === '-' ? null : Number(rawAdd);
        const del = rawDel === '-' ? null : Number(rawDel);
        result.set(path, {
            add: add !== null && Number.isFinite(add) ? add : null,
            del: del !== null && Number.isFinite(del) ? del : null,
            binary: add === null || del === null,
        });
    }
    return result;
}
/**
 * Parse the zero-context hunk boundaries Git already computed.
 * @param patch the patch text.
 * @returns the hunks.
 */
export function parseHunks(patch) {
    const hunks = [];
    for (const line of patch.split('\n')) {
        if (!line.startsWith('@@ '))
            continue;
        const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
        if (match === null)
            continue;
        hunks.push({
            oldStart: Number(match[1]),
            oldCount: match[2] === undefined ? 1 : Number(match[2]),
            newStart: Number(match[3]),
            newCount: match[4] === undefined ? 1 : Number(match[4]),
        });
    }
    return hunks;
}
/**
 * Split text into lines, remembering whether it ended with a newline.
 * @param text the text.
 * @returns the lines and the trailing newline state.
 */
export function splitLines(text) {
    if (text === '')
        return { lines: [], trailing: false };
    const lines = text.split('\n');
    let trailing = false;
    if (lines[lines.length - 1] === '') {
        lines.pop();
        trailing = true;
    }
    return { lines, trailing };
}
/**
 * Join lines back into text.
 * @param lines the lines.
 * @param trailing whether the text ends with a newline.
 * @returns the text.
 */
export function joinLines(lines, trailing) {
    if (lines.length === 0)
        return '';
    return lines.join('\n') + (trailing ? '\n' : '');
}
/**
 * Build display rows from two complete versions and Git's hunk boundaries.
 * Every unchanged line becomes a context row, so the caller can render the
 * full file without asking Git for context.
 *
 * @param leftLines the old version.
 * @param rightLines the new version.
 * @param hunks the hunk boundaries.
 * @returns the rows, blocks, and line counts.
 */
export function buildRows(leftLines, rightLines, hunks) {
    const rows = [];
    const blocks = [];
    let left = 0;
    let right = 0;
    const pushContext = (count) => {
        for (let index = 0; index < count; index += 1) {
            rows.push({ l: left + 1, r: right + 1, k: 'ctx' });
            left += 1;
            right += 1;
        }
    };
    for (const hunk of hunks) {
        if (hunk.oldCount === 0) {
            pushContext(Math.max(0, hunk.oldStart - left));
            const row = rows.length;
            for (let index = 0; index < hunk.newCount; index += 1) {
                rows.push({ l: null, r: right + 1, k: 'add' });
                right += 1;
            }
            blocks.push({
                leftStart: hunk.oldStart + 1,
                leftEnd: hunk.oldStart,
                rightStart: hunk.newStart,
                rightEnd: hunk.newStart + hunk.newCount - 1,
                kind: 'add',
                row,
            });
            continue;
        }
        if (hunk.newCount === 0) {
            pushContext(Math.max(0, hunk.oldStart - 1 - left));
            const row = rows.length;
            for (let index = 0; index < hunk.oldCount; index += 1) {
                rows.push({ l: left + 1, r: null, k: 'del' });
                left += 1;
            }
            blocks.push({
                leftStart: hunk.oldStart,
                leftEnd: hunk.oldStart + hunk.oldCount - 1,
                rightStart: hunk.newStart + 1,
                rightEnd: hunk.newStart,
                kind: 'del',
                row,
            });
            continue;
        }
        pushContext(Math.max(0, hunk.oldStart - 1 - left));
        const row = rows.length;
        const count = Math.max(hunk.oldCount, hunk.newCount);
        for (let index = 0; index < count; index += 1) {
            const hasLeft = index < hunk.oldCount;
            const hasRight = index < hunk.newCount;
            rows.push({
                l: hasLeft ? left + 1 : null,
                r: hasRight ? right + 1 : null,
                k: hasLeft && hasRight ? 'mod' : hasLeft ? 'del' : 'add',
            });
            if (hasLeft)
                left += 1;
            if (hasRight)
                right += 1;
        }
        blocks.push({
            leftStart: hunk.oldStart,
            leftEnd: hunk.oldStart + hunk.oldCount - 1,
            rightStart: hunk.newStart,
            rightEnd: hunk.newStart + hunk.newCount - 1,
            kind: 'mod',
            row,
        });
    }
    pushContext(Math.max(0, leftLines.length - left));
    let add = 0;
    let del = 0;
    for (const row of rows) {
        if (row.k === 'add')
            add += 1;
        else if (row.k === 'del')
            del += 1;
        else if (row.k === 'mod') {
            add += 1;
            del += 1;
        }
    }
    return { rows, blocks, add, del };
}
/**
 * Parse one log document.
 * @param text the document.
 * @returns the commits.
 */
export function parseLog(text) {
    const commits = [];
    for (const record of text.split('\x1e')) {
        const raw = record.trim();
        if (raw === '')
            continue;
        const [rawHash, parents, author, email, date, refs, subject] = raw.split('\x00');
        const hash = rawHash?.trim();
        if (hash === undefined || hash === '')
            continue;
        commits.push({
            hash,
            parents: parents !== undefined && parents !== '' ? parents.split(' ').filter(Boolean) : [],
            author: author ?? '',
            email: email ?? '',
            date: date ?? '',
            refs: refs !== undefined && refs !== ''
                ? refs
                    .split(', ')
                    .map((ref) => ref.trim())
                    .filter(Boolean)
                : [],
            subject: subject ?? '',
        });
    }
    return commits;
}
/**
 * Parse one stash list document.
 * @param text the document.
 * @returns the stash entries.
 */
export function parseStashes(text) {
    const stashes = [];
    for (const record of text.split('\x1e')) {
        const raw = record.trim();
        if (raw === '')
            continue;
        const [rawRef, message, rawHash] = raw.split('\x00');
        const ref = rawRef?.trim();
        if (ref === undefined || ref === '')
            continue;
        stashes.push({ ref, message: message ?? '', hash: rawHash?.trim() ?? '' });
    }
    return stashes;
}
