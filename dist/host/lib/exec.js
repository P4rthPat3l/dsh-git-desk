import { lstat, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
const DEFAULT_TIMEOUT_MS = 30_000;
const NETWORK_TIMEOUT_MS = 180_000;
/** One Git failure with a stable code. */
export class GitError extends Error {
    code;
    details;
    constructor(code, message, details = {}) {
        super(message);
        this.name = 'GitError';
        this.code = code;
        this.details = details;
    }
}
/**
 * Read the `code` of a filesystem failure.
 * @param error the thrown value.
 * @returns the errno name, or undefined when it is not an errno failure.
 */
function errnoCode(error) {
    if (!(error instanceof Error) || !('code' in error))
        return undefined;
    const { code } = error;
    return typeof code === 'string' ? code : undefined;
}
/**
 * Tell a missing path apart from a real failure.
 * @param error the thrown value.
 * @returns whether the path is simply absent.
 */
function isMissing(error) {
    const code = errnoCode(error);
    return code === 'ENOENT' || code === 'EISDIR' || code === 'ENOTDIR';
}
/**
 * Run one managed child process and collect both streams.
 * The provider owns cancellation. This wrapper only adds a wall clock and
 * folds a spawn failure into a normal command result so callers can show it.
 * @param subprocess the harness subprocess service.
 * @returns the runtime helpers.
 */
export function createRuntime(subprocess) {
    let gitPath;
    let gitPathError;
    async function resolveGit() {
        if (gitPath !== undefined)
            return gitPath;
        if (gitPathError !== undefined)
            throw gitPathError;
        try {
            gitPath = await subprocess.resolveExecutable('git');
            return gitPath;
        }
        catch (error) {
            gitPathError = new GitError('git/not-installed', 'Git is not installed or is not on PATH.', {
                cause: error instanceof Error ? error.message : String(error),
            });
            throw gitPathError;
        }
    }
    async function run(cwd, args, options = {}) {
        const executable = await resolveGit();
        const timeoutMs = options.timeoutMs ?? (options.network === true ? NETWORK_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);
        const timeout = AbortSignal.timeout(timeoutMs);
        const signal = options.signal === undefined ? timeout : AbortSignal.any([timeout, options.signal]);
        const env = {
            ...process.env,
            LC_ALL: 'C',
            LANG: 'C',
            GIT_TERMINAL_PROMPT: '0',
            GIT_OPTIONAL_LOCKS: '0',
            GIT_PAGER: 'cat',
            PAGER: 'cat',
        };
        let handle;
        try {
            handle = subprocess.spawn({
                argv: [executable, ...args],
                cwd,
                stdio: {
                    stdin: options.input === undefined ? 'ignore' : { data: options.input },
                    stdout: { maxBytes: 64 * 1024 * 1024, spill: { maxBytes: 128 * 1024 * 1024 } },
                    stderr: { maxBytes: 8 * 1024 * 1024 },
                },
                graceMs: 2000,
                signal,
                env,
            });
        }
        catch (error) {
            if (signal.aborted)
                throw new GitError('git/cancelled', 'The Git command was cancelled.', { args });
            throw new GitError('git/spawn-failed', 'Git could not start.', {
                args,
                cause: error instanceof Error ? error.message : String(error),
            });
        }
        let outcome;
        try {
            outcome = await handle.done;
        }
        catch (error) {
            if (timeout.aborted) {
                throw new GitError('git/timeout', `Git did not finish within ${Math.round(timeoutMs / 1000)} seconds.`, {
                    args,
                });
            }
            if (options.signal?.aborted === true) {
                throw new GitError('git/cancelled', 'The Git command was cancelled.', { args });
            }
            throw new GitError('git/failed', 'Git failed to run.', {
                args,
                cause: error instanceof Error ? error.message : String(error),
            });
        }
        const stdout = handle.collected.stdout?.readFrom(0);
        const stderr = handle.collected.stderr?.readFrom(0);
        if (stdout?.lossy === true) {
            throw new GitError('git/output-too-large', 'Git returned more output than the panel can read.', {
                args,
                spillPath: stdout.spillPath,
            });
        }
        return {
            code: outcome.exitCode ?? (outcome.signal === null ? 0 : 1),
            stdout: stdout?.text ?? '',
            stderr: stderr?.text ?? '',
        };
    }
    async function readText(path) {
        try {
            const bytes = await readFile(path);
            const text = bytes.toString('utf8');
            return {
                text,
                binary: bytes.includes(0) || !Buffer.from(text, 'utf8').equals(bytes),
                size: bytes.length,
            };
        }
        catch (error) {
            if (isMissing(error))
                return null;
            throw new GitError('git/read-failed', `Could not read ${path}.`, {
                path,
                cause: error instanceof Error ? error.message : String(error),
            });
        }
    }
    async function readBuffer(path) {
        try {
            return await readFile(path);
        }
        catch (error) {
            if (isMissing(error))
                return null;
            throw new GitError('git/read-failed', `Could not read ${path}.`, {
                path,
                cause: error instanceof Error ? error.message : String(error),
            });
        }
    }
    async function writeText(path, text) {
        await writeFile(path, text, 'utf8');
    }
    async function statPath(path) {
        try {
            return await stat(path);
        }
        catch {
            return null;
        }
    }
    async function lstatPath(path) {
        try {
            return await lstat(path);
        }
        catch {
            return null;
        }
    }
    async function readdirPath(path) {
        try {
            return await readdir(path, { withFileTypes: true });
        }
        catch {
            return [];
        }
    }
    async function realpathPath(path) {
        return realpath(path);
    }
    return { run, readText, readBuffer, writeText, statPath, lstatPath, readdir: readdirPath, realpath: realpathPath };
}
