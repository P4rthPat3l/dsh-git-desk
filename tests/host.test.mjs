import { test } from 'node:test';
import assert from 'node:assert/strict';

test('the host entry exposes the plugin contract', async () => {
  const module = await import('../dist/host/index.js');
  assert.deepEqual(module.inject, ['subprocess', 'workspaceRegistry', 'connection', 'webServer']);
  assert.equal(typeof module.apply, 'function');
});

test('the host registers one prefix route on apply', async () => {
  const module = await import('../dist/host/index.js');
  const routes = [];
  const effects = [];
  const ctx = {
    subprocess: {
      resolveExecutable: async () => '/usr/bin/git',
      spawn: () => {
        throw new Error('not used');
      },
    },
    workspaceRegistry: { get: () => undefined },
    connection: { admit: () => ({ peer: { principal: { kind: 'owner' } } }) },
    webServer: {
      register(route) {
        routes.push(route);
        return () => {};
      },
    },
    get: () => undefined,
    effect(callback, label) {
      effects.push(label);
      const dispose = callback();
      if (typeof dispose === 'function') dispose();
    },
  };
  module.apply(ctx);
  assert.equal(routes.length, 1);
  assert.equal(routes[0].kind, 'prefix');
  assert.equal(routes[0].path, '/git-rpc');
  assert.equal(typeof routes[0].handler, 'function');
  assert.deepEqual(effects, ['dsh-git: authenticated Git channel']);
});
