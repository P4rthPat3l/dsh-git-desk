import { GitError } from './exec.js';

const MAX_PATCH_CHARS = 60_000;
const MAX_MESSAGE_CHARS = 120;

const SYSTEM = [
  'You write Git commit messages for a developer.',
  'Reply with exactly one line and nothing else.',
  'Format: type(scope): summary.',
  'The type is one of feat, fix, refactor, chore, docs, test, perf, style, ci, build.',
  'The scope is one lowercase noun.',
  'Write the summary in the imperative, lowercase, with no trailing period.',
  'Match the style of the recent commit subjects.',
  'Never use a code fence, quotes, or a label such as "Commit message:".',
].join(' ');

/**
 * Read the model the user picked in Settings. The plugin never stores a
 * provider or a key of its own, so AI actions follow the harness selection.
 */
export function selectedModel(ctx) {
  const service = typeof ctx.get === 'function' ? ctx.get('agentDefaultModel') : undefined;
  if (service === undefined || typeof service.currentSelection !== 'function') return null;
  const selection = service.currentSelection();
  if (selection === null || typeof selection !== 'object') return null;
  if (typeof selection.provider !== 'string' || typeof selection.model !== 'string') return null;
  if (selection.provider === '' || selection.model === '') return null;
  return { provider: selection.provider, model: selection.model };
}

function cleanLine(text) {
  let line = text.replace(/```[a-z]*\r?\n?/gi, '').replace(/```/g, '').trim();
  line = line.replace(/^commit message\s*:\s*/i, '');
  line = line.split(/\r?\n/).map((part) => part.trim()).find((part) => part !== '') ?? '';
  line = line.replace(/^["'`]+|["'`]+$/g, '').trim();
  line = line.replace(/[.。]+$/, '');
  line = line.replace(/\s+/g, ' ').trim();
  return line.slice(0, MAX_MESSAGE_CHARS);
}

function promptFor(recent, patch) {
  const body =
    patch.length > MAX_PATCH_CHARS ? `${patch.slice(0, MAX_PATCH_CHARS)}\n[diff truncated]` : patch;
  const style =
    recent.length === 0 ? '(none)' : recent.map((subject) => `- ${subject}`).join('\n');
  return `Recent commit subjects:\n${style}\n\nStaged changes:\n${body}`;
}

/**
 * One model call over the staged patch. The caller owns cancellation and
 * passes a signal that also covers the request timeout.
 */
export async function writeCommitMessage(ctx, { patch, recent, signal }) {
  const llm = typeof ctx.get === 'function' ? ctx.get('llm') : undefined;
  if (llm === undefined || typeof llm.stream !== 'function') {
    throw new GitError('git/ai-unavailable', 'AI is not available in this build.');
  }
  const model = selectedModel(ctx);
  if (model === null) {
    throw new GitError('git/ai-unavailable', 'Select a model in Settings before using AI actions.');
  }
  let text = '';
  let failure = null;
  try {
    const chunks = llm.stream({
      provider: model.provider,
      model: model.model,
      system: SYSTEM,
      messages: [{ role: 'user', content: [{ type: 'text', text: promptFor(recent, patch) }] }],
      temperature: 0.2,
      maxTokens: 200,
      signal,
    });
    for await (const chunk of chunks) {
      if (chunk.type === 'text-delta') text += chunk.text;
      else if (chunk.type === 'finish' && chunk.reason.kind !== 'stop') failure = chunk.reason;
    }
  } catch (error) {
    if (signal !== undefined && signal.aborted) {
      throw new GitError('git/ai-timeout', 'The model request timed out. Try again.');
    }
    throw new GitError('git/ai-failed', 'The model request failed.', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (failure !== null) {
    if (failure.kind === 'aborted') {
      throw new GitError('git/ai-timeout', 'The model request timed out. Try again.');
    }
    const message = failure.failure?.message;
    throw new GitError('git/ai-failed', typeof message === 'string' && message !== '' ? message : 'The model request failed.');
  }
  const message = cleanLine(text);
  if (message === '') throw new GitError('git/ai-empty', 'The model returned an empty message. Try again.');
  return { message, provider: model.provider, model: model.model };
}
