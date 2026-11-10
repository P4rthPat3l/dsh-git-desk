import { createRuntime } from './lib/exec.js';
import { registerGitRoute } from './lib/http.js';
import { createHandler } from './lib/rpc.js';
import type { HostContext } from './lib/types.js';

export const inject = ['subprocess', 'workspaceRegistry', 'connection', 'webServer'];

/**
 * Expose one authenticated HTTP channel. The browser half owns no Git state;
 * every read and every write goes through this channel and returns a fresh
 * status snapshot.
 * @param ctx the plugin context.
 */
export function apply(ctx: HostContext): void {
  const runtime = createRuntime(ctx.subprocess);
  const handler = createHandler(ctx, runtime);
  ctx.effect(() => registerGitRoute(ctx, handler), 'dsh-git: authenticated Git channel');
}
