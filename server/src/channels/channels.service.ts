import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { OrderedCrudService } from '../common/ordered-crud.service';
import { slugify } from '../common/slug';
import { StreamEventChannelEntity } from '../streams/stream-event-channel.entity';
import { ChannelEntity } from './channel.entity';

@Injectable()
export class ChannelsService extends OrderedCrudService<ChannelEntity> {
  constructor(
    @InjectRepository(ChannelEntity) repo: Repository<ChannelEntity>,
    @InjectRepository(StreamEventChannelEntity)
    private readonly eventChannels: Repository<StreamEventChannelEntity>,
  ) {
    super(repo);
  }

  async create(input: DeepPartial<ChannelEntity>): Promise<ChannelEntity> {
    const slug = input.slug?.trim() || slugify(String(input.name ?? ''), 'channel');
    return super.create({ ...input, slug });
  }

  /**
   * Refuses while a stream still names the channel.
   *
   * The foreign key would refuse it anyway (`RESTRICT`), as a 500 with a
   * constraint name in it. This says which thing to change instead. Unpublish
   * is the way to retire a channel that past streams used.
   */
  async remove(id: string): Promise<void> {
    const used = await this.eventChannels.count({ where: { channelId: id } });
    if (used > 0) {
      throw new ConflictException(
        `This channel is on ${used} stream${used > 1 ? 's' : ''}. Unpublish it instead, or take it off ${used > 1 ? 'those streams' : 'that stream'} first.`,
      );
    }
    await super.remove(id);
  }
}
