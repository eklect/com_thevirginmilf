import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChannelEntity } from '../channels/channel.entity';
import { VideoConnectionEntity } from './video-connection.entity';
import { VideoEntity } from './video.entity';
import { VideosClient } from './videos.client';
import { VideosScheduler } from './videos.scheduler';
import { VideosService } from './videos.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      VideoEntity,
      VideoConnectionEntity,
      ChannelEntity,
    ]),
  ],
  providers: [VideosClient, VideosService, VideosScheduler],
  exports: [VideosService],
})
export class VideosModule {}
