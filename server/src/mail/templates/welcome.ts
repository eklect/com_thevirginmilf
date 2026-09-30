import { Brand, RenderedEmail, renderEmail } from './layout';

/** Sent once, after a signup on the site creates the MAP account. */
export function welcomeEmail(
  brand: Brand,
  args: { firstName: string; streamsUrl: string; emailAlerts: boolean },
): RenderedEmail {
  return renderEmail(brand, {
    subject: `Welcome to ${brand.name}`,
    preheader: 'Your account is ready.',
    heading: `Welcome, ${args.firstName}.`,
    paragraphs: [
      `Your ${brand.name} account is set up. Sign in with the email address and password you just chose.`,
      args.emailAlerts
        ? 'You asked to hear about streams, so you will get an email when one is scheduled and another shortly before it starts.'
        : 'Stream alerts are off for your account. You can switch them on from your account page at any time.',
    ],
    cta: { label: 'See the stream schedule', url: args.streamsUrl },
    notes: [
      `If you did not create a ${brand.name} account, you can ignore this email — nothing further will be sent.`,
    ],
  });
}
