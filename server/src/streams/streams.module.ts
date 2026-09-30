import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChannelEntity } from '../channels/channel.entity';
import { GameEntity } from '../games/game.entity';
import { StreamEventChannelEntity } from './stream-event-channel.entity';
import { StreamEventEntity } from './stream-event.entity';
import { StreamsService } from './streams.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StreamEventEntity,
      StreamEventChannelEntity,
      ChannelEntity,
      GameEntity,
    ]),
  ],
  providers: [StreamsService],
  exports: [StreamsService],
})
export class StreamsModule {}
