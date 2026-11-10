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
/**
 * Read a stored instruction, falling back to the shipped wording.
 * @param value the stored value.
 * @returns the instruction.
 */
export function instructionOf(value) {
    if (typeof value !== 'string')
        return DEFAULT_INSTRUCTION;
    const text = value.trim();
    return text === '' ? DEFAULT_INSTRUCTION : text.slice(0, MAX_INSTRUCTION_CHARS);
}
/**
 * Tell one model selection apart from any other value.
 * @param value the candidate.
 * @returns whether it is a complete pair.
 */
function isModelPair(value) {
    if (value === null || typeof value !== 'object')
        return false;
    const candidate = value;
    return (typeof candidate.provider === 'string' &&
        candidate.provider !== '' &&
        typeof candidate.model === 'string' &&
        candidate.model !== '');
}
/**
 * Tell the model selection service apart from any other value.
 * @param value the candidate service.
 * @returns whether it exposes a selection.
 */
function isAgentModelService(value) {
    return (value !== null &&
        typeof value === 'object' &&
        typeof value.currentSelection === 'function');
}
/**
 * Tell the model service apart from any other value.
 * @param value the candidate service.
 * @returns whether it lists providers, lists models, and streams.
 */
function isLlmService(value) {
    if (value === null || typeof value !== 'object')
        return false;
    const candidate = value;
    return (typeof candidate.listProviders === 'function' &&
        typeof candidate.listModels === 'function' &&
        typeof candidate.stream === 'function');
}
/**
 * Read one string field from an unknown value.
 * @param value the candidate.
 * @param key the field name.
 * @returns the field, or an empty string.
 */
function stringField(value, key) {
    if (value === null || typeof value !== 'object')
        return '';
    const field = value[key];
    return typeof field === 'string' ? field : '';
}
/**
 * Read the model the user picked in Settings. The plugin never stores a
 * provider or a key of its own, so AI actions follow the harness selection
 * unless the panel sends an explicit override.
 *
 * @param ctx the plugin context.
 * @returns the selection, or null.
 */
export function selectedModel(ctx) {
    const service = ctx.get('agentDefaultModel');
    if (!isAgentModelService(service))
        return null;
    const selection = service.currentSelection();
    return isModelPair(selection) ? { provider: selection.provider, model: selection.model } : null;
}
/**
 * Accept only a complete provider/model pair from the client.
 * @param value the client value.
 * @returns the pair, or null.
 */
function overrideModel(value) {
    return isModelPair(value) ? { provider: value.provider, model: value.model } : null;
}
/**
 * Models the settings page may offer, grouped by provider. A provider that
 * cannot answer contributes no group rather than failing the whole read.
 *
 * @param ctx the plugin context.
 * @returns the instruction and the provider groups.
 */
export async function preferences(ctx) {
    const llm = ctx.get('llm');
    const groups = [];
    if (isLlmService(llm)) {
        for (const provider of llm.listProviders()) {
            const id = stringField(provider, 'id');
            if (id === '')
                continue;
            let listed;
            try {
                listed = await llm.listModels(id);
            }
            catch {
                // An unconfigured provider refuses its catalog; it offers no choice.
                listed = null;
            }
            if (!Array.isArray(listed))
                continue;
            const items = listed;
            const models = [];
            for (const model of items) {
                const modelId = stringField(model, 'id');
                if (modelId === '')
                    continue;
                const rawName = stringField(model, 'name');
                models.push({ id: modelId, name: rawName === '' ? modelId : rawName });
            }
            if (models.length === 0)
                continue;
            const rawLabel = stringField(provider, 'name');
            const label = rawLabel === '' ? id : rawLabel;
            groups.push({ id, label, models });
        }
    }
    return { instruction: DEFAULT_INSTRUCTION, groups };
}
/**
 * Reduce a model reply to a title line and an optional body. The title is
 * normalized the way a Git log reads it; the body keeps its paragraph breaks.
 *
 * @param text the raw reply.
 * @returns the cleaned message, or an empty string.
 */
export function cleanMessage(text) {
    const lines = text
        .replace(/```[a-z]*\r?\n?/gi, '')
        .replace(/```/g, '')
        .replace(/^\s*commit message\s*:\s*/i, '')
        .split(/\r?\n/)
        .map((line) => line.replace(/[ \t]+$/, ''));
    while (lines.length > 0 && (lines[0] ?? '').trim() === '')
        lines.shift();
    while (lines.length > 0 && (lines[lines.length - 1] ?? '').trim() === '')
        lines.pop();
    if (lines.length === 0)
        return '';
    const title = (lines[0] ?? '')
        .replace(/^["'`]+|["'`]+$/g, '')
        .replace(/\s+/g, ' ')
        .replace(/[.。]+$/, '')
        .trim()
        .slice(0, MAX_TITLE_CHARS);
    if (title === '')
        return '';
    const body = [];
    for (const line of lines.slice(1)) {
        if (line.trim() === '') {
            if (body.length > 0 && body[body.length - 1] !== '')
                body.push('');
            continue;
        }
        body.push(line.trim());
    }
    while (body.length > 0 && body[body.length - 1] === '')
        body.pop();
    if (body.length === 0)
        return title;
    const message = `${title}\n\n${body.join('\n').trim()}`;
    return message.slice(0, MAX_MESSAGE_CHARS).trim();
}
/**
 * Build the user prompt from recent subjects and the staged patch.
 * @param recent the recent subjects.
 * @param patch the staged patch.
 * @returns the prompt.
 */
function promptFor(recent, patch) {
    const body = patch.length > MAX_PATCH_CHARS ? `${patch.slice(0, MAX_PATCH_CHARS)}\n[diff truncated]` : patch;
    const style = recent.length === 0 ? '(none)' : recent.map((subject) => `- ${subject}`).join('\n');
    return `Recent commit subjects:\n${style}\n\nStaged changes:\n${body}`;
}
/**
 * One model call over the staged patch. The caller owns cancellation and
 * passes a signal that also covers the request timeout. `model` overrides the
 * Composer selection; `instruction` replaces the default wording.
 *
 * @param ctx the plugin context.
 * @param request the patch, recent subjects, signal, and overrides.
 * @returns the generated message and the model that wrote it.
 */
export async function writeCommitMessage(ctx, request) {
    const llm = ctx.get('llm');
    if (!isLlmService(llm)) {
        throw new GitError('git/ai-unavailable', 'AI is not available in this build.');
    }
    const model = overrideModel(request.model) ?? selectedModel(ctx);
    if (model === null) {
        throw new GitError('git/ai-unavailable', 'Select a model in Settings before using AI actions.');
    }
    const system = `${instructionOf(request.instruction)} ${FORMAT}`;
    let text = '';
    let failure = null;
    try {
        const chunks = llm.stream({
            provider: model.provider,
            model: model.model,
            system,
            messages: [{ role: 'user', content: [{ type: 'text', text: promptFor(request.recent, request.patch) }] }],
            temperature: 0.2,
            maxTokens: 200,
            signal: request.signal,
        });
        for await (const chunk of chunks) {
            if (chunk.type === 'text-delta')
                text += chunk.text ?? '';
            else if (chunk.type === 'finish' && chunk.reason !== undefined && chunk.reason.kind !== 'stop') {
                failure = chunk.reason;
            }
        }
    }
    catch (error) {
        if (request.signal.aborted) {
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
    if (message === '')
        throw new GitError('git/ai-empty', 'The model returned an empty message. Try again.');
    return { message, provider: model.provider, model: model.model };
}
