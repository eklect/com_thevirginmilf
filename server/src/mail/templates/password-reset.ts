import { MAIL_PREFERENCES_URL } from './brand';
import { Brand, RenderedEmail, preferencesFooter, renderEmail } from './layout';

/**
 * "Forgot password" — the link to choose a new one. SENT BY MAP, NOT BY THIS
 * BACKEND: nothing here enqueues it. MAP holds the password, so MAP sends the
 * reset, and for a reset asked for from this site it renders this venture's
 * `live/password_reset.html` + `.txt` from the templates repo. This is the
 * default that file pair is seeded from, in MAP's own wording.
 *
 * MAP passes `email`, `resetUrl`, `sharedAccountLine`, `brandName`, `homeUrl`
 * and `logoUrl`, but the defaults use only the first two: `brandName` (and so
 * `sharedAccountLine`) is the application's registered name at MAP, which is
 * not always the brand, so the brand is written out from `brand` instead. A
 * file that used a placeholder MAP does not pass would be skipped by MAP.
 */
export function passwordResetEmail(
  brand: Brand,
  args: { email: string; resetUrl: string },
): RenderedEmail {
  return renderEmail(brand, {
    subject: `Reset your password for ${brand.name}`,
    preheader: 'Use this link within the hour to choose a new password.',
    eyebrow: 'Password reset',
    heading: 'Reset your password',
    paragraphs: [
      `Someone — hopefully you — asked to reset the password for ${theBrand(brand.name)} account at ${args.email}.`,
      `${brand.name} signs you in with a Mucci & Co account, so the new password works on every Mucci & Co site you use.`,
    ],
    cta: { label: 'Reset password', url: args.resetUrl },
    notes: [
      'This link expires in 1 hour and works once.',
      "If you didn't ask to reset your password, you can ignore this email — your password is unchanged.",
    ],
    // Essential mail: nobody can unsubscribe from a reset, so the footer
    // offers MAP's preferences page — a literal, since MAP fills only
    // `email` and `resetUrl` here.
    footerLinks: [preferencesFooter(MAIL_PREFERENCES_URL)],
  });
}

/**
 * "the The Virgin MILF account" doubles the article, so a brand that starts
 * with its own "The" keeps it and no second one is added.
 */
function theBrand(name: string): string {
  return /^the\s/i.test(name) ? name : `the ${name}`;
}
