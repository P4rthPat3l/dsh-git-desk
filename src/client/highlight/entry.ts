/**
 * The lazy syntax-highlighting chunk. It carries the CodeMirror grammars and
 * Lezer tag mapping so the boot bundle never pays for them: `client.js` loads
 * this file through `require.async` the first time a diff needs tokens, which
 * is the same split `dsh-files-desk` uses for its editor.
 *
 * Tokens are class names, not colors. The class resolves to the Harness
 * `--shiki-*` palette in the plugin stylesheet, so a diff and the Files editor
 * draw the same file in the same colors.
 */
import type { LanguageSupport } from '@codemirror/language';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { python } from '@codemirror/lang-python';
import { yaml } from '@codemirror/lang-yaml';
import { xml } from '@codemirror/lang-xml';
import { sql } from '@codemirror/lang-sql';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { rust } from '@codemirror/lang-rust';
import { go } from '@codemirror/lang-go';
import { php } from '@codemirror/lang-php';
import { highlightTree, tagHighlighter, tags } from '@lezer/highlight';

/** The grammars this chunk carries. `text` renders without highlighting. */
export type LanguageKey =
  | 'javascript'
  | 'typescript'
  | 'jsx'
  | 'tsx'
  | 'json'
  | 'markdown'
  | 'css'
  | 'html'
  | 'python'
  | 'yaml'
  | 'xml'
  | 'sql'
  | 'java'
  | 'cpp'
  | 'rust'
  | 'go'
  | 'php'
  | 'text';

/** One styled run of one source line. `token` is a stylesheet class, or null for plain text. */
export interface TokenSpan {
  text: string;
  token: string | null;
}

/** What the host half calls once the chunk has loaded. */
export interface HighlightChunk {
  /**
   * Highlight a whole document, one token list per line.
   * @param code the document text.
   * @param language the grammar to parse with.
   * @returns one token list per line, in source order, or null when the language has no grammar.
   */
  highlightLines: (code: string, language: LanguageKey) => TokenSpan[][] | null;
}

/** The grammar per language key. Every key but `text` must supply one. */
const SUPPORT: Record<Exclude<LanguageKey, 'text'>, () => LanguageSupport> = {
  javascript: () => javascript(),
  typescript: () => javascript({ typescript: true }),
  jsx: () => javascript({ jsx: true }),
  tsx: () => javascript({ jsx: true, typescript: true }),
  json: () => json(),
  markdown: () => markdown(),
  css: () => css(),
  html: () => html(),
  python: () => python(),
  yaml: () => yaml(),
  xml: () => xml(),
  sql: () => sql(),
  java: () => java(),
  cpp: () => cpp(),
  rust: () => rust(),
  go: () => go(),
  php: () => php(),
};

/**
 * The Lezer tag to class mapping. The tag choice follows the Files editor
 * (`src/client/editor/entry.ts` in dsh-files-desk) so the same file looks the
 * same in both panels; the classes are renamed under this plugin's prefix.
 */
const HIGHLIGHTER = tagHighlighter([
  { tag: [tags.keyword, tags.modifier, tags.controlKeyword, tags.operatorKeyword], class: 'gitp-hl-keyword' },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], class: 'gitp-hl-string' },
  { tag: [tags.number, tags.bool, tags.null], class: 'gitp-hl-number' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment], class: 'gitp-hl-comment' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.macroName], class: 'gitp-hl-function' },
  { tag: [tags.typeName, tags.className, tags.namespace], class: 'gitp-hl-type' },
  { tag: [tags.variableName, tags.propertyName, tags.attributeName], class: 'gitp-hl-variable' },
  { tag: [tags.operator, tags.punctuation, tags.separator], class: 'gitp-hl-operator' },
  { tag: [tags.meta, tags.annotation, tags.labelName], class: 'gitp-hl-meta' },
  { tag: [tags.invalid, tags.deleted], class: 'gitp-hl-invalid' },
  { tag: tags.link, class: 'gitp-hl-link' },
  { tag: tags.heading, class: 'gitp-hl-heading' },
  { tag: tags.emphasis, class: 'gitp-hl-emphasis' },
  { tag: tags.strong, class: 'gitp-hl-strong' },
]);

/** One parser per language, built on first use: a grammar is expensive to construct. */
const PARSERS = new Map<LanguageKey, LanguageSupport['language']['parser']>();

/**
 * Resolve the parser for one language.
 * @param language the language key.
 * @returns the parser, or null for plain text.
 */
function parserFor(language: LanguageKey): LanguageSupport['language']['parser'] | null {
  if (language === 'text') return null;
  const cached = PARSERS.get(language);
  if (cached !== undefined) return cached;
  const parser = SUPPORT[language]().language.parser;
  PARSERS.set(language, parser);
  return parser;
}

/**
 * Highlight a whole document, one token list per line.
 * @param code the document text.
 * @param language the grammar to parse with.
 * @returns one token list per line, in source order, or null when the language has no grammar.
 */
export function highlightLines(code: string, language: LanguageKey): TokenSpan[][] | null {
  const parser = parserFor(language);
  if (parser === null) return null;
  const lines: TokenSpan[][] = [[]];
  const push = (text: string, token: string | null): void => {
    if (text === '') return;
    const parts = text.split('\n');
    for (let index = 0; index < parts.length; index += 1) {
      if (index > 0) lines.push([]);
      const part = parts[index];
      if (part === undefined || part === '') continue;
      lines[lines.length - 1]?.push({ text: part, token });
    }
  };
  let cursor = 0;
  highlightTree(parser.parse(code), HIGHLIGHTER, (from, to, classes) => {
    if (from > cursor) push(code.slice(cursor, from), null);
    push(code.slice(from, to), classes);
    cursor = to;
  });
  if (cursor < code.length) push(code.slice(cursor), null);
  return lines;
}
