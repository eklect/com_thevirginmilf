import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MapClientService } from './map-client.service';

/**
 * Talks to MAP.
 *
 * No axios instance is built here any more. The client authenticates per request with a
 * bearer token it fetches and caches itself, so there is no long-lived header to bake
 * into a shared instance — and the credentials it does hold must not sit on an
 * injectable HTTP client that anything in the app could borrow and point elsewhere.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [MapClientService],
  exports: [MapClientService],
})
export class MapClientModule {}
