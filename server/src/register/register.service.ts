import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileTemplateService } from '../email-templates/file-template.service';
import { MailQueueService } from '../mail/mail-queue.service';
import { welcomeEmail } from '../mail/templates/welcome';
import { MapClientService } from '../map-client/map-client.service';
import { SettingsService } from '../settings/settings.service';
import { SubscribersService } from '../subscribers/subscribers.service';
import { CreateRegisterDto } from './dto/create-register.dto';
import { SocialRegisterDto } from './dto/social-register.dto';
import type { PendingSignup } from './pending-signup';

/**
 * Signup: an identity at MAP, then the two things this site does about it.
 *
 * MAP creates the account and is the only thing that ever holds the password
 * — it is forwarded once, never stored here, and never logged. What this site
 * keeps is a preference: whether the person asked to be emailed about
 * streams, which is the reason most people sign up at all. Then a welcome
 * goes on the mail queue.
 *
 * Both follow-ups are best-effort. The identity already exists by the time
 * they run, so failing the request over either would strand an account the
 * person cannot re-create ("that email is already registered").
 */
@Injectable()
export class RegisterService {
  private readonly siteUrl: string;

  constructor(
    private readonly mapClient: MapClientService,
    private readonly subscribers: SubscribersService,
    private readonly mailQueue: MailQueueService,
    private readonly fileTemplates: FileTemplateService,
    private readonly settings: SettingsService,
    config: ConfigService,
  ) {
    this.siteUrl = config
      .get<string>('PUBLIC_SITE_URL', 'https://thevirginmilf.test')
      .replace(/\/+$/, '');
  }

  async create(
    dto: CreateRegisterDto,
    consent: { acceptedIp?: string; acceptedUserAgent?: string } = {},
  ): Promise<{ ok: true }> {
    const user = await this.mapClient.createUser({
      email: dto.email,
      password: dto.password,
      firstName: dto.firstName,
      lastName: dto.lastName,
      // The Terms of Service and Privacy Policy are Mucci & Co's, one set for
      // every venture, and MAP keeps the acceptance beside the identity.
      termsAccepted: dto.termsAccepted,
      acceptedIp: consent.acceptedIp,
      acceptedUserAgent: consent.acceptedUserAgent,
    });

    const emailAlerts = dto.emailAlerts ?? false;
    await this.subscribers.seedForNewAccount(user.id, dto.email, emailAlerts);

    await this.enqueueWelcome(user.id, dto.email, dto.firstName, emailAlerts);

    // Nothing is returned about the account — not the MAP user id, not a token.
    // The browser's next step is the ordinary sign-in redirect, which is where
    // a session comes from.
    return { ok: true };
  }

  /**
   * The rest of a signup that began with a provider button, once MAP has
   * created the identity and the callback has verified the token: the alerts
   * preference and the welcome, keyed on the `sub` MAP issued, with MAP's
   * address rather than the form's. Both are idempotent — `seedForNewAccount`
   * adopts an existing row and the welcome is deduplicated on the user id — so
   * a person who already signed up by password and now presses a provider
   * button is left as they were.
   *
   * Returns null: this site opens its own session and lands them on the
   * account page, exactly as the form does.
   */
  async completeSocial(
    claims: {
      sub: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
    },
    pending: PendingSignup,
  ): Promise<string | null> {
    const emailAlerts = pending.emailAlerts ?? false;
    await this.subscribers.seedForNewAccount(
      claims.sub,
      claims.email,
      emailAlerts,
    );
    await this.enqueueWelcome(
      claims.sub,
      claims.email,
      claims.firstName ?? '',
      emailAlerts,
    );
    return null;
  }

  /** What of the form rides through the provider round trip. The email is MAP's to decide. */
  pendingFrom(dto: SocialRegisterDto): PendingSignup {
    return {
      provider: dto.provider,
      firstName: dto.firstName,
      lastName: dto.lastName,
      emailAlerts: dto.emailAlerts,
    };
  }

  /** Where a signup through a provider lands afterwards — the same place the form sends people. */
  socialReturnTo(): string {
    return '/account?welcome=1';
  }

  /** Best-effort, as in `create`: the identity exists either way. */
  private async enqueueWelcome(
    userId: string,
    email: string,
    firstName: string,
    emailAlerts: boolean,
  ): Promise<void> {
    try {
      const siteName =
        (await this.settings.all()).site_name.trim() || 'The Virgin MILF';
      await this.mailQueue.enqueue({
        kind: 'welcome',
        dedupeKey: `welcome:${userId}`,
        userId: userId,
        toEmail: email,
        // The editable file in email_templates/<venture>/live wins when it
        // exists; the TypeScript template is what ships until somebody edits.
        email:
          (await this.fileTemplates.render('welcome', {
            firstName: firstName,
            streamsUrl: `${this.siteUrl}/streams`,
            alertsLine: emailAlerts
              ? 'You asked to hear about streams, so you will get an email when one is scheduled and another shortly before it starts.'
              : 'Stream alerts are off for your account. You can switch them on from your account page at any time.',
            brandName: siteName,
            homeUrl: this.siteUrl,
            logoUrl: null,
          })) ??
          welcomeEmail(
            { name: siteName, homeUrl: this.siteUrl, accent: '#d2111d' },
            {
              firstName: firstName,
              streamsUrl: `${this.siteUrl}/streams`,
              emailAlerts,
            },
          ),
      });
    } catch {
      // A welcome that could not be queued is not worth a failed signup.
    }
  }
}
