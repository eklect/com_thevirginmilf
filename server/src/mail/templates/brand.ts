import { Brand, MailTheme } from './layout';

/**
 * This venture's mail brand, in one place so that every call site and the
 * email registry (`email-templates/kinds.ts`) draw the same message. This file
 * is the one that differs from the clone (`live_thesolutionist`); the layout
 * is shared.
 *
 * The site's own tokens (`client/src/styles.css`), as a magazine cover: the
 * full lockup on white, a black-and-white striped band (the skirt), the
 * heading in white Anton capitals on the lipstick slab, a red button with a
 * hard black edge and a solid offset block, and a black footer.
 *
 *   --brand / --accent  #d2111d   the slab and the button
 *   --brand-deep        #9a0912   the offset block under the message
 *   --ink               #0a0a0a   type, edges, the canvas and the footer
 *   --bg                #ffffff   the paper
 *   --muted             #5f585a   small print
 *   --border            #d8d2d3   the rule above a note
 *   --accent-ink (dark) #ff6470   red words on black — the footer links
 *
 * The logo is the full lockup (`client/public/brand/v1/logo.png`, 1299x961,
 * black lettering on transparency), so it sits on white and never on black.
 * It is an absolute URL on the production domain: mail is read far from the
 * dev box, and a mail client has no other way to reach it.
 */
export const MAIL_LOGO_URL = 'https://thevirginmilf.com/brand/v1/logo.png';

export const MAIL_THEME: MailTheme = {
  canvas: '#0a0a0a',
  paper: '#ffffff',
  frame: '#0a0a0a',
  frameWidth: 3,
  radius: 0,
  buttonRadius: 0,
  frameShadow: '#9a0912',

  text: '#0a0a0a',
  muted: '#5f585a',
  rule: '#d8d2d3',

  header: { background: '#ffffff', padding: '34px 40px 30px' },
  logo: { url: MAIL_LOGO_URL, width: 260, height: 192, radius: 0 },

  stripe: {
    kind: 'columns',
    colors: ['#0a0a0a', '#ffffff'],
    size: 12,
    edge: '#0a0a0a',
  },

  band: { background: '#d2111d', text: '#ffffff', eyebrow: '#ffffff' },

  button: {
    background: '#d2111d',
    text: '#ffffff',
    border: '#0a0a0a',
    shadow: '#0a0a0a',
  },

  footer: {
    background: '#0a0a0a',
    text: '#ffffff',
    muted: '#a8a0a2',
    link: '#ff6470',
  },

  fonts: {
    // Anton is one static weight: 400, and never a synthesised bold. Impact
    // is its stand-in on Windows and macOS, Helvetica Neue Condensed Black on
    // iOS, which has no Impact.
    display:
      "Anton,Impact,Haettenschweiler,'HelveticaNeue-CondensedBlack','Arial Narrow Bold','Arial Narrow',sans-serif",
    displayWeight: 400,
    displayTracking: '0.02em',
    displaySize: 44,
    label: "Archivo,'Helvetica Neue',Helvetica,Arial,sans-serif",
    labelWeight: 800,
    labelTracking: '0.14em',
    body: "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Helvetica,Arial,sans-serif",
  },
  webFontsHref:
    'https://fonts.googleapis.com/css2?family=Anton&amp;family=Archivo:wght@800&amp;family=Inter:wght@400;600&amp;display=swap',
};

/**
 * The site's name and address as literals, for the one message this backend
 * never sends itself: MAP's password reset, rendered from this venture's
 * `live/password_reset` file. MAP fills `{{brandName}}` from the
 * application's registered name, which is not always the brand, so that file
 * writes the brand out instead.
 */
export const MAIL_BRAND_NAME = 'The Virgin MILF';
export const MAIL_HOME_URL = 'https://thevirginmilf.com';

/**
 * MAP's signed-in email preferences page, the footer link on essential mail
 * (MAP's password reset here). A production literal like `MAIL_HOME_URL`, so
 * the seeded file is the same wherever it is rendered; MAP's public origin
 * is `https://map.mucciandco.com` in production.
 */
export const MAIL_PREFERENCES_URL =
  'https://map.mucciandco.com/email-preferences';

export const MAIL_ACCENT = MAIL_THEME.button.background;

export function mailBrand(name: string, homeUrl: string): Brand {
  return {
    name,
    homeUrl,
    accent: MAIL_ACCENT,
    logoUrl: MAIL_LOGO_URL,
    theme: MAIL_THEME,
  };
}
