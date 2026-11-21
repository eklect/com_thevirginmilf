<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { api } from '../api/client';
import {
  formatDate,
  isLiveNow,
  VIDEO_FILTER_LABELS,
  videoPlayerUrl,
  type Channel,
  type Stream,
  type Video,
  type VideoFilter,
  type VideoPage,
} from '../api/types';
import PlatformIcon from '../components/PlatformIcon.vue';
import StreamTile from '../components/StreamTile.vue';
import VideoTile from '../components/VideoTile.vue';
import { useSiteStore } from '../stores/site';
import { theme } from '../theme';

/**
 * Watch without leaving the site: the Twitch player and chat, embedded, and
 * under it her past broadcasts and videos, which play in that same player.
 *
 * ## What can be embedded, and what is linked instead
 *
 * An embed needs the platform's own name for the channel — `handle` on the
 * channel row — and only two platforms have an embed this page knows how to
 * build. A stream channel with no handle, or on any other platform, is a
 * button that opens it in a new tab. Nothing here guesses a handle from a URL.
 *
 * ## Twitch's `parent`
 *
 * Twitch refuses to load in a frame unless the embedding site's hostname is
 * named in `parent`, and the site is on HTTPS. It is read from the address bar
 * rather than configured, so the same build works on `.test`, behind the Vite
 * proxy and in production.
 *
 * The chat is Twitch's own frame. Reading it needs nothing; posting in it
 * needs the visitor to be signed in to Twitch with third-party cookies
 * allowed, which many browsers no longer do — hence the pop-out link.
 *
 * ## Past videos
 *
 * Synced from her Twitch and YouTube, plus links an admin pasted
 * (`server/src/videos/`). Anyone can watch them — they are public on those
 * platforms already, so unlike a stream's link there is no sign-in gate.
 * Pressing one puts it in the player at the top and writes `?video=<id>` to
 * the address, so a video can be shared and Back returns to the stream.
 * While a video plays the live chat is hidden: Twitch has no embeddable chat
 * replay, and live chat beside a replay is a conversation about something else.
 */
const site = useSiteStore();
const route = useRoute();
const router = useRouter();

const host = window.location.hostname;

const twitch = computed<Channel | null>(
  () => site.streamChannels.find((channel) => channel.platform === 'twitch' && channel.handle) ?? null,
);
const youtube = computed<Channel | null>(
  () => site.streamChannels.find((channel) => channel.platform === 'youtube' && channel.handle) ?? null,
);

type Source = 'twitch' | 'youtube';
const chosen = ref<Source | null>(null);
const source = computed<Source | null>(
  () => chosen.value ?? (twitch.value ? 'twitch' : youtube.value ? 'youtube' : null),
);

// ---------- the video playing, if any ----------

const playing = ref<Video | null>(null);

const livePlayerUrl = computed(() => {
  if (source.value === 'twitch' && twitch.value) {
    const query = new URLSearchParams({ channel: twitch.value.handle!, parent: host, autoplay: 'false' });
    return `https://player.twitch.tv/?${query}`;
  }
  if (source.value === 'youtube' && youtube.value) {
    return `https://www.youtube.com/embed/live_stream?channel=${encodeURIComponent(youtube.value.handle!)}`;
  }
  return null;
});

const playerUrl = computed(() => (playing.value ? videoPlayerUrl(playing.value, host) : livePlayerUrl.value));

const chatUrl = computed(() => {
  if (playing.value || source.value !== 'twitch' || !twitch.value) return null;
  const handle = encodeURIComponent(twitch.value.handle!);
  return `https://www.twitch.tv/embed/${handle}/chat?parent=${encodeURIComponent(host)}${theme.value === 'dark' ? '&darkpopout' : ''}`;
});

const PLATFORM_NAMES = { twitch: 'Twitch', youtube: 'YouTube', vimeo: 'Vimeo' } as const;

/** Everything she streams on, as links out — the embed is one of these too. */
const elsewhere = computed(() => site.streamChannels);

const upcoming = ref<Stream[]>([]);
onMounted(async () => {
  if (!site.isEnabled('streams')) return;
  try {
    upcoming.value = (await api.get<{ streams: Stream[] }>('/api/site/streams/upcoming')).streams;
  } catch {
    // The player is the page; the schedule strip is a convenience.
  }
});

const onNow = computed(() => upcoming.value.find((stream) => isLiveNow(stream)) ?? null);
const next = computed(() => upcoming.value.find((stream) => !isLiveNow(stream)) ?? null);

// ---------- past videos ----------

const videos = ref<Video[]>([]);
const filters = ref<VideoFilter[]>([]);
const filter = ref<VideoFilter | null>(null);
const hasMore = ref(false);
const loadingVideos = ref(false);

async function loadVideos(append = false) {
  loadingVideos.value = true;
  try {
    const query = new URLSearchParams();
    if (filter.value) query.set('kind', filter.value);
    if (append) query.set('offset', String(videos.value.length));
    const page = await api.get<VideoPage>(`/api/site/videos?${query}`);
    videos.value = append ? [...videos.value, ...page.videos] : page.videos;
    hasMore.value = page.hasMore;
    // The chips come from the unfiltered set, so choosing one never hides the others.
    if (!filter.value) filters.value = page.filters;
  } catch {
    // The player is the page; the video list is a convenience.
  } finally {
    loadingVideos.value = false;
  }
}

function chooseFilter(value: VideoFilter | null) {
  if (filter.value === value) return;
  filter.value = value;
  void loadVideos();
}

const player = ref<HTMLElement | null>(null);

/** Puts a video in the player. The address records it; the watcher below does the rest. */
function play(video: Video) {
  if (playing.value?.id === video.id) return;
  playing.value = video;
  void router.push({ query: { ...route.query, video: video.id } });
  void nextTick(() => {
    // The player is in the page's first band, so the top of the page shows it
    // with its title — `scrollIntoView` would tuck it under the sticky header.
    // `auto`, not `smooth`: smooth scrolling never runs in a background tab,
    // and a scroll that silently does nothing loses the player off-screen.
    window.scrollTo({ top: 0, behavior: 'auto' });
    player.value?.focus({ preventScroll: true });
  });
}

function backToLive() {
  const { video: _video, ...rest } = route.query;
  void router.push({ query: rest });
}

/**
 * The address is the source of truth: a shared `?video=` link, Back and
 * Forward all land here. A video already in the list is used as it is; any
 * other id is fetched, and one that no longer exists simply leaves the stream.
 */
watch(
  () => route.query.video,
  async (value) => {
    const id = typeof value === 'string' ? value : null;
    if (!id) {
      playing.value = null;
      return;
    }
    if (playing.value?.id === id) return;
    const known = videos.value.find((video) => video.id === id);
    if (known) {
      playing.value = known;
      return;
    }
    try {
      playing.value = (await api.get<{ video: Video }>(`/api/site/videos/${encodeURIComponent(id)}`)).video;
    } catch {
      playing.value = null;
    }
  },
  { immediate: true },
);

onMounted(() => loadVideos());
</script>

<template>
  <section class="band band-ink">
    <div class="band-inner !py-10">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div class="min-w-0">
          <p v-if="playing" class="chip !border-white !bg-transparent !text-white">Replay</p>
          <p v-else class="chip" :class="onNow ? 'chip-red' : '!border-white !bg-transparent !text-white'">
            {{ onNow ? 'Live now' : 'Off air' }}
          </p>
          <template v-if="playing">
            <h1 class="display mt-3 text-4xl sm:text-6xl">{{ playing.title }}</h1>
            <p class="mt-3 text-white/75">{{ formatDate(playing.publishedAt) }}</p>
          </template>
          <template v-else>
            <h1 class="display mt-3 text-5xl sm:text-7xl">{{ onNow ? onNow.title : 'Live' }}</h1>
            <p v-if="!onNow && site.settings.live_intro" class="mt-3 max-w-[56ch] text-white/75">
              {{ site.settings.live_intro }}
            </p>
          </template>
        </div>

        <button
          v-if="playing"
          type="button"
          class="chip"
          :class="onNow ? 'chip-red' : '!border-white !bg-transparent !text-white'"
          @click="backToLive"
        >
          {{ !livePlayerUrl ? 'Close the video' : onNow ? 'Live now — back to the stream' : 'Back to live' }}
        </button>
        <div v-else-if="!playing && twitch && youtube" class="flex gap-2" role="group" aria-label="Which stream to show">
          <button
            v-for="option in (['twitch', 'youtube'] as const)"
            :key="option"
            type="button"
            class="chip"
            :class="source === option ? 'chip-red' : '!border-white !bg-transparent !text-white'"
            :aria-pressed="source === option"
            @click="chosen = option"
          >
            {{ option === 'twitch' ? 'Twitch' : 'YouTube' }}
          </button>
        </div>
      </div>

      <div
        v-if="playerUrl"
        ref="player"
        tabindex="-1"
        class="mt-7 grid gap-4 outline-none"
        :class="chatUrl ? 'lg:grid-cols-[minmax(0,1fr)_340px]' : ''"
      >
        <div class="border-[3px] border-white bg-black">
          <iframe
            :key="playerUrl"
            :src="playerUrl"
            class="aspect-video w-full"
            :title="playing ? `Video player: ${playing.title}` : 'Live stream player'"
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
            allowfullscreen
          ></iframe>
        </div>
        <div v-if="chatUrl" class="flex min-h-[420px] flex-col border-[3px] border-white bg-black lg:min-h-0">
          <iframe :key="chatUrl" :src="chatUrl" class="w-full grow" title="Stream chat"></iframe>
          <a
            :href="`https://www.twitch.tv/popout/${twitch!.handle}/chat`"
            target="_blank"
            rel="noopener noreferrer"
            class="kicker block border-t-2 border-white px-3 py-2 !text-white no-underline hover:underline"
          >
            Can't type in chat? Open it on Twitch →
          </a>
        </div>
      </div>

      <div v-else class="mt-7 border-[3px] border-white p-8 text-center">
        <p class="display text-3xl">Watch on her channels</p>
        <p class="mx-auto mt-3 max-w-[48ch] text-white/75">
          The player is not set up to show here yet. Her channels are below.
        </p>
      </div>

      <div class="mt-7 flex flex-wrap gap-4">
        <a v-if="playing" :href="playing.url" target="_blank" rel="noopener noreferrer" class="btn-outline">
          <PlatformIcon :platform="playing.provider === 'vimeo' ? 'other' : playing.provider" class="size-4" />
          Watch on {{ PLATFORM_NAMES[playing.provider] }}
        </a>
        <a
          v-for="channel in elsewhere"
          :key="channel.id"
          :href="channel.url"
          target="_blank"
          rel="noopener noreferrer"
          class="btn-outline"
        >
          <PlatformIcon :platform="channel.platform" class="size-4" />
          Open {{ channel.name }}
        </a>
      </div>
    </div>
  </section>
  <div class="stripes" aria-hidden="true"></div>

  <section v-if="videos.length || filter" class="band">
    <div class="band-inner">
      <div class="section-head">
        <h2 class="section-title">Past streams &amp; videos</h2>
        <div v-if="filters.length > 1" class="flex flex-wrap gap-2" role="group" aria-label="Show only">
          <button type="button" class="chip" :class="filter === null ? 'chip-red' : ''" :aria-pressed="filter === null" @click="chooseFilter(null)">
            All
          </button>
          <button
            v-for="option in filters"
            :key="option"
            type="button"
            class="chip"
            :class="filter === option ? 'chip-red' : ''"
            :aria-pressed="filter === option"
            @click="chooseFilter(option)"
          >
            {{ VIDEO_FILTER_LABELS[option] }}
          </button>
        </div>
      </div>

      <ul class="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <li v-for="video in videos" :key="video.id">
          <VideoTile :video="video" :playing="playing?.id === video.id" @play="play" />
        </li>
      </ul>
      <p v-if="!videos.length && !loadingVideos" class="mt-8 text-muted">Nothing of that kind yet.</p>

      <div v-if="hasMore" class="mt-8 text-center">
        <button type="button" class="btn-outline" :disabled="loadingVideos" @click="loadVideos(true)">
          {{ loadingVideos ? 'Loading…' : 'Load more' }}
        </button>
      </div>
    </div>
  </section>

  <section v-if="next" class="band">
    <div class="band-inner">
      <div class="section-head">
        <h2 class="section-title">{{ onNow ? 'After this' : 'Next stream' }}</h2>
        <RouterLink to="/streams" class="kicker">The full calendar →</RouterLink>
      </div>
      <div class="mt-8 max-w-xl">
        <StreamTile :stream="next" />
      </div>
    </div>
  </section>
</template>
