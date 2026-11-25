import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Put,
} from '@nestjs/common';
import { CurrentPrincipal, type RequestUser } from '../common/auth/principal';
import { AddressDto } from './address.dto';
import { MapAddressClient } from './map-address.client';

/**
 * The signed-in person's own physical address: `GET` and `PUT /api/me/address`.
 *
 * Always their own. The id comes from the session, never from the request, so
 * there is no way to ask for anybody else's. A caller that is not a person
 * signed in here (an API key, where the app has them) is refused: a key acts
 * for an account, and an address belongs to a person.
 */
@Controller('me/address')
export class AddressController {
  constructor(private readonly addresses: MapAddressClient) {}

  @Get()
  async get(@CurrentPrincipal() user: RequestUser) {
    this.personOnly(user);
    return { address: await this.addresses.get(user.id) };
  }

  @Put()
  async save(@Body() dto: AddressDto, @CurrentPrincipal() user: RequestUser) {
    this.personOnly(user);
    if (!user.mapSessionId) {
      throw new ConflictException('Sign in again to change your address.');
    }
    return {
      address: await this.addresses.save(user.id, user.mapSessionId, { ...dto }),
    };
  }

  private personOnly(user: RequestUser): void {
    if ((user as { apiKey?: unknown }).apiKey) {
      throw new ForbiddenException('An address belongs to a person, not an API key.');
    }
  }
}
