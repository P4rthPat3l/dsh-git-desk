/**
 * The host half of diff syntax highlighting: the extension table, the lazy
 * chunk loader, and the hook the diff views read. The grammars stay in
 * `client.highlight.js`; this module never imports them, so `client.js` keeps
 * its size and the boot pays nothing until a diff needs tokens.
 */
import { useEffect, useMemo, useState } from 'react';
import type { DiffPayload } from '../contract.js';
import type { HighlightChunk, LanguageKey, TokenSpan } from './highlight/entry.js';

export type { TokenSpan };

/**
 * The extension table. It mirrors the Files editor's table, so a file the
 * editor highlights also highlights here, with the same language.
 */
const LANGUAGE_BY_EXTENSION: Readonly<Record<string, LanguageKey>> = {
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  json: 'json',
  jsonc: 'json',
  json5: 'json',
  md: 'markdown',
  markdown: 'markdown',
  mdx: 'markdown',
  css: 'css',
  scss: 'css',
  less: 'css',
  html: 'html',
  htm: 'html',
  vue: 'html',
  svelte: 'html',
  py: 'python',
  pyw: 'python',
  yml: 'yaml',
  yaml: 'yaml',
  xml: 'xml',
  svg: 'xml',
  xsd: 'xml',
  sql: 'sql',
  java: 'java',
  c: 'cpp',
  h: 'cpp',
  cc: 'cpp',
  cpp: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  rs: 'rust',
  go: 'go',
  php: 'php',
};

/**
 * The line count above which a side renders plain. A diff draws the whole
 * file, and a grammar pass over a huge file costs more than the colors help.
 */
const MAX_HIGHLIGHT_LINES = 4000;

/** The character count above which a side renders plain. */
const MAX_HIGHLIGHT_CHARS = 200_000;

/**
 * Resolve the grammar for one path, case insensitively, from its last dot.
 * @param path the file path the diff belongs to.
 * @returns the language key, or `text` when the suffix is not in the table.
 */
export function languageForPath(path: string): LanguageKey {
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  const base = path.slice(slash + 1).toLowerCase();
  const dot = base.lastIndexOf('.');
  if (dot < 0) return 'text';
  const known: Record<string, LanguageKey> = LANGUAGE_BY_EXTENSION;
  return known[base.slice(dot + 1)] ?? 'text';
}

let chunkPromise: Promise<HighlightChunk> | null = null;

/**
 * Load the highlight chunk once per page.
 * @returns the chunk exports.
 */
function loadChunk(): Promise<HighlightChunk> {
  if (chunkPromise === null) {
    const load = globalThis.__dshGitDeskRequireAsync;
    if (typeof load !== 'function') {
      return Promise.reject(new Error('dsh-git-desk: the highlight chunk loader is unavailable'));
    }
    chunkPromise = load<HighlightChunk>('./client.highlight.js');
  }
  return chunkPromise;
}

/** What one diff can be drawn with once the chunk has loaded. */
interface HighlightPlan {
  language: LanguageKey;
  left: string;
  right: string;
}

/** The per-line tokens for both sides, or null where a side renders plain. */
export interface HighlightedSides {
  left: TokenSpan[][] | null;
  right: TokenSpan[][] | null;
}

const PLAIN: HighlightedSides = { left: null, right: null };

/**
 * Highlight both sides of a diff, loading the grammar chunk on first use.
 *
 * The first paint is plain text and the colored pass arrives with the chunk,
 * which is why the views take nullable sides instead of waiting for it.
 *
 * @param diff the open diff, or null when nothing is selected.
 * @returns per-line tokens per side, null while unloaded or when a side is plain.
 */
export function useHighlightedDiff(diff: DiffPayload | null): HighlightedSides {
  const plan = useMemo<HighlightPlan | null>(() => {
    if (diff === null || diff.binary || diff.conflict) return null;
    const language = languageForPath(diff.path);
    if (language === 'text') return null;
    if (diff.left.length > MAX_HIGHLIGHT_LINES || diff.right.length > MAX_HIGHLIGHT_LINES) return null;
    const left = diff.left.join('\n');
    const right = diff.right.join('\n');
    if (left.length > MAX_HIGHLIGHT_CHARS || right.length > MAX_HIGHLIGHT_CHARS) return null;
    return { language, left, right };
  }, [diff]);

  const [chunk, setChunk] = useState<HighlightChunk | null>(null);
  useEffect(() => {
    if (plan === null) return undefined;
    let active = true;
    loadChunk().then(
      (loaded) => {
        if (active) setChunk(loaded);
      },
      (error: unknown) => {
        console.warn('dsh-git-desk: syntax highlighting is unavailable', error);
      },
    );
    return () => {
      active = false;
    };
  }, [plan]);

  return useMemo<HighlightedSides>(() => {
    if (plan === null || chunk === null) return PLAIN;
    return {
      left: chunk.highlightLines(plan.left, plan.language),
      right: chunk.highlightLines(plan.right, plan.language),
    };
  }, [plan, chunk]);
}
