<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { api, ApiError, errorMessage } from '../api/client';
import { formatStreamWhen, isLiveNow, type Stream } from '../api/types';
import {
  CalendarShell,
  type CalendarEvent,
  type CalendarRange,
} from '../components/calendar';
import GameCover from '../components/GameCover.vue';
import MarkdownBody from '../components/MarkdownBody.vue';
import PlatformIcon from '../components/PlatformIcon.vue';
import StreamTile from '../components/StreamTile.vue';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { useAuthStore } from '../stores/auth';
import { useSiteStore } from '../stores/site';

/**
 * The stream calendar, and — at `/streams/:id` — one stream's details over it.
 *
 * ## The link is not here until the server sends it
 *
 * A signed-out visitor's stream has no `url` on any channel: the server never
 * writes the key (`streams.serializer.ts`). So this view does not hide
 * anything. It shows "Sign in to get the link" when `linksLocked` is true and
 * the watch buttons when the URLs are there, and there is no state in between
 * for a bug to leak.
 *
 * Signing in from the dialog returns to `/streams/<id>` — this same stream,
 * reloaded with its links — which is why the dialog is driven by the route
 * rather than by a local "open" flag.
 */
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const site = useSiteStore();

// ---------- the calendar ----------

const inRange = ref<Stream[]>([]);
const loading = ref(false);
const error = ref('');

async function load(range: CalendarRange): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const query = new URLSearchParams({
      from: range.from.toUTC().toISO()!,
      to: range.to.toUTC().toISO()!,
    });
    inRange.value = (await api.get<{ streams: Stream[] }>(`/api/site/streams?${query}`)).streams;
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}

const events = computed<CalendarEvent[]>(() =>
  inRange.value.map((stream) => ({
    id: stream.id,
    start: stream.startsAt,
    end: stream.endsAt ?? undefined,
    title: stream.title,
    subtitle: stream.channels.map((channel) => channel.name).join(' · '),
    // A draft is only ever in this list for an admin.
    tone: !stream.isPublished ? 'muted' : isLiveNow(stream) ? 'danger' : 'accent',
    meta: stream,
  })),
);

// ---------- next up ----------

const upcoming = ref<Stream[]>([]);

onMounted(async () => {
  try {
    upcoming.value = (await api.get<{ streams: Stream[] }>('/api/site/streams/upcoming')).streams;
  } catch {
    // The calendar above is the page; this list is a convenience.
  }
});

// ---------- one stream, in the dialog ----------

const selected = ref<Stream | null>(null);
const missing = ref(false);
const selectedId = computed(() => (route.params.id as string | undefined) ?? null);

watch(
  selectedId,
  async (id) => {
    missing.value = false;
    if (!id) {
      selected.value = null;
      return;
    }
    // Shown at once from what the calendar already holds, then replaced by
    // the fetch — which is also what brings the links in after signing in.
    selected.value = inRange.value.find((stream) => stream.id === id) ?? upcoming.value.find((stream) => stream.id === id) ?? null;
    try {
      const { stream } = await api.get<{ stream: Stream }>(`/api/site/streams/${id}`);
      if (selectedId.value === id) selected.value = stream;
    } catch (e) {
      if (selectedId.value !== id) return;
      selected.value = null;
      missing.value = !(e instanceof ApiError) || e.status === 404 || e.status === 400;
      if (!missing.value) error.value = errorMessage(e);
    }
  },
  { immediate: true },
);

const dialogOpen = computed(() => Boolean(selectedId.value) && (Boolean(selected.value) || missing.value));

function open(event: CalendarEvent): void {
  void router.push(`/streams/${event.id}`);
}

function close(): void {
  if (selectedId.value) void router.push('/streams');
}

const signIn = () => auth.startLogin(`/streams/${selectedId.value}`);
</script>

<template>
  <section class="band">
    <div class="band-inner">
      <p class="kicker">When and where</p>
      <h1 class="display mt-2 text-6xl sm:text-7xl">Streams</h1>
      <p v-if="site.settings.streams_intro" class="mt-4 max-w-[60ch] text-lg text-muted">
        {{ site.settings.streams_intro }}
      </p>

      <p v-if="error" class="notice-error mt-6">{{ error }}</p>

      <div class="mt-9">
        <CalendarShell :events="events" :loading="loading" :week-start="7" @range-change="load" @select="open">
          <template #default="{ event }">
            <span
              v-if="(event.meta as Stream).channels.length"
              class="mt-0.5 flex items-center gap-1 opacity-80 max-sm:hidden"
            >
              <PlatformIcon
                v-for="channel in (event.meta as Stream).channels"
                :key="channel.id"
                :platform="channel.platform"
                class="size-3"
              />
            </span>
          </template>
        </CalendarShell>
      </div>
    </div>
  </section>

  <section v-if="upcoming.length" class="band band-alt">
    <div class="band-inner">
      <div class="section-head">
        <h2 class="section-title">Next up</h2>
      </div>
      <div class="mt-8 grid gap-7 md:grid-cols-2 lg:grid-cols-3">
        <StreamTile v-for="stream in upcoming" :key="stream.id" :stream="stream" />
      </div>
    </div>
  </section>

  <Dialog :open="dialogOpen" @update:open="(value) => !value && close()">
    <!-- The close button sits on the red header, so it is white there. -->
    <DialogContent
      class="max-h-[90vh] overflow-y-auto border-[3px] border-rule p-0 sm:max-w-xl [&>[data-slot=dialog-close]]:text-white [&>[data-slot=dialog-close]]:opacity-100"
      style="box-shadow: 8px 8px 0 0 var(--shadow-ink)"
    >
      <template v-if="selected">
        <div class="bg-accent px-6 py-5 pr-12 text-accent-text">
          <p v-if="isLiveNow(selected)" class="chip chip-ink mb-3 !bg-black !text-white">Live now</p>
          <p v-else-if="!selected.isPublished" class="chip chip-ink mb-3 !bg-black !text-white">Draft — only admins can see this</p>
          <DialogHeader class="text-left">
            <DialogTitle class="display text-4xl leading-none">{{ selected.title }}</DialogTitle>
            <DialogDescription class="font-head text-sm font-bold !text-white/90">
              {{ formatStreamWhen(selected.startsAt, selected.endsAt) }}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div class="space-y-6 px-6 pb-6">
          <RouterLink
            v-if="selected.game"
            :to="`/games/${selected.game.slug}`"
            class="flex items-center gap-4 border-2 border-rule no-underline hover:bg-surface-alt"
          >
            <div class="w-32 shrink-0 border-r-2 border-rule">
              <GameCover :title="selected.game.title" :cover-url="selected.game.coverUrl" />
            </div>
            <div class="min-w-0 pr-3">
              <p class="kicker">Playing</p>
              <p class="display truncate text-xl">{{ selected.game.title }}</p>
            </div>
          </RouterLink>

          <MarkdownBody v-if="selected.description" :source="selected.description" />

          <!-- Where to watch. Locked: the server sent no links at all. -->
          <div class="masthead-rule pt-5">
            <p class="kicker">Where to watch</p>

            <template v-if="selected.linksLocked">
              <p class="mt-3 flex flex-wrap gap-2">
                <span v-for="channel in selected.channels" :key="channel.id" class="chip">
                  <PlatformIcon :platform="channel.platform" class="size-3" />
                  {{ channel.name }}
                </span>
              </p>
              <p class="mt-4 text-sm text-muted">
                The link to this stream is for people with an account. It is free, and it is the
                same account that gets you stream alerts.
              </p>
              <div class="mt-4 flex flex-wrap items-center gap-4">
                <button type="button" class="btn" @click="signIn">Sign in to get the link</button>
                <RouterLink v-if="site.isEnabled('signup')" to="/signup" class="kicker">
                  New here? Sign up →
                </RouterLink>
              </div>
            </template>

            <template v-else>
              <div v-if="selected.channels.length" class="mt-4 flex flex-wrap gap-4">
                <a
                  v-for="channel in selected.channels"
                  :key="channel.id"
                  :href="channel.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="btn"
                >
                  <PlatformIcon :platform="channel.platform" class="size-4" />
                  Watch on {{ channel.name }}
                </a>
              </div>
              <p v-else class="mt-3 text-sm text-muted">No channel has been set for this stream yet.</p>
            </template>
          </div>
        </div>
      </template>

      <div v-else class="p-6">
        <DialogHeader class="text-left">
          <DialogTitle class="display text-3xl">That stream is not on the calendar</DialogTitle>
          <DialogDescription>
            It may have been moved or cancelled. The calendar behind this has what is coming up.
          </DialogDescription>
        </DialogHeader>
      </div>
    </DialogContent>
  </Dialog>
</template>
