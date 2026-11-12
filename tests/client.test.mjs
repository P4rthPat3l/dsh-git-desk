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
  dom.window.__ModuleLoader__ = {
    load(config) {
      factory = config.factory;
    },
  };
  const react = nodeRequire('react');
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

  const module = factory(() => react);
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
    if (endpoint === 'diff') return emptyDiff(payload);
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
  assert.equal(buttons.length, 4, 'the bar has four controls');
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
