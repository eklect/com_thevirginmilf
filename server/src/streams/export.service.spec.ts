import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import { redact } from '../calendar-export/detail-level';
import type { MapOptoutsService } from '../map-optouts/map-optouts.service';
import type { SiteSettingEntity } from '../settings/site-setting.entity';
import type { CalendarFeedTokenEntity } from './calendar-feed-token.entity';
import { StreamExportService } from './export.service';
import type { StreamEventEntity } from './stream-event.entity';
import { toStreamView } from './streams.serializer';
import type { StreamsService } from './streams.service';

const event = {
  id: 'st1',
  title: 'Cozy Sunday',
  description: 'Chill **farming** run',
  startsAt: new Date('2027-03-07T20:00:00Z'),
  endsAt: null,
  isPublished: true,
  game: null,
  channelLinks: [
    { channelId: 'c1', sortOrder: 0, urlOverride: null, channel: { name: 'Twitch', platform: 'twitch', url: 'https://twitch.tv/example', isPublished: true } },
  ],
  updatedAt: new Date('2027-03-01T00:00:00Z'),
} as unknown as StreamEventEntity;

const service = new StreamExportService(
  {} as Repository<CalendarFeedTokenEntity>,
  {} as Repository<StreamEventEntity>,
  {} as Repository<SiteSettingEntity>,
  {} as StreamsService,
  {} as MapOptoutsService,
  { get: () => 'https://thevirginmilf.test' } as unknown as ConfigService,
);

describe('stream export', () => {
  it('carries the watch link for a signed-in visitor at full, three hours long', () => {
    const item = redact(service.fromStream(toStreamView(event, { signedIn: true, isAdmin: false })), 'full');
    expect(item.description).toContain('Twitch: https://twitch.tv/example');
    expect(item.end).toBe('2027-03-07T23:00:00.000Z');
  });

  it('never carries the watch link for an anonymous visitor', () => {
    const item = redact(service.fromStream(toStreamView(event, { signedIn: false, isAdmin: false })), 'full');
    expect(item.description).not.toContain('twitch.tv');
    expect(item.description).toContain('Sign in at https://thevirginmilf.test');
    expect(item.location).toBe('Twitch');
  });
});
