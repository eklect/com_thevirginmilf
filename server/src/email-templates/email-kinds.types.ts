/**
 * The email event registry's types. GENERIC — copied verbatim into every
 * venture backend. The one file that differs between repos is `kinds.ts`,
 * which holds this venture's `EMAIL_KINDS` list.
 */

/** The same shape `templates/layout.ts` and `FileTemplateService` return. */
export interface KindRenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/**
 * One kind of mail this venture sends — an "email event".
 *
 * - `kind` is the file stem in `live/` (`welcome` → `live/welcome.html` +
 *   `.txt`) and the `kind` passed to `MailQueueService.enqueue`.
 * - `description` is shown to whoever edits the template, who may be an
 *   outside customer: say when it is sent, never which product sends it.
 * - `placeholders` is EXACTLY the set of variables the call site passes to
 *   `FileTemplateService.render(kind, vars)` — the names an editor may use as
 *   `{{name}}`. Keep the two in step.
 * - `marketing` is true for mail a person can opt out of (the MAP opt-out
 *   list applies), false for transactional mail.
 * - `render` is the built-in TypeScript template, taking the placeholder
 *   values. Called with every value set to its own `{{name}}` token it
 *   produces the default file pair — see `defaultRendering`.
 */
export interface EmailKindDef {
  kind: string;
  description: string;
  placeholders: string[];
  marketing: boolean;
  render: (vars: Record<string, string>) => KindRenderedEmail;
}

/** One row of `GET /service/email-templates/kinds`. */
export interface EmailKindSummary {
  kind: string;
  description: string;
  placeholders: string[];
  marketing: boolean;
  /** Both `live/<kind>.html` and `live/<kind>.txt` exist, so sends use the files. */
  live: boolean;
  /** The built-in template with `{{placeholder}}` tokens in place of values. */
  defaults: KindRenderedEmail;
}

export type SeedAction =
  | 'written'
  | 'overwritten'
  | 'skipped'
  /** Exactly one of the pair exists: left alone without `--force`. */
  | 'partial'
  | 'would-write'
  | 'would-overwrite';

export interface SeedResult {
  kind: string;
  action: SeedAction;
}
