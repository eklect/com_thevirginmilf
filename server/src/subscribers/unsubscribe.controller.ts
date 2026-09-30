import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Public } from '../common/auth/auth.decorators';
import { SubscribersService } from './subscribers.service';

/**
 * One-click unsubscribe, without signing in.
 *
 * ## Why GET does not unsubscribe
 *
 * Outlook Safe Links, corporate mail scanners and some prefetchers follow
 * every URL in a message before a human sees it. A `GET` that performed the
 * unsubscribe would hand those scanners the ability to quietly empty the list,
 * and the symptom — subscribers silently vanishing — is close to impossible to
 * diagnose from the outside.
 *
 * So `GET` reports state and the client renders a single button; `POST`
 * performs it. RFC 8058's `List-Unsubscribe-Post` header, which the alert
 * template sets, points compliant clients straight at the POST.
 *
 * Both are idempotent, and a bad token is reported rather than thrown, because
 * the person following this link cannot do anything about it either way.
 */
@Public()
@Controller('unsubscribe')
export class UnsubscribeController {
  constructor(private readonly subscribers: SubscribersService) {}

  @Get(':token')
  async peek(@Param('token') token: string) {
    const row = await this.subscribers.findByToken(token);
    if (!row) return { found: false, subscribed: false, email: null };
    return { found: true, subscribed: row.isSubscribed, email: row.email };
  }

  @Post(':token')
  @HttpCode(HttpStatus.OK)
  async unsubscribe(@Param('token') token: string) {
    const row = await this.subscribers.unsubscribeByToken(token);
    return { found: true, subscribed: row.isSubscribed, email: row.email };
  }

  /** The "that was a mistake" link on the confirmation page. */
  @Post(':token/resubscribe')
  @HttpCode(HttpStatus.OK)
  async resubscribe(@Param('token') token: string) {
    const row = await this.subscribers.resubscribeByToken(token);
    return { found: true, subscribed: row.isSubscribed, email: row.email };
  }
}
