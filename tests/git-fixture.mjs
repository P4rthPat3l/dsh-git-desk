import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const hasGit = (() => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

export const skip = hasGit ? false : 'git is not on PATH';

/**
 * Run Git with an empty home so a user config cannot change the result.
 * @param {string} cwd the working directory.
 * @param {string[]} args the arguments.
 * @param {string} home the empty home directory.
 * @param {string} [input] text for stdin; stdin closes immediately otherwise.
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>} the outcome.
 */
export function runGit(cwd, args, home, input) {
  return new Promise((resolve) => {
    const child = spawn('git', args, {
      cwd,
      env: {
        ...process.env,
        HOME: home,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_TERMINAL_PROMPT: '0',
        GIT_AUTHOR_NAME: 'Test',
        GIT_AUTHOR_EMAIL: 'test@example.com',
        GIT_COMMITTER_NAME: 'Test',
        GIT_COMMITTER_EMAIL: 'test@example.com',
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      resolve({ code: 1, stdout, stderr: `${stderr}${error.message}` });
    });
    child.on('close', (code) => {
      resolve({ code: code === null ? 1 : code, stdout, stderr });
    });
    child.stdin.on('error', () => {});
    if (input === undefined || input === '') child.stdin.end();
    else child.stdin.end(input);
  });
}

/**
 * Run Git and fail the test when the command does not succeed.
 * @param {string} cwd the working directory.
 * @param {string[]} args the arguments.
 * @param {string} home the empty home directory.
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>} the outcome.
 */
export async function gitOk(cwd, args, home) {
  const result = await runGit(cwd, args, home);
  assert.equal(result.code, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
  return result;
}

/**
 * Build the runtime the host Git endpoints expect.
 * @param {string} home the empty home directory.
 * @returns {object} the runtime subset the read and discard paths use.
 */
export function runtimeFor(home) {
  return {
    run: (cwd, args, options) => runGit(cwd, args, home, options?.input),
    async readText(file) {
      try {
        const bytes = await readFile(file);
        const text = bytes.toString('utf8');
        return { text, binary: bytes.includes(0), size: bytes.length };
      } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'EISDIR' || error.code === 'ENOTDIR') return null;
        throw error;
      }
    },
    async lstatPath(file) {
      try {
        return await lstat(file);
      } catch {
        return null;
      }
    },
  };
}

/**
 * Create a temporary root with an empty home directory.
 * @param {object} t the test context.
 * @returns {Promise<{ root: string, home: string }>} the paths.
 */
export async function tempRoot(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'dsh-git-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  await mkdir(home, { recursive: true });
  return { root, home };
}

/**
 * Create an upstream clone and a working clone with one base commit.
 * @param {object} t the test context.
 * @param {Record<string, string>} files the base files.
 * @returns {Promise<object>} the paths, runtime, and home directory.
 */
export async function setupRepos(t, files) {
  const { root, home } = await tempRoot(t);
  const upstream = path.join(root, 'upstream.git');
  const up = path.join(root, 'upstream-work');
  const work = path.join(root, 'work');
  await gitOk(root, ['init', '--bare', '-q', upstream], home);
  await gitOk(root, ['clone', '-q', upstream, up], home);
  for (const [name, content] of Object.entries(files)) {
    await writeFile(path.join(up, name), content);
  }
  await gitOk(up, ['add', '-A'], home);
  await gitOk(up, ['commit', '-q', '-m', 'base'], home);
  await gitOk(up, ['push', '-q', 'origin', 'HEAD'], home);
  await gitOk(root, ['clone', '-q', upstream, work], home);
  return { root, home, upstream, up, work, runtime: runtimeFor(home) };
}

/**
 * Commit every change in the upstream clone and push it.
 * @param {object} repos the repository paths and home.
 * @param {string} message the commit message.
 * @returns {Promise<void>}
 */
export async function commitAndPush(repos, message) {
  await gitOk(repos.up, ['add', '-A'], repos.home);
  await gitOk(repos.up, ['commit', '-q', '-m', message], repos.home);
  await gitOk(repos.up, ['push', '-q', 'origin', 'HEAD'], repos.home);
}
