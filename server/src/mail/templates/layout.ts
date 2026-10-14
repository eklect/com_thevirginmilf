/**
 * The one email layout. Every template describes its message as data — a
 * heading, some paragraphs, at most one button — and this turns it into both
 * the plain-text and the HTML body, so the two can never say different things.
 *
 * The LOOK is not in here. It is the brand's `MailTheme` (`brand.ts`): the
 * colours, the logo, the faces and the stripe are all data, so this file is the
 * same in every venture that shares it and only `brand.ts` differs.
 *
 * Email-safe on purpose: nested tables, inline styles, a 600px column, a
 * bulletproof button (the colour is on the cell, so Outlook still draws it),
 * every text colour stated outright so a client's dark mode has nothing to
 * guess. Web fonts are linked for the clients that load them (Apple Mail, iOS)
 * and hidden from Outlook, which otherwise falls back to Times; everywhere else
 * the theme's fallback stack keeps the character of the face. Rounded corners
 * and offset shadows are progressive — Outlook draws square, flat, still right.
 *
 * Every interpolated value goes through `escapeHtml`. A person's name is user
 * input, and an email body is an HTML document. Theme values are constants
 * from code and are written as they are. Nothing here may transform a value
 * (upper-case it, slice it): the editable default is this output with
 * `{{name}}` tokens as the values, and a transformed token stops being one.
 * Capitals are CSS `text-transform`, never `toUpperCase`.
 */

export interface MailTheme {
  /** The page behind the message. */
  canvas: string;
  /** The message's own background. */
  paper: string;
  /** The keyline around the message, and its width. */
  frame: string;
  frameWidth: number;
  /** Corner radius of the message and its button. 0 is square. */
  radius: number;
  buttonRadius: number;
  /** Optional offset block under the message — a solid colour, never a blur. */
  frameShadow?: string;

  text: string;
  muted: string;
  rule: string;

  /** The masthead: a band with the logo centred on it. */
  header: { background: string; padding: string };
  logo: { url: string; width: number; height: number; radius: number };

  /**
   * Thin bands of colour under the masthead and above the footer. `rows`
   * stacks them (a racing stripe); `columns` lays them side by side and
   * repeats them across the width (a striped print).
   */
  stripe: {
    kind: 'rows' | 'columns';
    colors: string[];
    size: number;
    /** A hairline between two rows. */
    gap?: string;
    /** A keyline above and below the whole stripe. */
    edge?: string;
  };

  /** The slab the heading sits on. */
  band: { background: string; text: string; eyebrow: string };

  button: { background: string; text: string; border: string; shadow?: string };

  footer: { background: string; text: string; muted: string; link: string };

  fonts: {
    /** Headings and the footer wordmark. */
    display: string;
    displayWeight: number;
    displayTracking: string;
    displaySize: number;
    /** Eyebrows, the button, small capitals. */
    label: string;
    labelWeight: number;
    labelTracking: string;
    /** Reading text. */
    body: string;
  };
  /** A Google Fonts stylesheet for the clients that load one. */
  webFontsHref?: string;
}

export interface Brand {
  /** Shown in the masthead's alt text, the footer and the sign-off. */
  name: string;
  /** Where the footer links. */
  homeUrl: string;
  /** Absolute URL; omitted when there is none. */
  logoUrl?: string | null;
  /** The button colour. */
  accent?: string;
  /** The look. Omitted, the message is drawn in `NEUTRAL_THEME`. */
  theme?: MailTheme;
}

/**
 * Grey and white, for a caller with no brand of its own (the generic specs).
 * Every real message from this venture goes through `mailBrand` instead.
 */
export const NEUTRAL_THEME: MailTheme = {
  canvas: '#f3f4f6',
  paper: '#ffffff',
  frame: '#e5e7eb',
  frameWidth: 1,
  radius: 8,
  buttonRadius: 6,
  text: '#1f2937',
  muted: '#6b7280',
  rule: '#e5e7eb',
  header: { background: '#111827', padding: '24px 40px' },
  logo: { url: '', width: 160, height: 40, radius: 0 },
  stripe: { kind: 'rows', colors: ['#1f2937'], size: 2 },
  band: { background: '#ffffff', text: '#111827', eyebrow: '#6b7280' },
  button: { background: '#1f2937', text: '#ffffff', border: '#1f2937' },
  footer: {
    background: '#f9fafb',
    text: '#111827',
    muted: '#6b7280',
    link: '#6b7280',
  },
  fonts: {
    display:
      "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif",
    displayWeight: 700,
    displayTracking: '0',
    displaySize: 26,
    label:
      "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif",
    labelWeight: 600,
    labelTracking: '0.04em',
    body: "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif",
  },
};

export interface EmailContent {
  subject: string;
  /** The grey preview line most clients show beside the subject. */
  preheader?: string;
  /** A short label over the heading — "Stream alert". A constant, never a value. */
  eyebrow?: string;
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

/** The stripe as table rows, or as one row of repeating cells. */
function stripeHtml(t: MailTheme): string {
  const { kind, colors, size, gap, edge } = t.stripe;
  const edges = edge
    ? ` style="border-top:3px solid ${edge};border-bottom:3px solid ${edge}"`
    : '';
  const cell = (color: string, extra = '') =>
    `<td bgcolor="${color}" style="background:${color};height:${size}px;line-height:${size}px;font-size:0;mso-line-height-rule:exactly${extra}">&nbsp;</td>`;
  if (kind === 'rows') {
    const rows = colors.flatMap((color, i) => {
      const bar = `<tr>${cell(color)}</tr>`;
      return gap && i < colors.length - 1
        ? [
            bar,
            `<tr><td bgcolor="${gap}" style="background:${gap};height:2px;line-height:2px;font-size:0;mso-line-height-rule:exactly">&nbsp;</td></tr>`,
          ]
        : [bar];
    });
    return `<tr><td${edges}><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows.join('')}</table></td></tr>`;
  }
  const count = 20;
  const width = 100 / count;
  const cells = Array.from({ length: count }, (_, i) =>
    cell(colors[i % colors.length], `;width:${width}%`),
  );
  return `<tr><td${edges}><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed"><tr>${cells.join('')}</tr></table></td></tr>`;
}

export function renderEmail(
  brand: Brand,
  content: EmailContent,
): RenderedEmail {
  const text = [
    content.eyebrow ? `${brand.name} · ${content.eyebrow}` : brand.name,
    '',
    content.heading,
    '',
    ...content.paragraphs.flatMap((p) => [p, '']),
    ...(content.cta ? [`${content.cta.label}: ${content.cta.url}`, ''] : []),
    ...(content.notes ?? []).flatMap((n) => [n, '']),
    ...(content.footerLink
      ? [`${content.footerLink.label}: ${content.footerLink.url}`, '']
      : []),
    '—',
    brand.name,
    brand.homeUrl,
  ].join('\n');

  const t = brand.theme ?? NEUTRAL_THEME;
  const f = t.fonts;
  const accent = brand.accent ?? t.button.background;
  const body = `font-family:${f.body};mso-line-height-rule:exactly`;
  const label = `font-family:${f.label};font-weight:${f.labelWeight};letter-spacing:${f.labelTracking};text-transform:uppercase`;
  const display = `font-family:${f.display};font-weight:${f.displayWeight};letter-spacing:${f.displayTracking};text-transform:uppercase;font-synthesis:none`;
  const p = (
    s: string,
    style = `margin:0 0 18px;font-size:17px;line-height:1.6;color:${t.text}`,
  ) => `<p style="${style};${body}">${escapeHtml(s)}</p>`;
  const r = t.radius;
  const frameShadow = t.frameShadow
    ? `;box-shadow:8px 8px 0 ${t.frameShadow}`
    : '';
  const buttonShadow = t.button.shadow
    ? `;box-shadow:4px 4px 0 ${t.button.shadow}`
    : '';

  const logo = brand.logoUrl
    ? `<a href="${escapeHtml(brand.homeUrl)}" style="text-decoration:none"><img src="${escapeHtml(brand.logoUrl)}" alt="${escapeHtml(brand.name)}" width="${t.logo.width}" height="${t.logo.height}" style="display:block;margin:0 auto;width:${t.logo.width}px;max-width:100%;height:auto;border:0;outline:none;border-radius:${t.logo.radius}px"></a>`
    : `<a href="${escapeHtml(brand.homeUrl)}" style="text-decoration:none;font-size:34px;line-height:1.1;color:${t.band.text};${display}">${escapeHtml(brand.name)}</a>`;

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${escapeHtml(content.subject)}</title>
${t.webFontsHref ? `<!--[if !mso]><!--><link href="${t.webFontsHref}" rel="stylesheet"><!--<![endif]-->` : ''}
</head>
<body bgcolor="${t.canvas}" style="margin:0;padding:0;background:${t.canvas};-webkit-text-size-adjust:100%">
${content.preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escapeHtml(content.preheader)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${t.canvas}" style="background:${t.canvas}">
<tr><td align="center" style="padding:32px 12px 40px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${t.paper}" style="width:100%;max-width:600px;background:${t.paper};border:${t.frameWidth}px solid ${t.frame};border-radius:${r}px;border-collapse:separate;overflow:hidden${frameShadow}">
<tr><td align="center" bgcolor="${t.header.background}" style="background:${t.header.background};padding:${t.header.padding};border-radius:${r}px ${r}px 0 0">${logo}</td></tr>
${stripeHtml(t)}
<tr><td bgcolor="${t.band.background}" style="background:${t.band.background};padding:30px 40px 30px">
${content.eyebrow ? `<p style="margin:0 0 10px;font-size:12px;line-height:1.4;color:${t.band.eyebrow};${label}">${escapeHtml(content.eyebrow)}</p>` : ''}
<h1 style="margin:0;font-size:${f.displaySize}px;line-height:1.08;color:${t.band.text};${display}">${escapeHtml(content.heading)}</h1>
</td></tr>
<tr><td bgcolor="${t.paper}" style="background:${t.paper};padding:34px 40px 30px">
${content.paragraphs.map((s) => p(s)).join('\n')}
${
  content.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 24px;border-collapse:separate"><tr><td align="center" bgcolor="${accent}" style="background:${accent};border:2px solid ${t.button.border};border-radius:${t.buttonRadius}px;mso-padding-alt:15px 30px${buttonShadow}">
<a href="${escapeHtml(content.cta.url)}" style="display:inline-block;padding:15px 30px;font-size:14px;line-height:1.2;color:${t.button.text};text-decoration:none;border-radius:${t.buttonRadius}px;${label}">${escapeHtml(content.cta.label)}</a>
</td></tr></table>
${p(`If the button does not work, paste this into your browser: ${content.cta.url}`, `margin:0 0 18px;font-size:13px;line-height:1.5;color:${t.muted};word-break:break-all`)}`
    : ''
}
${(content.notes ?? []).map((s) => p(s, `margin:0 0 12px;padding-top:16px;border-top:1px solid ${t.rule};font-size:13px;line-height:1.55;color:${t.muted}`)).join('\n')}
</td></tr>
${stripeHtml(t)}
<tr><td align="center" bgcolor="${t.footer.background}" style="background:${t.footer.background};padding:28px 40px 30px;border-radius:0 0 ${r}px ${r}px">
<a href="${escapeHtml(brand.homeUrl)}" style="text-decoration:none;font-size:22px;line-height:1.2;color:${t.footer.text};${display}">${escapeHtml(brand.name)}</a>
<p style="margin:12px 0 0;font-size:13px;line-height:1.6;color:${t.footer.muted};${body}"><a href="${escapeHtml(brand.homeUrl)}" style="color:${t.footer.link};text-decoration:underline">Visit the site</a>${
    content.footerLink
      ? ` &nbsp;&middot;&nbsp; <a href="${escapeHtml(content.footerLink.url)}" style="color:${t.footer.link};text-decoration:underline">${escapeHtml(content.footerLink.label)}</a>`
      : ''
  }</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  return { subject: content.subject, text, html };
}
