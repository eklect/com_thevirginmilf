import { createHmac } from 'node:crypto';

/**
 * MAP's per-brand unsubscribe link, signed here with the application's key.
 *
 * The recipe is MAP's (`unsubscribe-link.spec.ts` there asserts the same
 * worked example this repo's spec does), and must not drift:
 *
 *   message = "unsubscribe:" + slug + ":" + sub            (UTF-8)
 *   sig     = base64url(HMAC-SHA256(hexDecode(keyHex), message)), no padding
 *   link    = linkBase + "/" + slug + "/" + sub + "/" + sig
 *
 * The HMAC key is the 32 raw bytes the hex decodes to, not the 64-character
 * string. `slug` and `linkBase` are used exactly as MAP returned them.
 */
export function signUnsubscribeLink(
  key: { slug: string; keyHex: string; linkBase: string },
  sub: string,
): string {
  const sig = createHmac('sha256', Buffer.from(key.keyHex, 'hex'))
    .update(`unsubscribe:${key.slug}:${sub}`, 'utf8')
    .digest('base64url');
  return `${key.linkBase.replace(/\/+$/, '')}/${key.slug}/${sub}/${sig}`;
}

/** `List-Unsubscribe` (RFC 2369) + one-click (RFC 8058) for one link. */
export function listUnsubscribeHeaders(link: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${link}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}
