import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { EmailTemplatesConfig } from './email-templates.config';
import { TEMPLATE_NAME } from './template-name';

/** The same shape `templates/layout.ts` returns, so a caller can take either. */
export interface FileRenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export type TemplateVars = Record<string, string | number | null | undefined>;

const PLACEHOLDER = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

/**
 * Renders a mail from `live/<kind>.html` + `live/<kind>.txt`.
 *
 * This is how the editable templates reach the send path. A feature asks for
 * its kind with the values it has; it gets a rendered mail when BOTH files
 * exist and a `<title>` gives the subject, and `null` otherwise — at which
 * point it falls back to its TypeScript template. So deleting or archiving a
 * file is always safe, and a venture with no files yet sends what it always
 * sent.
 *
 * `{{name}}` is HTML-escaped in the HTML file and inserted as-is in the text
 * file; an unknown or empty placeholder becomes ''. Files are read on every
 * send: volume is a handful a day, and it means an edit through the app is
 * live on the next message with nothing to invalidate.
 *
 * Self-contained on purpose — no import from `templates/layout.ts` — so the
 * same file drops into the repos whose mail module has no layout.
 */
@Injectable()
export class FileTemplateService {
  private readonly logger = new Logger(FileTemplateService.name);

  constructor(private readonly config: EmailTemplatesConfig) {}

  async render(kind: string, vars: TemplateVars): Promise<FileRenderedEmail | null> {
    if (!TEMPLATE_NAME.test(kind)) return null;
    const live = path.join(this.config.ventureDir, 'live');
    const [htmlSrc, textSrc] = await Promise.all([
      fs.readFile(path.join(live, `${kind}.html`), 'utf8').catch(() => null),
      fs.readFile(path.join(live, `${kind}.txt`), 'utf8').catch(() => null),
    ]);
    if (htmlSrc === null || textSrc === null) return null;

    const html = substitute(htmlSrc, vars, true);
    const text = substitute(textSrc, vars, false);
    const title = /<title>([\s\S]*?)<\/title>/i.exec(html);
    const subject = title ? unescapeHtml(title[1]).replace(/\s+/g, ' ').trim() : '';
    if (!subject) {
      this.logger.warn(`live/${kind}.html has no <title>; sending from the built-in template instead`);
      return null;
    }
    return { subject, text, html };
  }
}

export function substitute(source: string, vars: TemplateVars, escape: boolean): string {
  return source.replace(PLACEHOLDER, (_match, key: string) => {
    const raw = vars[key];
    const value = raw === null || raw === undefined ? '' : String(raw);
    return escape ? escapeHtml(value) : value;
  });
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function unescapeHtml(value: string): string {
  return value
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}
