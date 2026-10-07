import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileTemplateService } from '../email-templates/file-template.service';
import { MailQueueService } from '../mail/mail-queue.service';
import { welcomeEmail } from '../mail/templates/welcome';
import { MapClientService } from '../map-client/map-client.service';
import { SettingsService } from '../settings/settings.service';
import { SubscribersService } from '../subscribers/subscribers.service';
import { CreateRegisterDto } from './dto/create-register.dto';

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

  async create(dto: CreateRegisterDto): Promise<{ ok: true }> {
    const user = await this.mapClient.createUser({
      email: dto.email,
      password: dto.password,
      firstName: dto.firstName,
      lastName: dto.lastName,
    });

    const emailAlerts = dto.emailAlerts ?? false;
    await this.subscribers.seedForNewAccount(user.id, dto.email, emailAlerts);

    try {
      const siteName = (await this.settings.all()).site_name.trim() || 'The Virgin MILF';
      await this.mailQueue.enqueue({
        kind: 'welcome',
        dedupeKey: `welcome:${user.id}`,
        userId: user.id,
        toEmail: dto.email,
        // The editable file in email_templates/<venture>/live wins when it
        // exists; the TypeScript template is what ships until somebody edits.
        email:
          (await this.fileTemplates.render('welcome', {
            firstName: dto.firstName,
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
            { firstName: dto.firstName, streamsUrl: `${this.siteUrl}/streams`, emailAlerts },
          ),
      });
    } catch {
      // A welcome that could not be queued is not worth a failed signup.
    }

    // Nothing is returned about the account — not the MAP user id, not a token.
    // The browser's next step is the ordinary sign-in redirect, which is where
    // a session comes from.
    return { ok: true };
  }
}
