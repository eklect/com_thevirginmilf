import { Brand } from './layout';

/**
 * This venture's mail brand, in one place so that every call site and the
 * email registry (`email-templates/kinds.ts`) draw the same header and button.
 * The one line that differs from the clone is the accent.
 *
 * No logo: mail draws the site name as a wordmark. `logoUrl` is still passed
 * to the editable templates (as an empty value) so one can be added there.
 */
export const MAIL_ACCENT = '#d2111d';

export function mailBrand(name: string, homeUrl: string): Brand {
  return { name, homeUrl, accent: MAIL_ACCENT, logoUrl: null };
}
