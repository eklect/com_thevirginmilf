import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StreamEventChannelEntity } from '../streams/stream-event-channel.entity';
import { ChannelEntity } from './channel.entity';
import { ChannelsService } from './channels.service';

@Module({
  imports: [TypeOrmModule.forFeature([ChannelEntity, StreamEventChannelEntity])],
  providers: [ChannelsService],
  exports: [ChannelsService],
})
export class ChannelsModule {}
