import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(import.meta.dirname, '..');
const nodeRequire = createRequire(import.meta.url);

/**
 * Install a jsdom window as the global DOM the bundle expects.
 * @returns the jsdom instance.
 */
function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  const { window } = dom;
  for (const [key, value] of [
    ['window', window],
    ['document', window.document],
    ['navigator', window.navigator],
    ['HTMLElement', window.HTMLElement],
    ['Element', window.Element],
    ['Node', window.Node],
    ['localStorage', window.localStorage],
  ]) {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  return dom;
}

/**
 * Load the built client bundle and return its exports with a recording context.
 * @returns the bundle exports, the context, and what `apply` registered.
 */
async function loadBundle() {
  const dom = installDom();
  const source = await fs.readFile(path.join(ROOT, 'client.js'), 'utf8');
  let factory = null;
  const chunks = new Map();
  dom.window.__ModuleLoader__ = {
    load(config) {
      if (config.chunk === undefined) factory = config.factory;
      else chunks.set(config.chunk, config.factory);
    },
  };
  const react = nodeRequire('react');
  const requireModule = () => react;
  requireModule.async = async (specifier) => {
    const name = specifier.replace(/^\.\//, '');
    const chunkSource = await fs.readFile(path.join(ROOT, name), 'utf8');
    const runChunk = new Function('window', 'document', 'navigator', chunkSource);
    runChunk(dom.window, dom.window.document, dom.window.navigator);
    const chunkFactory = chunks.get(name);
    assert.notEqual(chunkFactory, undefined, `the ${name} chunk registers itself`);
    return chunkFactory(requireModule);
  };
  const run = new Function('window', 'document', 'navigator', source);
  run(dom.window, dom.window.document, dom.window.navigator);
  assert.notEqual(factory, null, 'the bundle registers itself with the module loader');

  const tabTypes = [];
  const slotRegistrations = [];
  const commands = [];
  const ctx = {
    connection: { rpc: { call: async () => ({ ok: true, value: {} }) } },
    locale: { register() {}, bind: () => (key) => key },
    slots: {
      inject(_name, register) {
        const dispose = register();
        if (typeof dispose === 'function') dispose();
      },
      register(spec, component) {
        slotRegistrations.push({ spec, component });
        return () => {};
      },
    },
    sidebarRight: {
      active: () => undefined,
      isExpanded: () => false,
      hide() {},
      openTab() {},
      tabsIn: () => [],
      openResource() {},
    },
    sidebarRightTabs: {
      register(definition) {
        tabTypes.push(definition);
        return () => {};
      },
    },
    inject(names, callback) {
      assert.deepEqual(names, ['shortcuts']);
      callback({
        shortcuts: {
          register(command) {
            commands.push(command);
            return () => {};
          },
        },
        effect(callback) {
          const dispose = callback();
          if (typeof dispose === 'function') dispose();
        },
      });
    },
    effect(callback) {
      const dispose = callback();
      if (typeof dispose === 'function') dispose();
    },
    get: () => undefined,
  };

  const module = factory(requireModule);
  return { dom, module, ctx, tabTypes, slotRegistrations, commands };
}

test('AC-001: the bundle exports the plugin entry', async () => {
  const { module } = await loadBundle();
  assert.deepEqual(module.inject, ['connection', 'slots', 'locale', 'sidebarRightTabs', 'sidebarRight']);
  assert.equal(typeof module.apply, 'function');
});

test('AC-002: apply registers the tab type, slots, and four commands', async () => {
  const { module, ctx, tabTypes, slotRegistrations, commands } = await loadBundle();
  module.apply(ctx);

  const gitTab = tabTypes.find((definition) => definition.kind === 'git');
  assert.notEqual(gitTab, undefined, 'the git tab type is registered');
  assert.equal(gitTab.id, 'dsh-git');
  assert.equal(gitTab.priority, 'extension');
  assert.equal(typeof gitTab.title(), 'string');
  assert.equal(gitTab.guide.length, 1);
  assert.equal(gitTab.guide[0].id, 'git');

  const names = slotRegistrations.map((entry) => entry.spec.name);
  for (const expected of [
    'sidebar.right.pane.tab',
    'sidebar.right.pane.tab.title',
    'conversation.session.header.utilities',
    'conversation.hero.options',
    'settings.section',
    'settings.section.icon',
  ]) {
    assert.ok(names.includes(expected), `${expected} is registered`);
  }
  for (const entry of slotRegistrations) assert.equal(typeof entry.component, 'function');

  assert.equal(commands.length, 4);
  for (const command of commands) {
    assert.equal(typeof command.id, 'string');
    assert.deepEqual(command.defaults, {});
    assert.equal(typeof command.resolve, 'function');
  }
});

test('AC-003: the tab body renders the panel root', async () => {
  const { dom, module, ctx, slotRegistrations } = await loadBundle();
  module.apply(ctx);
  const body = slotRegistrations.find(
    (entry) => entry.spec.name === 'sidebar.right.pane.tab' && entry.spec.key === 'dsh-git',
  );
  assert.notEqual(body, undefined);

  const React = nodeRequire('react');
  const { createRoot } = nodeRequire('react-dom/client');
  const container = dom.window.document.createElement('div');
  dom.window.document.body.append(container);
  const root = createRoot(container);
  root.render(
    React.createElement(body.component, {
      call: async () => ({}),
      t: (key) => key,
      sessionId: 'session-1',
      sidebarRight: ctx.sidebarRight,
      useTabInfo: () => ({ tab: { id: 'dsh-git', visible: true }, panel: { id: 'pane-1' } }),
      useSessions: (selector) => selector({ byId: { 'session-1': { cwd: '/tmp' } } }),
      useWorkspaces: (selector) => selector({ items: [] }),
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.notEqual(container.querySelector('.gitp-root'), null, 'the panel root renders');
  root.unmount();
});

const MAIN_DIR = '/ws';
const WORKTREE_DIR = '/ws/.agents/worktrees/dsh-abc';
const NESTED_DIR = '/ws/b';

/**
 * Answer a status request the way the host does for one workspace with a
 * worktree that follows the Session.
 * @param {object} payload the request payload.
 * @returns {object} the snapshot.
 */
function worktreeStatus(payload, entries = []) {
  const dir = typeof payload.sessionDir === 'string' ? payload.sessionDir : '';
  const worktree = dir === WORKTREE_DIR || dir.startsWith(`${WORKTREE_DIR}/`);
  const nested = dir === NESTED_DIR || dir.startsWith(`${NESTED_DIR}/`);
  const root = worktree ? WORKTREE_DIR : nested ? NESTED_DIR : MAIN_DIR;
  const snapshot = {
    repo: true,
    root,
    branch: { oid: 'abc1234', name: worktree ? 'dsh-abc' : 'main', upstream: null, ahead: 0, behind: 0, detached: false, initial: false },
    entries,
    merging: false,
    rebasing: false,
    reverting: false,
    cherryPicking: false,
    conflicts: [],
    sessionRoot: root,
    worktree,
    selected: root,
    workspace: { id: 'ws-1', title: 'Project', path: MAIN_DIR },
  };
  if (payload.repo !== undefined) return snapshot;
  return {
    ...snapshot,
    repos: [
      { root: MAIN_DIR, name: '.', label: 'ws', worktree: false, branch: 'main' },
      {
        root: WORKTREE_DIR,
        name: '.agents/worktrees/dsh-abc',
        label: 'dsh-abc',
        worktree: true,
        branch: 'dsh-abc',
      },
      { root: NESTED_DIR, name: 'b', label: 'b', worktree: false, branch: 'main' },
    ],
  };
}

/**
 * Wait for one condition, with a deadline so a regression fails instead of
 * spinning.
 * @param {() => boolean} check the condition.
 * @param {string} label what the test waits for.
 * @returns {Promise<void>} resolves once the condition holds.
 */
async function until(check, label) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(label);
}

/**
 * Build one changed-file entry for the panel stub.
 * @param filePath the repository-relative path.
 * @param overrides the fields this case needs.
 * @returns the entry.
 */
function statusEntry(filePath, overrides = {}) {
  return {
    path: filePath,
    kind: 'tracked',
    index: 'M',
    worktree: 'M',
    conflicted: false,
    untracked: false,
    staged: false,
    unstaged: true,
    letter: 'M',
    both: false,
    add: 1,
    del: 0,
    stagedAdd: 0,
    stagedDel: 0,
    binary: false,
    ...overrides,
  };
}

/**
 * Build the empty diff payload the panel expects when a row is opened.
 * @param payload the diff request.
 * @returns the payload.
 */
function emptyDiff(payload) {
  return {
    path: payload.path,
    side: payload.side,
    labels: { left: '', right: '' },
    binary: false,
    conflict: false,
    left: [],
    right: [],
    leftTrailing: false,
    rightTrailing: false,
    rows: [],
    blocks: [],
    add: 0,
    del: 0,
    baseHash: null,
    targetHash: null,
    leftMissing: false,
    rightMissing: false,
  };
}

/**
 * Render the Git tab body against a stub session store. The panel is unmounted
 * after the test, so a failed assertion cannot leave the status poll running.
 * @param {object} t the test context.
 * @param {object} options the initial session row and the stored pick.
 * @returns {Promise<object>} the dom, root, container, calls, store, and re-render.
 */
async function renderPanel(t, options = {}) {
  const { dom, module, ctx, slotRegistrations } = await loadBundle();
  module.apply(ctx);
  const body = slotRegistrations.find(
    (entry) => entry.spec.name === 'sidebar.right.pane.tab' && entry.spec.key === 'dsh-git',
  );
  assert.notEqual(body, undefined);

  const React = nodeRequire('react');
  const { createRoot } = nodeRequire('react-dom/client');
  const container = dom.window.document.createElement('div');
  dom.window.document.body.append(container);
  const root = createRoot(container);
  t.after(() => {
    root.unmount();
    dom.window.close();
  });
  const calls = [];
  const store = { session: options.session ?? { cwd: MAIN_DIR } };
  const state = { entries: (options.entries ?? []).map((entry) => ({ ...entry })) };
  const snapshot = (payload) => worktreeStatus({ repo: payload.repo }, state.entries);
  const call = async (endpoint, payload) => {
    calls.push({ endpoint, payload });
    if (endpoint === 'status') return worktreeStatus(payload, state.entries);
    if (endpoint === 'diff') return options.diff === undefined ? emptyDiff(payload) : options.diff(payload);
    if (endpoint === 'stage') {
      const paths = new Set(payload.paths);
      state.entries = state.entries.map((entry) =>
        paths.has(entry.path) && entry.unstaged
          ? { ...entry, staged: true, unstaged: false, worktree: ' ' }
          : entry,
      );
      return snapshot(payload);
    }
    if (endpoint === 'unstage') {
      const paths = new Set(payload.paths);
      state.entries = state.entries.map((entry) =>
        paths.has(entry.path) && entry.staged
          ? { ...entry, staged: false, unstaged: true, index: ' ' }
          : entry,
      );
      return snapshot(payload);
    }
    if (endpoint === 'aiMessage') return { message: '', provider: null, model: null };
    if (endpoint === 'stashList') return { stashes: [] };
    if (endpoint === 'stashPush') {
      if (options.stashError) throw new Error('stash failed');
      const paths = new Set(payload.paths);
      state.entries = state.entries.filter((entry) => !paths.has(entry.path));
      return { status: snapshot(payload), stashes: [] };
    }
    if (endpoint === 'discard') {
      const paths = new Set(payload.paths);
      state.entries = state.entries.filter((entry) => !paths.has(entry.path));
      return snapshot(payload);
    }
    return {};
  };
  const props = {
    call,
    t: (key) => key,
    sessionId: 'session-1',
    sidebarRight: ctx.sidebarRight,
    useTabInfo: () => ({ tab: { id: 'dsh-git', visible: true }, panel: { id: 'pane-1' } }),
    useSessions: (selector) => selector({ byId: { 'session-1': store.session } }),
    useWorkspaces: (selector) =>
      selector({ items: [{ workspaceId: 'ws-1', path: MAIN_DIR, sessionIds: ['session-1'] }] }),
  };
  if (options.stored !== undefined) dom.window.localStorage.setItem('dsh-git.repo.ws-1', options.stored);
  if (options.compact) {
    const previous = {
      observer: globalThis.ResizeObserver,
      frame: globalThis.requestAnimationFrame,
      cancel: globalThis.cancelAnimationFrame,
    };
    globalThis.ResizeObserver = class {
      constructor(callback) {
        this.callback = callback;
      }
      observe() {
        this.callback([{ contentRect: { width: 620 } }]);
      }
      disconnect() {}
    };
    globalThis.requestAnimationFrame = (callback) => {
      callback(0);
      return 1;
    };
    globalThis.cancelAnimationFrame = () => {};
    t.after(() => {
      globalThis.ResizeObserver = previous.observer;
      globalThis.requestAnimationFrame = previous.frame;
      globalThis.cancelAnimationFrame = previous.cancel;
    });
  }
  const render = () => root.render(React.createElement(body.component, props));
  render();
  await new Promise((resolve) => setTimeout(resolve, 40));
  return { dom, root, container, calls, store, state, render };
}

test('AC-080: the panel sends the Session working directory and opens its worktree', async (t) => {
  const panel = await renderPanel(t, {
    session: { cwd: MAIN_DIR, projectionValues: { workingDirectory: WORKTREE_DIR } },
  });
  const statusCalls = panel.calls.filter((entry) => entry.endpoint === 'status');
  assert.ok(statusCalls.length > 0, 'the panel asks for the status');
  assert.equal(statusCalls[0].payload.sessionDir, WORKTREE_DIR);

  const label = panel.container.querySelector('.gitp-worktree');
  assert.notEqual(label, null, 'the Worktree label renders');
  assert.equal(label.textContent, 'repo.worktree');
});

test('AC-080: the panel falls back to the row cwd when the projection is missing', async (t) => {
  const panel = await renderPanel(t, { session: { cwd: MAIN_DIR } });
  const first = panel.calls.find((entry) => entry.endpoint === 'status');
  assert.equal(first.payload.sessionDir, MAIN_DIR);
  assert.equal(panel.container.querySelector('.gitp-worktree'), null);
});

test('AC-081: the open panel follows the Session into a worktree', async (t) => {
  const panel = await renderPanel(t, { session: { cwd: MAIN_DIR } });
  assert.equal(panel.container.querySelector('.gitp-worktree'), null, 'the panel starts on the main checkout');

  panel.store.session = { cwd: MAIN_DIR, projectionValues: { workingDirectory: WORKTREE_DIR } };
  panel.render();
  await until(
    () => panel.container.querySelector('.gitp-worktree') !== null,
    'the panel switched to the worktree',
  );
  assert.notEqual(panel.container.querySelector('.gitp-worktree'), null, 'the panel switched to the worktree');
  const repoSends = panel.calls.filter((entry) => entry.endpoint === 'status' && entry.payload.repo === WORKTREE_DIR);
  assert.ok(repoSends.length > 0, 'the panel reads the worktree status');
});


test('AC-079: a stored pick wins, and the Session checkout is the fallback', async (t) => {
  const stored = await renderPanel(t, {
    session: { cwd: MAIN_DIR, projectionValues: { workingDirectory: MAIN_DIR } },
    stored: NESTED_DIR,
  });
  const storedSends = stored.calls.filter((entry) => entry.endpoint === 'status' && entry.payload.repo !== undefined);
  assert.ok(storedSends.length > 0, 'the panel reads a repository');
  assert.equal(storedSends[0].payload.repo, NESTED_DIR, 'the stored pick is kept');

  const fallback = await renderPanel(t, {
    session: { cwd: NESTED_DIR, projectionValues: { workingDirectory: NESTED_DIR } },
  });
  const fallbackSends = fallback.calls.filter((entry) => entry.endpoint === 'status' && entry.payload.repo !== undefined);
  assert.equal(fallbackSends[0].payload.repo, NESTED_DIR, 'with no stored pick the Session checkout wins over the first');
});

test('AC-081: a manual pick survives a move inside the same checkout', async (t) => {
  const panel = await renderPanel(t, {
    session: { cwd: MAIN_DIR, projectionValues: { workingDirectory: WORKTREE_DIR } },
  });
  assert.notEqual(panel.container.querySelector('.gitp-worktree'), null, 'the panel starts on the worktree');
  assert.equal(
    panel.dom.window.localStorage.getItem('dsh-git.repo.ws-1'),
    null,
    'a worktree the Session chose is not stored',
  );

  panel.container.querySelector('.gitp-repo-pick').click();
  await until(
    () => panel.container.querySelectorAll('.gitp-popover-row').length > 0,
    'the picker opens',
  );
  const mainRow = [...panel.container.querySelectorAll('.gitp-popover-row')].find((row) => row.title === MAIN_DIR);
  assert.notEqual(mainRow, undefined, 'the main checkout is in the picker');
  mainRow.click();
  await until(
    () => panel.container.querySelector('.gitp-worktree') === null,
    'the panel switched to the main checkout',
  );
  assert.equal(panel.container.querySelector('.gitp-worktree'), null, 'the panel switched to the main checkout');

  panel.store.session = { cwd: MAIN_DIR, projectionValues: { workingDirectory: `${WORKTREE_DIR}/src` } };
  panel.render();
  await new Promise((resolve) => setTimeout(resolve, 40));

  assert.equal(
    panel.container.querySelector('.gitp-worktree'),
    null,
    'a cd inside the same checkout keeps the manual pick',
  );
});


test('AC-082: a modified click adds a second file and opens the batch bar', async (t) => {
  const panel = await renderPanel(t, {
    entries: [statusEntry('a.txt'), statusEntry('b.txt'), statusEntry('c.txt')],
  });
  await until(() => panel.container.querySelectorAll('.gitp-filerow').length === 3, 'three rows render');
  const rows = () => [...panel.container.querySelectorAll('.gitp-filerow')];

  rows()[0].click();
  await until(
    () => panel.container.querySelectorAll('.gitp-filerow.is-selected').length === 1,
    'one file is selected',
  );
  assert.equal(panel.container.querySelector('.gitp-batchbar'), null, 'the bar stays hidden for one file');

  rows()[1].dispatchEvent(new panel.dom.window.MouseEvent('click', { bubbles: true, metaKey: true }));
  await until(() => panel.container.querySelector('.gitp-batchbar') !== null, 'the batch bar appears');
  assert.equal(panel.container.querySelectorAll('.gitp-filerow.is-selected').length, 2, 'two files are selected');
  assert.notEqual(panel.container.querySelector('[aria-label="selection.discard"]'), null, 'Discard is offered');
  assert.equal(
    panel.container.querySelector('[aria-label="selection.unstage"]').disabled,
    true,
    'Unstage is disabled when no staged file is selected',
  );

  panel.container.querySelector('[aria-label="selection.clear"]').click();
  await until(() => panel.container.querySelector('.gitp-batchbar') === null, 'Clear hides the bar');
  assert.equal(panel.container.querySelectorAll('.gitp-filerow.is-selected').length, 0, 'Clear drops the rows');
});

test('AC-083: Shift-click selects the inclusive range, and a filter resets it', async (t) => {
  const panel = await renderPanel(t, {
    entries: [statusEntry('a.txt'), statusEntry('b.txt'), statusEntry('c.txt')],
  });
  await until(() => panel.container.querySelectorAll('.gitp-filerow').length === 3, 'three rows render');
  const rows = [...panel.container.querySelectorAll('.gitp-filerow')];

  rows[0].click();
  await until(
    () => panel.container.querySelectorAll('.gitp-filerow.is-selected').length === 1,
    'the first file is selected',
  );
  rows[2].dispatchEvent(new panel.dom.window.MouseEvent('click', { bubbles: true, shiftKey: true }));
  await until(
    () => panel.container.querySelectorAll('.gitp-filerow.is-selected').length === 3,
    'the range selects three files',
  );
  assert.notEqual(panel.container.querySelector('.gitp-batchbar'), null, 'the batch bar appears');
  assert.equal(panel.container.querySelector('.gitp-batch-count').textContent, 'selection.count');

  const input = panel.container.querySelector('.gitp-filter-box input');
  const setValue = Object.getOwnPropertyDescriptor(panel.dom.window.HTMLInputElement.prototype, 'value').set;
  setValue.call(input, 'a');
  input.dispatchEvent(new panel.dom.window.Event('input', { bubbles: true }));
  await until(() => panel.container.querySelector('.gitp-batchbar') === null, 'the filter clears the batch');
  assert.equal(
    panel.container.querySelectorAll('.gitp-filerow.is-selected').length,
    0,
    'the hidden picks are dropped',
  );
});

test('AC-084: Stage sends every selected unstaged path and clears the batch', async (t) => {
  const panel = await renderPanel(t, {
    entries: [statusEntry('a.txt', { kind: 'renamed', from: 'old-a.txt' }), statusEntry('b.txt'), statusEntry('c.txt')],
  });
  await until(() => panel.container.querySelectorAll('.gitp-filerow').length === 3, 'three rows render');
  const rows = () => [...panel.container.querySelectorAll('.gitp-filerow')];

  rows()[0].click();
  await until(
    () => panel.container.querySelectorAll('.gitp-filerow.is-selected').length === 1,
    'the first file is selected',
  );
  rows()[1].dispatchEvent(new panel.dom.window.MouseEvent('click', { bubbles: true, metaKey: true }));
  await until(() => panel.container.querySelector('.gitp-batchbar') !== null, 'the batch bar appears');

  panel.container.querySelector('[aria-label="selection.stage"]').click();
  await until(() => panel.calls.some((entry) => entry.endpoint === 'stage'), 'the stage request is sent');
  const stageCall = panel.calls.find((entry) => entry.endpoint === 'stage');
  assert.deepEqual(stageCall.payload.paths, ['a.txt', 'old-a.txt', 'b.txt']);
  assert.equal(stageCall.payload.workspaceId, 'ws-1');

  await until(() => panel.container.querySelector('.gitp-batchbar') === null, 'the action clears the batch');
  assert.equal(
    panel.container.querySelectorAll('.gitp-filerow.is-selected').length,
    0,
    'the action clears the row highlight',
  );
  assert.equal(panel.state.entries.find((entry) => entry.path === 'a.txt').staged, true);
  assert.equal(panel.state.entries.find((entry) => entry.path === 'b.txt').staged, true);
  assert.equal(panel.state.entries.find((entry) => entry.path === 'c.txt').staged, false);
});

test('AC-085: Unstage sends every selected staged path and clears the batch', async (t) => {
  const panel = await renderPanel(t, {
    entries: [
      statusEntry('a.txt', { staged: true, unstaged: false, worktree: ' ' }),
      statusEntry('b.txt', { staged: true, unstaged: false, worktree: ' ' }),
    ],
  });
  await until(() => panel.container.querySelectorAll('.gitp-filerow').length === 2, 'two rows render');
  const rows = [...panel.container.querySelectorAll('.gitp-filerow')];

  rows[0].click();
  await until(
    () => panel.container.querySelectorAll('.gitp-filerow.is-selected').length === 1,
    'the first file is selected',
  );
  rows[1].dispatchEvent(new panel.dom.window.MouseEvent('click', { bubbles: true, metaKey: true }));
  await until(() => panel.container.querySelector('.gitp-batchbar') !== null, 'the batch bar appears');

  panel.container.querySelector('[aria-label="selection.unstage"]').click();
  await until(() => panel.calls.some((entry) => entry.endpoint === 'unstage'), 'the unstage request is sent');
  const unstageCall = panel.calls.find((entry) => entry.endpoint === 'unstage');
  assert.deepEqual(unstageCall.payload.paths, ['a.txt', 'b.txt']);

  await until(() => panel.container.querySelector('.gitp-batchbar') === null, 'the action clears the batch');
  assert.equal(panel.state.entries.find((entry) => entry.path === 'a.txt').staged, false);
  assert.equal(panel.state.entries.find((entry) => entry.path === 'b.txt').staged, false);
});

test('AC-086: Discard confirms the set; a conflict click keeps the picks', async (t) => {
  const panel = await renderPanel(t, {
    entries: [
      statusEntry('conflict.txt', {
        kind: 'unmerged',
        index: 'U',
        worktree: 'U',
        letter: 'U',
        conflicted: true,
        staged: true,
      }),
      statusEntry('staged.txt', { staged: true, unstaged: false, worktree: ' ' }),
      statusEntry('local.txt'),
    ],
  });
  await until(() => panel.container.querySelectorAll('.gitp-filerow').length === 3, 'three rows render');
  const rows = () => [...panel.container.querySelectorAll('.gitp-filerow')];

  rows()[1].click();
  await until(
    () => panel.container.querySelectorAll('.gitp-filerow.is-selected').length === 1,
    'the staged file is selected',
  );
  rows()[2].dispatchEvent(new panel.dom.window.MouseEvent('click', { bubbles: true, metaKey: true }));
  await until(() => panel.container.querySelector('.gitp-batchbar') !== null, 'the batch bar appears');

  rows()[0].dispatchEvent(new panel.dom.window.MouseEvent('click', { bubbles: true, metaKey: true }));
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.notEqual(panel.container.querySelector('.gitp-batchbar'), null, 'the conflict click keeps the batch');
  assert.equal(
    panel.container.querySelectorAll('.gitp-filerow.is-selected').length,
    2,
    'the two picks survive the conflict click',
  );

  assert.equal(
    panel.calls.filter((entry) => entry.endpoint === 'discard').length,
    0,
    'nothing is discarded before the confirmation',
  );
  panel.container.querySelector('[aria-label="selection.discard"]').click();
  await until(() => panel.container.querySelector('.gitp-modal-title') !== null, 'the confirmation opens');
  assert.equal(panel.container.querySelector('.gitp-modal-title').textContent, 'discard.titleMany');
  assert.deepEqual(
    [...panel.container.querySelectorAll('.gitp-confirm-paths li')].map((item) => item.textContent),
    ['staged.txt', 'local.txt'],
  );

  panel.container.querySelector('.gitp-modal-actions .is-danger').click();
  await until(() => panel.calls.some((entry) => entry.endpoint === 'discard'), 'the discard request is sent');
  const discardCall = panel.calls.find((entry) => entry.endpoint === 'discard');
  assert.deepEqual(discardCall.payload.paths, ['staged.txt', 'local.txt']);
  assert.equal(discardCall.payload.confirm, true);
  await until(() => panel.container.querySelector('.gitp-batchbar') === null, 'the action clears the batch');
  assert.deepEqual(panel.state.entries.map((entry) => entry.path), ['conflict.txt']);
});

test('AC-087: the bar hides below two picks and each control names itself', async (t) => {
  const panel = await renderPanel(t, {
    entries: [
      statusEntry('a.txt', { staged: true, unstaged: false, worktree: ' ' }),
      statusEntry('d.txt', { staged: true, unstaged: false, worktree: ' ' }),
      statusEntry('b.txt'),
    ],
  });
  await until(() => panel.container.querySelectorAll('.gitp-filerow').length === 3, 'three rows render');
  const rows = () => [...panel.container.querySelectorAll('.gitp-filerow')];

  assert.equal(panel.container.querySelector('.gitp-batchbar'), null, 'the bar hides with no selection');
  rows()[0].click();
  await until(
    () => panel.container.querySelectorAll('.gitp-filerow.is-selected').length === 1,
    'one staged file is selected',
  );
  assert.equal(panel.container.querySelector('.gitp-batchbar'), null, 'the bar hides with one pick');

  rows()[1].dispatchEvent(new panel.dom.window.MouseEvent('click', { bubbles: true, metaKey: true }));
  await until(() => panel.container.querySelector('.gitp-batchbar') !== null, 'the batch bar appears');
  assert.equal(panel.container.querySelector('[aria-label="selection.stage"]').disabled, true);
  assert.equal(panel.container.querySelector('[aria-label="selection.unstage"]').disabled, false);
  const buttons = [...panel.container.querySelectorAll('.gitp-batch-btn')];
  assert.equal(buttons.length, 5, 'the bar has five controls, including Stash');
  for (const button of buttons) {
    assert.equal(button.title, button.getAttribute('aria-label'));
    assert.notEqual(button.getAttribute('aria-label'), null);
  }
  assert.equal(rows()[0].getAttribute('aria-pressed'), 'true');
});

test('AC-088: compact mode keeps the list while a batch is selected', async (t) => {
  const panel = await renderPanel(t, {
    compact: true,
    entries: [statusEntry('a.txt'), statusEntry('b.txt')],
  });
  await until(() => panel.container.querySelectorAll('.gitp-filerow').length === 2, 'rows render in compact');
  const rowAt = (index) => panel.container.querySelectorAll('.gitp-filerow')[index];
  assert.notEqual(panel.container.querySelector('.gitp-listcol'), null, 'the list starts visible');

  rowAt(0).dispatchEvent(new panel.dom.window.MouseEvent('click', { bubbles: true, metaKey: true }));
  await until(
    () => panel.container.querySelector('.gitp-listcol') !== null,
    'the list stays after a modified click',
  );
  rowAt(1).dispatchEvent(new panel.dom.window.MouseEvent('click', { bubbles: true, metaKey: true }));
  await until(() => panel.container.querySelector('.gitp-batchbar') !== null, 'the bar appears in compact');
  assert.notEqual(panel.container.querySelector('.gitp-listcol'), null, 'the list stays visible');
  assert.equal(panel.container.querySelector('.gitp-diffcol'), null, 'the diff does not take the pane');

  panel.container.querySelector('[aria-label="selection.stage"]').click();
  await until(() => panel.container.querySelector('.gitp-batchbar') === null, 'the action clears the batch');
  assert.notEqual(panel.container.querySelector('.gitp-listcol'), null, 'the list remains after the action');
});

test('AC-089: Ctrl+Space toggles rows from the keyboard', async (t) => {
  const panel = await renderPanel(t, {
    entries: [statusEntry('a.txt'), statusEntry('b.txt')],
  });
  await until(() => panel.container.querySelectorAll('.gitp-filerow').length === 2, 'two rows render');
  const rows = () => [...panel.container.querySelectorAll('.gitp-filerow')];

  rows()[0].focus();
  rows()[0].dispatchEvent(
    new panel.dom.window.KeyboardEvent('keydown', { key: ' ', bubbles: true, ctrlKey: true }),
  );
  await until(
    () => panel.container.querySelectorAll('.gitp-filerow.is-selected').length === 1,
    'the first row toggles from the keyboard',
  );
  rows()[1].dispatchEvent(
    new panel.dom.window.KeyboardEvent('keydown', { key: ' ', bubbles: true, ctrlKey: true }),
  );
  await until(() => panel.container.querySelector('.gitp-batchbar') !== null, 'the bar appears from the keyboard');
  assert.equal(panel.container.querySelectorAll('.gitp-filerow.is-selected').length, 2);
});


test('AC-090 and AC-093: single staged file opens stash and cancel preserves it', async (t) => {
  const panel = await renderPanel(t, { entries: [statusEntry('staged.txt', { staged: true, unstaged: false })] });
  await until(() => panel.container.querySelector('.gitp-filerow'), 'file appears');
  panel.container.querySelector('.gitp-filerow').click();
  await until(() => panel.container.querySelector('.gitp-diff-head [aria-label="action.stash"]'), 'stash control appears');
  panel.container.querySelector('.gitp-diff-head [aria-label="action.stash"]').click();
  await until(() => panel.container.querySelector('.gitp-filechecks'), 'stash dialog opens');
  assert.match(panel.container.querySelector('.gitp-filechecks').textContent, /staged.txt/);
  assert.match(panel.container.textContent, /stash.selectHint/);
  [...panel.container.querySelectorAll('.gitp-modal-actions button')].find((button) => button.textContent === 'action.cancel').click();
  assert.equal(panel.calls.some((call) => call.endpoint === 'stashPush'), false);
  assert.equal(panel.state.entries.length, 1);
});

test('AC-091 and AC-092: batch stash deduplicates selected paths and clears the selection', async (t) => {
  const panel = await renderPanel(t, { entries: [statusEntry('both.txt', { staged: true, unstaged: true, both: true }), statusEntry('other.txt')] });
  await until(() => panel.container.querySelectorAll('.gitp-filerow').length === 3, 'rows appear');
  const rows = [...panel.container.querySelectorAll('.gitp-filerow')];
  rows[0].click();
  await until(() => panel.container.querySelectorAll('.gitp-filerow.is-selected').length === 1, 'one selected');
  rows[1].dispatchEvent(new panel.dom.window.MouseEvent('click', { bubbles: true, ctrlKey: true }));
  await until(() => panel.container.querySelector('.gitp-batchbar'), 'batch bar appears');
  panel.container.querySelector('.gitp-batchbar [aria-label="action.stash"]').click();
  await until(() => panel.container.querySelector('.gitp-filechecks'), 'dialog opens');
  assert.equal(panel.container.querySelectorAll('.gitp-filechecks input').length, 1);
  [...panel.container.querySelectorAll('.gitp-modal-actions button')].find((button) => button.textContent === 'action.stash').click();
  await until(() => panel.calls.some((call) => call.endpoint === 'stashPush'), 'stash call sent');
  assert.deepEqual(panel.calls.find((call) => call.endpoint === 'stashPush').payload.paths, ['both.txt']);
  await until(() => panel.container.querySelector('.gitp-filechecks') === null, 'dialog closed');
  assert.deepEqual(panel.state.entries.map((entry) => entry.path), ['other.txt']);
});

test('AC-096: stash failure leaves the dialog and selection intact', async (t) => {
  const panel = await renderPanel(t, { entries: [statusEntry('a.txt')], stashError: true });
  await until(() => panel.container.querySelector('.gitp-filerow'), 'file appears');
  panel.container.querySelector('.gitp-filerow').click();
  await until(() => panel.container.querySelector('.gitp-diff-head [aria-label="action.stash"]'), 'stash control appears');
  panel.container.querySelector('.gitp-diff-head [aria-label="action.stash"]').click();
  await until(() => panel.container.querySelector('.gitp-filechecks'), 'dialog opens');
  [...panel.container.querySelectorAll('.gitp-modal-actions button')].find((button) => button.textContent === 'action.stash').click();
  await until(() => panel.container.querySelector('.gitp-modal-error'), 'failure appears');
  assert.match(panel.container.querySelector('.gitp-modal-error').textContent, /stash failed/);
  assert.equal(panel.state.entries.length, 1);
  assert.notEqual(panel.container.querySelector('.gitp-filerow.is-selected'), null);
});

test('AC-097: Stashes offers staged-only files', async (t) => {
  const panel = await renderPanel(t, { entries: [statusEntry('staged.txt', { staged: true, unstaged: false })] });
  await until(() => panel.container.querySelector('[aria-label="mode.stash"]'), 'mode selector appears');
  panel.container.querySelector('[aria-label="mode.stash"]').click();
  await until(() => panel.container.querySelector('.gitp-stash-head button'), 'stash view appears');
  const button = panel.container.querySelector('.gitp-stash-head button');
  assert.equal(button.disabled, false);
  button.click();
  await until(() => panel.container.querySelector('.gitp-filechecks'), 'stash dialog appears');
  assert.match(panel.container.querySelector('.gitp-filechecks').textContent, /staged.txt/);
});

test('AC-098 and AC-100: the split diff divider moves from the keyboard and stores its share', async (t) => {
  const panel = await renderPanel(t, { entries: [statusEntry('a.txt')] });
  await until(() => panel.container.querySelector('.gitp-filerow'), 'file appears');
  panel.container.querySelector('.gitp-filerow').click();
  await until(() => panel.container.querySelector('.gitp-panes'), 'the split diff renders');

  const handles = [...panel.container.querySelectorAll('.gitp-panes [role="separator"]')];
  assert.equal(handles.length, 1, 'one divider sits between the panes');
  const handle = handles[0];
  assert.equal(handle.getAttribute('aria-label'), 'split.panes');
  assert.equal(handle.getAttribute('aria-valuenow'), '50');
  assert.equal(handle.tabIndex, 0, 'the divider is focusable');
  const panes = [...panel.container.querySelectorAll('.gitp-panes .gitp-pane')];
  assert.deepEqual(
    panes.map((pane) => pane.style.flexGrow),
    ['0.5', '0.5'],
    'the panes start out even',
  );

  handle.dispatchEvent(new panel.dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  await until(
    () => panel.dom.window.localStorage.getItem('dsh-git.diffsplit') === '0.52',
    'the share is stored',
  );
  assert.equal(handle.getAttribute('aria-valuenow'), '52');
  assert.deepEqual(
    panes.map((pane) => pane.style.flexGrow),
    ['0.52', '0.48'],
    'both panes follow the divider',
  );

  handle.dispatchEvent(new panel.dom.window.KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
  await until(
    () => panel.dom.window.localStorage.getItem('dsh-git.diffsplit') === '0.5',
    'Home resets the divider to half',
  );
  const heads = [...panel.container.querySelectorAll('.gitp-pane-heads .gitp-pane-head')];
  assert.deepEqual(
    heads.map((head) => head.style.flexGrow),
    ['0.5', '0.5'],
    'the pane headers follow the same share',
  );
});

test('AC-101: the unified diff has no pane divider', async (t) => {
  const panel = await renderPanel(t, { entries: [statusEntry('a.txt')] });
  await until(() => panel.container.querySelector('.gitp-filerow'), 'file appears');
  panel.container.querySelector('.gitp-filerow').click();
  await until(() => panel.container.querySelector('.gitp-panes'), 'the split diff renders');

  panel.container.querySelector('[aria-label="diff.unified"]').click();
  await until(() => panel.container.querySelector('.gitp-unified'), 'the unified diff renders');
  assert.equal(
    panel.container.querySelector('[role="separator"][aria-label="split.panes"]'),
    null,
    'the single pane has no divider',
  );
});

/**
 * Build a TypeScript diff with one changed line, for the highlighting cases.
 * @param payload the diff request.
 * @returns the payload.
 */
function codeDiff(payload) {
  return {
    ...emptyDiff(payload),
    path: payload.path,
    left: ['export function total(value: number): number {', '  return value', '}'],
    right: ['export function total(value: number): number {', '  return value + 1', '}'],
    rows: [
      { l: 1, r: 1, k: 'ctx' },
      { l: 2, r: 2, k: 'mod' },
      { l: 3, r: 3, k: 'ctx' },
    ],
    blocks: [{ id: 'b1', leftStart: 2, leftEnd: 2, rightStart: 2, rightEnd: 2, kind: 'mod', row: 1 }],
    add: 1,
    del: 1,
  };
}

/** One line long enough that 240 of them pass the highlight size cap. */
const LONG_LINE = `const value = "${'x'.repeat(880)}";`;

/**
 * Build a diff whose sides are over the highlight size cap.
 * @param payload the diff request.
 * @returns the payload.
 */
function longDiff(payload) {
  const lines = Array.from({ length: 240 }, () => LONG_LINE);
  return {
    ...emptyDiff(payload),
    path: payload.path,
    left: lines,
    right: lines,
    rows: lines.map((unused, index) => ({ l: index + 1, r: index + 1, k: 'ctx' })),
  };
}

/**
 * Open the first changed file and return the rendered panel.
 * @param t the test context.
 * @param options the entries and the diff the stub serves.
 * @returns the panel.
 */
async function openDiff(t, options) {
  const panel = await renderPanel(t, options);
  await until(() => panel.container.querySelector('.gitp-filerow') !== null, 'the file appears');
  panel.container.querySelector('.gitp-filerow').click();
  await until(() => panel.container.querySelector('.gitp-diff-head') !== null, 'the diff renders');
  return panel;
}

test('AC-116: a supported diff renders tokens and keeps every row text exact', async (t) => {
  const panel = await openDiff(t, { entries: [statusEntry('total.ts')], diff: codeDiff });
  await until(() => panel.container.querySelector('.gitp-hl-keyword') !== null, 'tokens arrive with the chunk');

  const [leftPane] = panel.container.querySelectorAll('.gitp-pane');
  assert.deepEqual(
    [...leftPane.querySelectorAll('.gitp-code')].map((row) => row.textContent),
    ['export function total(value: number): number {', '  return value', '}'],
    'every row keeps its source text',
  );
  assert.equal(panel.container.querySelector('.gitp-hl-keyword').textContent, 'export');
  assert.equal(panel.container.querySelector('.gitp-hl-type').textContent, 'number');
});

test('AC-117: a changed middle keeps its tokens inside the word background', async (t) => {
  const panel = await openDiff(t, { entries: [statusEntry('total.ts')], diff: codeDiff });
  await until(() => panel.container.querySelector('.gitp-hl-number') !== null, 'tokens arrive');

  const [, rightPane] = panel.container.querySelectorAll('.gitp-pane');
  const word = rightPane.querySelector('.gitp-line.is-add .gitp-word');
  assert.notEqual(word, null, 'the changed middle is marked');
  assert.equal(word.textContent, ' + 1');
  assert.equal(word.querySelector('.gitp-hl-number').textContent, '1', 'the number keeps its token color');
});

test('AC-118: the unified diff highlights through the same tokens', async (t) => {
  const panel = await openDiff(t, { entries: [statusEntry('total.ts')], diff: codeDiff });
  panel.container.querySelector('[aria-label="diff.unified"]').click();
  await until(() => panel.container.querySelector('.gitp-unified') !== null, 'the unified diff renders');
  await until(
    () => panel.container.querySelector('.gitp-ucontent .gitp-hl-keyword') !== null,
    'tokens render in the unified diff',
  );
  assert.equal(panel.container.querySelector('.gitp-ucontent .gitp-hl-keyword').textContent, 'export');
});

test('AC-119: an unknown suffix renders plain text', async (t) => {
  const panel = await openDiff(t, { entries: [statusEntry('notes.unknown')], diff: codeDiff });
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(panel.container.querySelector('[class*="gitp-hl-"]'), null, 'no token spans');
  assert.equal(
    panel.container.querySelector('.gitp-code').textContent,
    'export function total(value: number): number {',
    'the row still reads as the source line',
  );
});

test('AC-121: the commit message request carries the Session id', async (t) => {
  const panel = await renderPanel(t, {
    entries: [statusEntry('a.txt', { staged: true, unstaged: false, index: 'M', worktree: ' ' })],
  });
  panel.container.querySelector('.gitp-ai-wrap button').click();
  await until(
    () => panel.container.querySelectorAll('.gitp-popover-row').length > 0,
    'the AI menu opened',
  );
  const row = [...panel.container.querySelectorAll('.gitp-popover-row')].find(
    (item) => item.textContent === 'ai.write',
  );
  assert.notEqual(row, undefined, 'the write row is in the menu');
  row.click();
  await until(
    () => panel.calls.some((entry) => entry.endpoint === 'aiMessage'),
    'the panel asks for a commit message',
  );
  const send = panel.calls.find((entry) => entry.endpoint === 'aiMessage');
  assert.equal(send.payload.sessionId, 'session-1');
});

test('AC-120: a side over the size cap renders plain text', async (t) => {
  const panel = await openDiff(t, { entries: [statusEntry('large.ts')], diff: longDiff });
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(panel.container.querySelector('[class*="gitp-hl-"]'), null, 'no token spans');
  assert.equal(panel.container.querySelectorAll('.gitp-pane')[0].querySelectorAll('.gitp-code').length, 240);
  assert.equal(panel.container.querySelector('.gitp-code').textContent, LONG_LINE);
});

test('AC-118: token colors resolve through the host palette, never a literal color', async (t) => {
  const panel = await openDiff(t, { entries: [statusEntry('total.ts')], diff: codeDiff });
  await until(() => panel.container.querySelector('.gitp-hl-keyword') !== null, 'tokens arrive');

  const sheet = panel.dom.window.document.querySelector('style[data-plugin-css="dsh-git-desk/styles"]');
  assert.notEqual(sheet, null, 'the plugin stylesheet installs once at module scope');
  const rules = sheet.textContent.split('}').filter((rule) => rule.includes('.gitp-hl-'));
  assert.ok(rules.length >= 10, 'the token rules are in the stylesheet');
  for (const rule of rules) {
    assert.doesNotMatch(rule, /#[0-9a-fA-F]{3,8}/, `${rule.trim()} holds no literal color`);
    if (!rule.includes('color:')) continue;
    assert.match(rule, /(?:^|[;{])color:var\(--(?:shiki|dsw)-/, `${rule.trim()} reads a theme variable`);
  }
});

test('AC-119: the conflict and binary views render no tokens', async (t) => {
  const conflict = await openDiff(t, {
    entries: [statusEntry('conflict.txt', { kind: 'unmerged', conflicted: true, index: 'U', worktree: 'U' })],
    diff: (payload) => ({
      ...emptyDiff(payload),
      conflict: true,
      right: ['<<<<<<< HEAD', 'const value = 1;', '=======', 'const value = 2;', '>>>>>>> other'],
    }),
  });
  await until(() => conflict.container.querySelector('.gitp-urow') !== null, 'the conflict view renders');
  assert.equal(conflict.container.querySelector('[class*="gitp-hl-"]'), null, 'no tokens in the conflict view');
  assert.match(conflict.container.querySelector('.gitp-unified').textContent, /const value = 1;/);

  const binary = await openDiff(t, {
    entries: [statusEntry('logo.png', { binary: true })],
    diff: (payload) => ({ ...emptyDiff(payload), binary: true, leftSize: 10, rightSize: 12 }),
  });
  await until(() => binary.container.querySelector('.gitp-binary') !== null, 'the binary view renders');
  assert.equal(binary.container.querySelector('[class*="gitp-hl-"]'), null, 'no tokens in the binary view');
});
