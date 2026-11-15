import { test } from 'node:test';
import assert from 'node:assert/strict';

test('the host entry exposes the plugin contract', async () => {
  const module = await import('../dist/host/index.js');
  assert.deepEqual(module.inject, ['subprocess', 'workspaceRegistry', 'connection', 'webServer']);
  assert.equal(typeof module.apply, 'function');
});

test('AC-121: the model request carries the Session id for routing', async () => {
  const { writeCommitMessage } = await import('../dist/host/lib/ai.js');
  const requests = [];
  const llm = {
    listProviders: () => [],
    listModels: async () => [],
    stream(request) {
      requests.push(request);
      return (async function* chunks() {
        yield { type: 'text-delta', text: 'chore(repo): tidy the desk' };
        yield { type: 'finish', reason: { kind: 'stop' } };
      })();
    },
  };
  const ctx = { get: (name) => (name === 'llm' ? llm : undefined) };
  const base = {
    patch: 'diff --git a/a.txt b/a.txt',
    recent: [],
    signal: new AbortController().signal,
    model: { provider: 'opencode-go', model: 'some-model' },
    instruction: '',
  };
  await writeCommitMessage(ctx, { ...base, sessionId: 'session-1' });
  await writeCommitMessage(ctx, base);
  assert.equal(requests[0].sessionId, 'session-1');
  assert.equal('sessionId' in requests[1], false, 'a caller without a Session sends no id');
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
