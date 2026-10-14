import { Brand, RenderedEmail, renderEmail } from './layout';

/** The sentence about stream alerts, worked out from the signup's choice. */
export function alertsLine(emailAlerts: boolean): string {
  return emailAlerts
    ? 'You asked to hear about streams, so you will get an email when one is scheduled and another shortly before it starts.'
    : 'Stream alerts are off for your account. You can switch them on from your account page at any time.';
}

/**
 * Sent once, after a signup on the site creates the MAP account — by the form
 * or by a provider button, so it says nothing about a password.
 *
 * Takes the same string values the editable `live/welcome` file is given
 * (`alertsLine` already worked out), so the two can be compared byte for byte.
 */
export function welcomeEmail(
  brand: Brand,
  args: { firstName: string; streamsUrl: string; alertsLine: string },
): RenderedEmail {
  return renderEmail(brand, {
    subject: `Welcome to ${brand.name}`,
    preheader: 'Your account is ready.',
    eyebrow: 'Welcome',
    heading: `Welcome, ${args.firstName}.`,
    paragraphs: [
      `Your ${brand.name} account is set up and ready to use.`,
      args.alertsLine,
    ],
    cta: { label: 'See the stream schedule', url: args.streamsUrl },
    notes: [
      `If you did not create a ${brand.name} account, you can ignore this email — nothing further will be sent.`,
    ],
  });
}
