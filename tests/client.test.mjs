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
function worktreeStatus(payload) {
  const dir = typeof payload.sessionDir === 'string' ? payload.sessionDir : '';
  const worktree = dir === WORKTREE_DIR || dir.startsWith(`${WORKTREE_DIR}/`);
  const nested = dir === NESTED_DIR || dir.startsWith(`${NESTED_DIR}/`);
  const root = worktree ? WORKTREE_DIR : nested ? NESTED_DIR : MAIN_DIR;
  const snapshot = {
    repo: true,
    root,
    branch: { oid: 'abc1234', name: worktree ? 'dsh-abc' : 'main', upstream: null, ahead: 0, behind: 0, detached: false, initial: false },
    entries: [],
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
  const call = async (endpoint, payload) => {
    calls.push({ endpoint, payload });
    return endpoint === 'status' ? worktreeStatus(payload) : {};
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
  const render = () => root.render(React.createElement(body.component, props));
  render();
  await new Promise((resolve) => setTimeout(resolve, 40));
  return { dom, root, container, calls, store, render };
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

