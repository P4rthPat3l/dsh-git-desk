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
