import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MapOptoutEntity } from './map-optout.entity';
import { MapOptoutsScheduler } from './map-optouts.scheduler';
import { MapOptoutsService } from './map-optouts.service';

/**
 * The per-venture opt-out: a mirror of who removed this application in MAP's
 * portal, and the sync that keeps it current.
 *
 * Global for the reason `MailModule` is — the two queue drains and the two
 * recipient lists all consult it, and none of them should have to import a
 * module to be told whom not to message. Requires `ScheduleModule.forRoot()`
 * in the app module.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([MapOptoutEntity])],
  providers: [MapOptoutsService, MapOptoutsScheduler],
  exports: [MapOptoutsService],
})
export class MapOptoutsModule {}
