import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { CurrentPrincipal } from '../common/auth/principal';
import type { RequestUser } from '../common/auth/principal';
import { PageEnabledGuard } from '../site/page-enabled.guard';
import { UpdateSubscriptionDto } from './dto/subscription.dto';
import { SubscribersService } from './subscribers.service';

/**
 * The signed-in person's own settings. Not `@Public()` — the global
 * `MapSessionGuard` requires a session for everything here.
 *
 * Deliberately narrow: the email half of the account page is one switch (the
 * notification half is `PushController`). Anything identity-shaped — name,
 * email, password — belongs to MAP, and the client links out to the portal
 * for it rather than proxying it.
 */
@UseGuards(PageEnabledGuard('settings'))
@Controller('account')
export class SubscribersController {
  constructor(private readonly subscribers: SubscribersService) {}

  @Get('settings')
  async read(@CurrentPrincipal() user: RequestUser) {
    const row = await this.subscribers.forUser(user);
    return {
      settings: {
        emailAlerts: row.isSubscribed,
        email: row.email,
        unsubscribeToken: row.unsubscribeToken,
      },
    };
  }

  @Put('settings')
  async write(
    @CurrentPrincipal() user: RequestUser,
    @Body() dto: UpdateSubscriptionDto,
  ) {
    const row = await this.subscribers.setSubscribed(user, dto.emailAlerts);
    return {
      settings: {
        emailAlerts: row.isSubscribed,
        email: row.email,
        unsubscribeToken: row.unsubscribeToken,
      },
    };
  }
}
