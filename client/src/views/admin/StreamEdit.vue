<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { api, errorMessage } from '../../api/client';
import type { AdminChannel, AdminGame, AdminStream } from '../../api/types';
import MarkdownEditor from '../../components/MarkdownEditor.vue';
import { fromLocalInput, localZone, toLocalInput } from './datetime';
import { useSaveNotice } from './useSaveNotice';

const route = useRoute();
const router = useRouter();
const id = route.params.id as string | undefined;

const form = ref({
  title: '',
  startsAt: '',
  endsAt: '',
  gameId: '',
  description: '',
  isPublished: false,
  notify: true,
});

/**
 * One row per stream channel, ticked or not, each with its own optional link.
 * Kept as the whole list rather than only the chosen ones so that unticking a
 * channel and ticking it again does not lose the link typed beside it.
 */
const picks = ref<{ channel: AdminChannel; on: boolean; urlOverride: string }[]>([]);
const games = ref<AdminGame[]>([]);
const alreadyAnnounced = ref(false);

const error = ref('');
const busy = ref(false);

// This view returns to /admin/streams on success, so the confirmation has to
// be said there rather than on a form that is already unmounting.
const { flashSaved, clearNotice, alertEl, revealAlert } = useSaveNotice();

onMounted(async () => {
  try {
    const [channelData, gameData, streamData] = await Promise.all([
      api.get<{ channels: AdminChannel[] }>('/api/admin/channels'),
      api.get<{ games: AdminGame[] }>('/api/admin/games'),
      id ? api.get<{ stream: AdminStream }>(`/api/admin/streams/${id}`) : Promise.resolve(null),
    ]);
    games.value = gameData.games;

    const stream = streamData?.stream ?? null;
    const linked = new Map(stream?.channelLinks.map((link) => [link.channelId, link]) ?? []);
    // Stream channels, plus anything already on this stream that has since
    // stopped being one — dropping it silently would unlink it on save.
    picks.value = channelData.channels
      .filter((channel) => channel.isStreamChannel || linked.has(channel.id))
      .map((channel) => ({
        channel,
        on: linked.has(channel.id),
        urlOverride: linked.get(channel.id)?.urlOverride ?? '',
      }));

    if (stream) {
      alreadyAnnounced.value = Boolean(stream.announcedAt);
      form.value = {
        title: stream.title,
        startsAt: toLocalInput(stream.startsAt),
        endsAt: toLocalInput(stream.endsAt),
        gameId: stream.gameId ?? '',
        description: stream.description ?? '',
        isPublished: stream.isPublished,
        notify: stream.notify,
      };
    } else if (picks.value.length === 1) {
      // One place she streams: it is on every stream unless she says otherwise.
      picks.value[0]!.on = true;
    }
  } catch (e) {
    error.value = errorMessage(e);
  }
});

const zone = localZone();

const willNotify = computed(
  () => form.value.isPublished && form.value.notify && !alreadyAnnounced.value,
);

async function save() {
  error.value = '';
  clearNotice();
  busy.value = true;
  // Exactly the fields the DTO declares — the API refuses unknown keys.
  const body = {
    title: form.value.title,
    startsAt: fromLocalInput(form.value.startsAt),
    endsAt: fromLocalInput(form.value.endsAt),
    gameId: form.value.gameId || null,
    description: form.value.description || null,
    isPublished: form.value.isPublished,
    notify: form.value.notify,
    channels: picks.value
      .filter((pick) => pick.on)
      .map((pick) => ({ channelId: pick.channel.id, urlOverride: pick.urlOverride.trim() || null })),
  };
  try {
    if (id) await api.put(`/api/admin/streams/${id}`, body);
    else await api.post('/api/admin/streams', body);
    flashSaved(
      willNotify.value
        ? 'Stream saved. It will be announced in about two minutes.'
        : id
          ? 'Stream saved.'
          : 'Stream created.',
      '/admin/streams',
    );
    void router.push('/admin/streams');
  } catch (e) {
    error.value = errorMessage(e);
    await revealAlert();
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <h1 class="display text-4xl">{{ id ? 'Edit stream' : 'Schedule a stream' }}</h1>
  <p v-if="error" ref="alertEl" role="alert" class="notice-error mt-5">{{ error }}</p>

  <form class="mt-7 max-w-2xl space-y-6" @submit.prevent="save">
    <div>
      <label for="title" class="kicker block">Title</label>
      <input id="title" v-model="form.title" type="text" required maxlength="200" class="input mt-1.5" />
    </div>

    <div class="grid gap-5 sm:grid-cols-2">
      <div>
        <label for="startsAt" class="kicker block">Starts</label>
        <input id="startsAt" v-model="form.startsAt" type="datetime-local" required class="input mt-1.5" />
      </div>
      <div>
        <label for="endsAt" class="kicker block">Ends (optional)</label>
        <input id="endsAt" v-model="form.endsAt" type="datetime-local" class="input mt-1.5" />
      </div>
      <p class="-mt-2 text-xs text-muted sm:col-span-2">
        Your time here ({{ zone }}). The calendar shows each visitor their own.
      </p>
    </div>

    <fieldset>
      <legend class="kicker">Where it is on</legend>
      <p v-if="!picks.length" class="mt-2 text-sm text-muted">
        No stream channels yet.
        <RouterLink to="/admin/channels">Add one</RouterLink> and mark it as somewhere she streams.
      </p>
      <div v-for="pick in picks" :key="pick.channel.id" class="mt-3 border border-border p-3">
        <label class="flex cursor-pointer items-center gap-3 text-sm font-semibold">
          <input v-model="pick.on" type="checkbox" class="size-4 accent-[var(--accent)]" />
          {{ pick.channel.name }}
          <span v-if="!pick.channel.isPublished" class="chip chip-ink">Unpublished</span>
        </label>
        <div v-if="pick.on" class="mt-3">
          <label :for="`url-${pick.channel.id}`" class="kicker block">
            This stream's own link (optional)
          </label>
          <input
            :id="`url-${pick.channel.id}`"
            v-model="pick.urlOverride"
            type="url"
            :placeholder="pick.channel.url"
            class="input mt-1.5"
          />
          <p class="mt-1.5 text-xs text-muted">
            Leave it empty to use the channel's own address. Only signed-in people are shown the link.
          </p>
        </div>
      </div>
    </fieldset>

    <div>
      <label for="game" class="kicker block">Playing (optional)</label>
      <select id="game" v-model="form.gameId" class="input mt-1.5">
        <option value="">Not one game in particular</option>
        <option v-for="game in games" :key="game.id" :value="game.id">
          {{ game.title }}{{ game.isHidden ? ' (hidden)' : '' }}
        </option>
      </select>
    </div>

    <div>
      <label class="kicker block">Description (optional)</label>
      <MarkdownEditor v-model="form.description" class="mt-1.5" />
      <p class="mt-1.5 text-xs text-muted">
        Everyone can read this, signed in or not. Put the stream link on the channel above — a link
        typed here is public.
      </p>
    </div>

    <div class="space-y-3 border-2 border-rule bg-surface-alt p-4">
      <label class="flex cursor-pointer items-start gap-3 text-sm">
        <input v-model="form.isPublished" type="checkbox" class="mt-0.5 size-4 accent-[var(--accent)]" />
        <span>
          <span class="font-head font-bold">Published</span>
          <span class="block text-xs text-muted">On the calendar for everyone. Unticked, it is a draft only admins see.</span>
        </span>
      </label>
      <label class="flex cursor-pointer items-start gap-3 text-sm">
        <input v-model="form.notify" type="checkbox" class="mt-0.5 size-4 accent-[var(--accent)]" />
        <span>
          <span class="font-head font-bold">Tell people about this stream</span>
          <span class="block text-xs text-muted">
            The announcement and the reminder, by email and notification. Untick it for a stream you
            want on the calendar without alerting anyone.
          </span>
        </span>
      </label>
      <p v-if="willNotify" class="text-xs font-semibold text-accent-ink">
        Saving will announce this stream to everyone signed up, about two minutes from now.
      </p>
      <p v-else-if="alreadyAnnounced" class="text-xs text-muted">
        This stream has already been announced, so saving will not announce it again. Moving its time
        does send a fresh reminder.
      </p>
    </div>

    <div class="flex items-center gap-5">
      <button type="submit" :disabled="busy" class="btn">{{ busy ? 'Saving…' : 'Save' }}</button>
      <RouterLink to="/admin/streams" class="kicker no-underline hover:text-text">Cancel</RouterLink>
    </div>
  </form>
</template>
