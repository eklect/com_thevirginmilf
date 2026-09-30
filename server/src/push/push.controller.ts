import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentPrincipal } from '../common/auth/principal';
import type { RequestUser } from '../common/auth/principal';
import { PageEnabledGuard } from '../site/page-enabled.guard';
import { RemovePushSubscriptionDto, SavePushSubscriptionDto } from './dto/push.dto';
import { PushSubscriptionsService } from './push-subscriptions.service';

/**
 * The signed-in person's own notification devices. Not `@Public()` — the
 * global `MapSessionGuard` requires a session for everything here, and every
 * write is scoped to the caller's `sub`.
 *
 * There is deliberately no route that lists endpoints back. The browser knows
 * its own subscription (`pushManager.getSubscription()`); the server only
 * needs to say how many devices an account has.
 */
@UseGuards(PageEnabledGuard('settings'))
@Controller('account/push-subscriptions')
export class PushController {
  constructor(private readonly subscriptions: PushSubscriptionsService) {}

  @Get()
  async read(@CurrentPrincipal() user: RequestUser) {
    return { devices: await this.subscriptions.countForUser(user.id) };
  }

  /** "Turn on for this device" — and the silent re-sync on later visits. */
  @Post()
  @HttpCode(HttpStatus.OK)
  async save(
    @CurrentPrincipal() user: RequestUser,
    @Body() dto: SavePushSubscriptionDto,
    @Req() request: Request,
  ) {
    await this.subscriptions.save(user.id, dto, request.get('user-agent'));
    return { devices: await this.subscriptions.countForUser(user.id) };
  }

  /** "Turn off on every device". */
  @Delete()
  async removeAll(@CurrentPrincipal() user: RequestUser) {
    await this.subscriptions.removeAll(user.id);
    return { devices: 0 };
  }

  /**
   * "Turn off on this device". A POST rather than a DELETE with a body: the
   * endpoint is a long URL that has to travel in one, and a body on DELETE is
   * the kind of thing a proxy is entitled to drop.
   */
  @Post('remove')
  @HttpCode(HttpStatus.OK)
  async removeOne(
    @CurrentPrincipal() user: RequestUser,
    @Body() dto: RemovePushSubscriptionDto,
  ) {
    await this.subscriptions.removeOne(user.id, dto.endpoint);
    return { devices: await this.subscriptions.countForUser(user.id) };
  }
}
