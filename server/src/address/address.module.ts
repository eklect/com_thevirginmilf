import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AddressController } from './address.controller';
import { MapAddressClient } from './map-address.client';

/**
 * The signed-in person's physical address, kept at MAP and shared by every
 * Mucci & Co site. `MapAddressClient` is exported for any feature here that
 * needs the address (shipping, a zip code for tax).
 */
@Module({
  imports: [ConfigModule],
  controllers: [AddressController],
  providers: [MapAddressClient],
  exports: [MapAddressClient],
})
export class AddressModule {}
