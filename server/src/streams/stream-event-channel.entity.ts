import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { ChannelEntity } from '../channels/channel.entity';
import { StreamEventEntity } from './stream-event.entity';

/**
 * `stream_event_channels` — where one stream is being broadcast.
 *
 * `url_override` is for the stream that has its own address: a YouTube
 * premiere, a collab on somebody else's channel. Empty, the link is the
 * channel's own URL.
 *
 * The channel side is `RESTRICT`: deleting a channel out from under past
 * streams would silently rewrite where they were. `ChannelsService.remove`
 * turns that into a sentence.
 */
@Entity('stream_event_channels')
@Index('ix_stream_event_channels_channel', ['channelId'])
export class StreamEventChannelEntity {
  @PrimaryColumn({ name: 'event_id', type: 'char', length: 36 })
  eventId!: string;

  @PrimaryColumn({ name: 'channel_id', type: 'char', length: 36 })
  channelId!: string;

  @ManyToOne(() => StreamEventEntity, (event) => event.channelLinks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'event_id' })
  event?: StreamEventEntity;

  @ManyToOne(() => ChannelEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'channel_id' })
  channel?: ChannelEntity;

  @Column({ name: 'url_override', type: 'varchar', length: 500, nullable: true })
  urlOverride!: string | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;
}
