import type { VideoKind, VideoProvider } from './video.entity';

/**
 * A pasted video link, read.
 *
 * Adapted from PCME's `sessions/streams/stream-providers.ts`: exact hostnames
 * (a lookalike such as `youtube.com.example.net` matches none), https only, no
 * credentials or port, and what is stored is the canonical URL rebuilt from
 * the id — never the paste. The client never receives a raw URL to frame; it
 * builds the player from `provider`, `kind` and `externalId`.
 *
 * Only what the Live page can play is accepted: a YouTube video, a Twitch
 * video or clip, a Vimeo video. A channel link is refused — the player at the
 * top already shows the channel.
 */
export interface ParsedVideoLink {
  provider: VideoProvider;
  kind: VideoKind;
  externalId: string;
  url: string;
}

export const VIDEO_LINK_HELP = 'Use a YouTube, Twitch or Vimeo video link';

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const TWITCH_VIDEO_ID = /^\d{1,14}$/;
const TWITCH_CLIP_SLUG = /^[A-Za-z0-9_-]{3,120}$/;
const VIMEO_ID = /^\d{1,14}$/;

const YOUTUBE_HOSTS = [
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
];
const TWITCH_HOSTS = ['twitch.tv', 'www.twitch.tv', 'm.twitch.tv'];
const CLIPS_HOSTS = ['clips.twitch.tv'];
const VIMEO_HOSTS = ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'];

export const youtubeUrl = (id: string) =>
  `https://www.youtube.com/watch?v=${id}`;
export const twitchVideoUrl = (id: string) =>
  `https://www.twitch.tv/videos/${id}`;
export const twitchClipUrl = (slug: string) =>
  `https://clips.twitch.tv/${slug}`;
export const vimeoUrl = (id: string) => `https://vimeo.com/${id}`;

const segments = (url: URL) => url.pathname.split('/').filter(Boolean);

export function parseVideoLink(
  raw: string,
): ParsedVideoLink | { error: string } {
  const generic = { error: VIDEO_LINK_HELP };
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return generic;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port)
    return generic;
  const host = url.hostname.toLowerCase();
  const parts = segments(url);

  if (YOUTUBE_HOSTS.includes(host)) {
    let id: string | null | undefined = null;
    if (host === 'youtu.be') id = parts[0];
    else if (parts[0] === 'watch') id = url.searchParams.get('v');
    else if (['live', 'embed', 'shorts'].includes(parts[0] ?? ''))
      id = parts[1];
    if (id && YOUTUBE_ID.test(id)) {
      return {
        provider: 'youtube',
        kind: 'video',
        externalId: id,
        url: youtubeUrl(id),
      };
    }
    return {
      error:
        'That is not a YouTube video link. Open the video and copy its address.',
    };
  }

  if (CLIPS_HOSTS.includes(host)) {
    const slug = parts[0];
    if (slug && TWITCH_CLIP_SLUG.test(slug)) {
      return {
        provider: 'twitch',
        kind: 'clip',
        externalId: slug,
        url: twitchClipUrl(slug),
      };
    }
    return { error: 'That is not a Twitch clip link.' };
  }

  if (TWITCH_HOSTS.includes(host)) {
    // twitch.tv/videos/<id>
    if (parts[0] === 'videos' && parts[1] && TWITCH_VIDEO_ID.test(parts[1])) {
      // A Twitch video's type (broadcast, highlight, upload) is not in its
      // URL. A pasted one is filed as `video`; the sync, if it also finds the
      // video, does not change a custom row's kind.
      return {
        provider: 'twitch',
        kind: 'video',
        externalId: parts[1],
        url: twitchVideoUrl(parts[1]),
      };
    }
    // twitch.tv/<login>/clip/<slug>
    if (parts[1] === 'clip' && parts[2] && TWITCH_CLIP_SLUG.test(parts[2])) {
      return {
        provider: 'twitch',
        kind: 'clip',
        externalId: parts[2],
        url: twitchClipUrl(parts[2]),
      };
    }
    return {
      error:
        'That is not a Twitch video or clip link. A channel link is not a video.',
    };
  }

  if (VIMEO_HOSTS.includes(host)) {
    // vimeo.com/<id>, player.vimeo.com/video/<id>, vimeo.com/channels/x/<id>
    const id =
      host === 'player.vimeo.com' && parts[0] === 'video'
        ? parts[1]
        : parts.findLast((p) => VIMEO_ID.test(p));
    if (id && VIMEO_ID.test(id)) {
      return {
        provider: 'vimeo',
        kind: 'video',
        externalId: id,
        url: vimeoUrl(id),
      };
    }
    return { error: 'That is not a Vimeo video link.' };
  }

  return generic;
}
