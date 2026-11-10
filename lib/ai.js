import { GitError } from './exec.js';

const MAX_PATCH_CHARS = 60_000;
const MAX_TITLE_CHARS = 120;
const MAX_MESSAGE_CHARS = 2_000;
const MAX_INSTRUCTION_CHARS = 4_000;

/**
 * The default wording, also shown in Settings so the field starts populated.
 * Reply format stays separate: a user instruction may not break the title
 * line the log and the parser rely on.
 */
const DEFAULT_INSTRUCTION = [
  'You write Git commit messages for a developer.',
  'The type is one of feat, fix, refactor, chore, docs, test, perf, style, ci, build.',
  'The scope is one lowercase noun, even when recent commits omit it.',
  'Write the summary in the imperative, lowercase, with no trailing period.',
  'Add a short body that explains why the change was made and which behavior it affects.',
  'Describe the change as a whole; never list files one by one.',
  'Match the style of the recent commit subjects.',
].join(' ');

const FORMAT = [
  'Reply with a title line, then one blank line, then a short body.',
  'Title format: type(scope): summary.',
  'Keep the title on one line and under 100 characters.',
  'Never use a code fence, quotes, or a label such as "Commit message:".',
  'Add no trailers, such as Co-Authored-By.',
].join(' ');

/** Read a stored instruction, falling back to the shipped wording. */
export function instructionOf(value) {
  if (typeof value !== 'string') return DEFAULT_INSTRUCTION;
  const text = value.trim();
  return text === '' ? DEFAULT_INSTRUCTION : text.slice(0, MAX_INSTRUCTION_CHARS);
}

/**
 * Read the model the user picked in Settings. The plugin never stores a
 * provider or a key of its own, so AI actions follow the harness selection
 * unless the panel sends an explicit override.
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

/** Accept only a complete provider/model pair from the client. */
function overrideModel(value) {
  if (value === null || typeof value !== 'object') return null;
  const provider = value.provider;
  const model = value.model;
  if (typeof provider !== 'string' || typeof model !== 'string') return null;
  if (provider === '' || model === '') return null;
  return { provider, model };
}

/**
 * Models the settings page may offer, grouped by provider. A provider that
 * cannot answer contributes no group rather than failing the whole read.
 */
export async function preferences(ctx) {
  const llm = typeof ctx.get === 'function' ? ctx.get('llm') : undefined;
  const groups = [];
  if (llm !== undefined && typeof llm.listProviders === 'function' && typeof llm.listModels === 'function') {
    for (const provider of llm.listProviders()) {
      const id = typeof provider?.id === 'string' ? provider.id : '';
      if (id === '') continue;
      let listed;
      try {
        listed = await llm.listModels(id);
      } catch {
        // An unconfigured provider refuses its catalog; it offers no choice.
        listed = null;
      }
      if (!Array.isArray(listed)) continue;
      const models = listed.flatMap((model) =>
        typeof model?.id === 'string' && model.id !== ''
          ? [{ id: model.id, name: typeof model.name === 'string' && model.name !== '' ? model.name : model.id }]
          : [],
      );
      if (models.length === 0) continue;
      const label = typeof provider.name === 'string' && provider.name !== '' ? provider.name : id;
      groups.push({ id, label, models });
    }
  }
  return { instruction: DEFAULT_INSTRUCTION, groups };
}

/**
 * Reduce a model reply to a title line and an optional body. The title is
 * normalized the way a Git log reads it; the body keeps its paragraph breaks.
 */
export function cleanMessage(text) {
  const lines = text
    .replace(/```[a-z]*\r?\n?/gi, '')
    .replace(/```/g, '')
    .replace(/^\s*commit message\s*:\s*/i, '')
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+$/, ''));
  while (lines.length > 0 && lines[0].trim() === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  if (lines.length === 0) return '';
  const title = lines[0]
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[.。]+$/, '')
    .trim()
    .slice(0, MAX_TITLE_CHARS);
  if (title === '') return '';
  const body = [];
  for (const line of lines.slice(1)) {
    if (line.trim() === '') {
      if (body.length > 0 && body[body.length - 1] !== '') body.push('');
      continue;
    }
    body.push(line.trim());
  }
  while (body.length > 0 && body[body.length - 1] === '') body.pop();
  if (body.length === 0) return title;
  const message = `${title}\n\n${body.join('\n').trim()}`;
  return message.slice(0, MAX_MESSAGE_CHARS).trim();
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
 * passes a signal that also covers the request timeout. `model` overrides the
 * Composer selection; `instruction` replaces the default wording.
 */
export async function writeCommitMessage(ctx, { patch, recent, signal, model: requested, instruction }) {
  const llm = typeof ctx.get === 'function' ? ctx.get('llm') : undefined;
  if (llm === undefined || typeof llm.stream !== 'function') {
    throw new GitError('git/ai-unavailable', 'AI is not available in this build.');
  }
  const model = overrideModel(requested) ?? selectedModel(ctx);
  if (model === null) {
    throw new GitError('git/ai-unavailable', 'Select a model in Settings before using AI actions.');
  }
  const system = `${instructionOf(instruction)} ${FORMAT}`;
  let text = '';
  let failure = null;
  try {
    const chunks = llm.stream({
      provider: model.provider,
      model: model.model,
      system,
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
  const message = cleanMessage(text);
  if (message === '') throw new GitError('git/ai-empty', 'The model returned an empty message. Try again.');
  return { message, provider: model.provider, model: model.model };
}
