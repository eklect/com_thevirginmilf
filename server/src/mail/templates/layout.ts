/**
 * The one email layout. Every template describes its message as data — a
 * heading, some paragraphs, at most one button — and this turns it into both
 * the plain-text and the HTML body, so the two can never say different things.
 *
 * The HTML is deliberately plain: one table, inline styles, no images but an
 * optional logo, no web fonts. Mail clients strip or mangle anything cleverer,
 * and a transactional message that renders everywhere beats one that looks
 * designed in three clients and broken in the fourth.
 *
 * Every interpolated value goes through `escapeHtml`. A person's name is user
 * input, and an email body is an HTML document.
 */

export interface Brand {
  /** Shown in the header and the sign-off. */
  name: string;
  /** Where the footer links. */
  homeUrl: string;
  /** Absolute URL; omitted when there is none. */
  logoUrl?: string | null;
  /** The button colour. */
  accent?: string;
}

export interface EmailContent {
  subject: string;
  /** The grey preview line most clients show beside the subject. */
  preheader?: string;
  heading: string;
  paragraphs: string[];
  cta?: { label: string; url: string };
  /** Small print under the button — expiry notices, "if this wasn't you". */
  notes?: string[];
  /**
   * A real link in the footer — the unsubscribe link on a stream alert.
   * `notes` cannot carry one: every paragraph is escaped, so a URL there
   * renders as text nobody can click.
   */
  footerLink?: { label: string; url: string };
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderEmail(brand: Brand, content: EmailContent): RenderedEmail {
  const text = [
    content.heading,
    '',
    ...content.paragraphs.flatMap((p) => [p, '']),
    ...(content.cta ? [`${content.cta.label}: ${content.cta.url}`, ''] : []),
    ...(content.notes ?? []).flatMap((n) => [n, '']),
    ...(content.footerLink ? [`${content.footerLink.label}: ${content.footerLink.url}`, ''] : []),
    '—',
    brand.name,
    brand.homeUrl,
  ].join('\n');

  const accent = brand.accent ?? '#1f2937';
  const p = (s: string, style = 'margin:0 0 16px;font-size:16px;line-height:1.55;color:#1f2937') =>
    `<p style="${style}">${escapeHtml(s)}</p>`;

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(content.subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
${content.preheader ? `<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(content.preheader)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;padding:32px">
<tr><td style="padding-bottom:24px">${
    brand.logoUrl
      ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${escapeHtml(brand.name)}" height="40" style="display:block;height:40px;border:0">`
      : `<strong style="font-size:18px;color:#111827">${escapeHtml(brand.name)}</strong>`
  }</td></tr>
<tr><td>
<h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;color:#111827">${escapeHtml(content.heading)}</h1>
${content.paragraphs.map((s) => p(s)).join('\n')}
${
  content.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td style="background:${escapeHtml(accent)};border-radius:6px">
<a href="${escapeHtml(content.cta.url)}" style="display:inline-block;padding:12px 24px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none">${escapeHtml(content.cta.label)}</a>
</td></tr></table>
${p(`If the button does not work, paste this into your browser: ${content.cta.url}`, 'margin:0 0 16px;font-size:13px;line-height:1.5;color:#6b7280;word-break:break-all')}`
    : ''
}
${(content.notes ?? []).map((s) => p(s, 'margin:0 0 12px;font-size:13px;line-height:1.5;color:#6b7280')).join('\n')}
</td></tr>
<tr><td style="padding-top:24px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280">
<a href="${escapeHtml(brand.homeUrl)}" style="color:#6b7280">${escapeHtml(brand.name)}</a>${
    content.footerLink
      ? ` &middot; <a href="${escapeHtml(content.footerLink.url)}" style="color:#6b7280">${escapeHtml(content.footerLink.label)}</a>`
      : ''
  }
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  return { subject: content.subject, text, html };
}
