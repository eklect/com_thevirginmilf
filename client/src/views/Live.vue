<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { api } from '../api/client';
import { isLiveNow, type Channel, type Stream } from '../api/types';
import PlatformIcon from '../components/PlatformIcon.vue';
import StreamTile from '../components/StreamTile.vue';
import { useSiteStore } from '../stores/site';
import { theme } from '../theme';

/**
 * Watch without leaving the site: the Twitch player and chat, embedded.
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
 */
const site = useSiteStore();

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

const playerUrl = computed(() => {
  if (source.value === 'twitch' && twitch.value) {
    const query = new URLSearchParams({ channel: twitch.value.handle!, parent: host, autoplay: 'false' });
    return `https://player.twitch.tv/?${query}`;
  }
  if (source.value === 'youtube' && youtube.value) {
    return `https://www.youtube.com/embed/live_stream?channel=${encodeURIComponent(youtube.value.handle!)}`;
  }
  return null;
});

const chatUrl = computed(() => {
  if (source.value !== 'twitch' || !twitch.value) return null;
  const handle = encodeURIComponent(twitch.value.handle!);
  return `https://www.twitch.tv/embed/${handle}/chat?parent=${encodeURIComponent(host)}${theme.value === 'dark' ? '&darkpopout' : ''}`;
});

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
</script>

<template>
  <section class="band band-ink">
    <div class="band-inner !py-10">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p class="chip" :class="onNow ? 'chip-red' : '!border-white !bg-transparent !text-white'">
            {{ onNow ? 'Live now' : 'Off air' }}
          </p>
          <h1 class="display mt-3 text-5xl sm:text-7xl">{{ onNow ? onNow.title : 'Live' }}</h1>
          <p v-if="!onNow && site.settings.live_intro" class="mt-3 max-w-[56ch] text-white/75">
            {{ site.settings.live_intro }}
          </p>
        </div>

        <div v-if="twitch && youtube" class="flex gap-2" role="group" aria-label="Which stream to show">
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

      <div v-if="playerUrl" class="mt-7 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div class="border-[3px] border-white bg-black">
          <iframe
            :key="playerUrl"
            :src="playerUrl"
            class="aspect-video w-full"
            title="Live stream player"
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

      <div v-if="elsewhere.length" class="mt-7 flex flex-wrap gap-4">
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
