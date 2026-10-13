import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type {
  EmailKindDef,
  EmailKindSummary,
  KindRenderedEmail,
  SeedResult,
} from './email-kinds.types';
import { TEMPLATE_NAME } from './template-name';

/**
 * The email event registry's machinery. GENERIC — copied verbatim into every
 * venture backend; only `kinds.ts` (the list) differs.
 *
 * Plain functions over a venture folder and a kind list, with no Nest context
 * and no database, so the seed script can import them as they are. The
 * service (`email-kinds.service.ts`) and the mail queue's warning are thin
 * wrappers over these.
 */

const PLACEHOLDER = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

export const placeholderToken = (name: string): string => `{{${name}}}`;

/**
 * The built-in template with every placeholder value set to its own literal
 * `{{name}}` token — the file pair a venture starts from.
 *
 * This works because the layout's `escapeHtml` touches `& < > " '` only, so
 * `{{` and `}}` come through intact in the HTML, and `FileTemplateService`
 * escapes the real value at send time exactly as the layout would have. A
 * template that transforms a value (upper-cases it, builds a URL from it)
 * would transform the token instead and break that — `assertDefaults` below
 * catches the loss of a token outright.
 *
 * The subject is carried as the HTML's `<title>`, since that is where
 * `FileTemplateService` reads it from; `ensureTitle` adds one if a template's
 * layout ever omits it.
 */
export function defaultRendering(def: EmailKindDef): KindRenderedEmail {
  const vars = Object.fromEntries(
    def.placeholders.map((name) => [name, placeholderToken(name)]),
  );
  const rendered = def.render(vars);
  return {
    subject: rendered.subject,
    text: rendered.text,
    html: ensureTitle(rendered.html, rendered.subject),
  };
}

/** The placeholder names a source references. */
export function placeholdersIn(source: string): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(PLACEHOLDER)) found.add(match[1]);
  return [...found];
}

/**
 * Throws when a kind is malformed: a bad file stem, a duplicate, or a default
 * rendering that references a placeholder the call site does not pass. (A
 * declared placeholder may be absent from the defaults — `logoUrl` on a
 * venture that ships no logo — and stays available to editors.)
 */
export function assertKinds(kinds: readonly EmailKindDef[]): void {
  const seen = new Set<string>();
  for (const def of kinds) {
    if (!TEMPLATE_NAME.test(def.kind) || def.kind.includes('..')) {
      throw new Error(`Email kind '${def.kind}' is not a valid template name`);
    }
    if (seen.has(def.kind))
      throw new Error(`Email kind '${def.kind}' is registered twice`);
    seen.add(def.kind);
    const defaults = defaultRendering(def);
    const declared = new Set(def.placeholders);
    const undeclared = placeholdersIn(
      `${defaults.html}\n${defaults.text}`,
    ).filter((name) => !declared.has(name));
    if (undeclared.length) {
      throw new Error(
        `Email kind '${def.kind}' renders undeclared placeholder(s): ${undeclared.join(', ')}`,
      );
    }
  }
}

const exists = (file: string) =>
  fs.access(file).then(
    () => true,
    () => false,
  );

/** Which of `live/<kind>.html` and `live/<kind>.txt` exist. */
export async function livePair(
  ventureDir: string,
  kind: string,
): Promise<{ html: boolean; text: boolean }> {
  const live = path.join(ventureDir, 'live');
  const [html, text] = await Promise.all([
    exists(path.join(live, `${kind}.html`)),
    exists(path.join(live, `${kind}.txt`)),
  ]);
  return { html, text };
}

export async function summarizeKinds(
  ventureDir: string,
  kinds: readonly EmailKindDef[],
): Promise<EmailKindSummary[]> {
  return Promise.all(
    kinds.map(async (def) => {
      const pair = await livePair(ventureDir, def.kind);
      return {
        kind: def.kind,
        description: def.description,
        placeholders: [...def.placeholders],
        marketing: def.marketing,
        live: pair.html && pair.text,
        defaults: defaultRendering(def),
      };
    }),
  );
}

/**
 * Writes the default pair for every kind without a live pair.
 *
 * A complete pair is skipped unless `force`. A half pair (somebody has one of
 * the two files) is reported as `partial` and left alone unless `force`,
 * since the half that exists may be hand-edited. `dryRun` writes nothing and
 * says what it would have done.
 */
export async function seedLiveTemplates(
  ventureDir: string,
  kinds: readonly EmailKindDef[],
  options: { force?: boolean; dryRun?: boolean } = {},
): Promise<SeedResult[]> {
  assertKinds(kinds);
  const live = path.join(ventureDir, 'live');
  const results: SeedResult[] = [];
  for (const def of kinds) {
    const pair = await livePair(ventureDir, def.kind);
    const any = pair.html || pair.text;
    const both = pair.html && pair.text;
    if (any && !options.force) {
      results.push({ kind: def.kind, action: both ? 'skipped' : 'partial' });
      continue;
    }
    if (options.dryRun) {
      results.push({
        kind: def.kind,
        action: any ? 'would-overwrite' : 'would-write',
      });
      continue;
    }
    const defaults = defaultRendering(def);
    await fs.mkdir(live, { recursive: true });
    await fs.writeFile(
      path.join(live, `${def.kind}.html`),
      withNewline(defaults.html),
    );
    await fs.writeFile(
      path.join(live, `${def.kind}.txt`),
      withNewline(defaults.text),
    );
    results.push({ kind: def.kind, action: any ? 'overwritten' : 'written' });
  }
  return results;
}

const warnedKinds = new Set<string>();

/**
 * Logs once per process per kind when mail is enqueued under a kind the
 * registry does not list — it can still be sent, but no editor will ever see
 * it. Never throws: a missing registry entry must not fail somebody's signup.
 */
export function warnIfUnregisteredKind(
  kind: string,
  kinds: readonly EmailKindDef[],
  warn: (message: string) => void,
): void {
  if (warnedKinds.has(kind) || kinds.some((def) => def.kind === kind)) return;
  warnedKinds.add(kind);
  warn(
    `Mail of kind '${kind}' was enqueued but '${kind}' is not in EMAIL_KINDS ` +
      '(src/email-templates/kinds.ts), so it cannot be edited as a template. Register it.',
  );
}

/** For tests: forget which kinds have been warned about. */
export function resetUnregisteredKindWarnings(): void {
  warnedKinds.clear();
}

function ensureTitle(html: string, subject: string): string {
  if (/<title>[\s\S]*?<\/title>/i.test(html)) return html;
  const title = `<title>${escapeHtml(subject)}</title>`;
  if (/<head[^>]*>/i.test(html))
    return html.replace(/<head[^>]*>/i, (head) => `${head}\n${title}`);
  return `${title}\n${html}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function withNewline(body: string): string {
  return body.endsWith('\n') ? body : `${body}\n`;
}
