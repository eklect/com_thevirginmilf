<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { api, errorMessage } from '../../api/client';
import {
  formatDate,
  formatDateTime,
  formatDuration,
  TWITCH_KIND_LABELS,
  VIDEO_KIND_LABELS,
  type AdminVideo,
  type TwitchKind,
  type VideoConnectionStatus,
} from '../../api/types';
import ConfirmButton from './ConfirmButton.vue';
import SortButton from '@/components/table/SortButton.vue';
import { useSortableTable } from '@/composables/useSortableTable';

/**
 * The past videos on the Live page: the keys the sync reads Twitch and
 * YouTube with, the sync itself, pasted links, and the list.
 *
 * The keys are sent once, stored sealed on the server, and never come back —
 * this screen only learns that one is stored. Which accounts are read is NOT
 * set here: it is every stream channel with a handle, on the Channels screen,
 * the same ones the Live page's player uses.
 *
 * A sync runs in the background, so the page polls while one is running.
 */
const status = ref<VideoConnectionStatus | null>(null);
const videos = ref<AdminVideo[]>([]);
const error = ref('');
const notice = ref('');
const busy = ref(false);

const twitchForm = ref({ clientId: '', clientSecret: '' });
const youtubeForm = ref({ apiKey: '' });
const showTwitch = ref(false);
const showYoutube = ref(false);
const addForm = ref({ url: '', title: '' });
const show = ref<'visible' | 'hidden' | 'gone'>('visible');

let timer = 0;

async function loadStatus() {
  try {
    const wasRunning = status.value?.sync.running;
    status.value = (await api.get<{ connection: VideoConnectionStatus }>('/api/admin/videos/connection')).connection;
    if (wasRunning && !status.value.sync.running) await loadVideos();
    schedule();
  } catch (e) {
    error.value = errorMessage(e);
  }
}

async function loadVideos() {
  try {
    videos.value = (await api.get<{ videos: AdminVideo[] }>('/api/admin/videos')).videos;
  } catch (e) {
    error.value = errorMessage(e);
  }
}

function schedule() {
  window.clearTimeout(timer);
  if (status.value?.sync.running) timer = window.setTimeout(loadStatus, 2000);
}

async function saveConnection(body: Record<string, unknown>): Promise<boolean> {
  error.value = '';
  notice.value = '';
  busy.value = true;
  try {
    status.value = (await api.put<{ connection: VideoConnectionStatus }>('/api/admin/videos/connection', body)).connection;
    schedule();
    return true;
  } catch (e) {
    error.value = errorMessage(e);
    return false;
  } finally {
    busy.value = false;
  }
}

async function saveTwitch() {
  const ok = await saveConnection({
    twitchClientId: twitchForm.value.clientId.trim(),
    twitchClientSecret: twitchForm.value.clientSecret.trim(),
  });
  if (ok) {
    twitchForm.value = { clientId: '', clientSecret: '' };
    showTwitch.value = false;
    notice.value = 'Twitch is connected. A sync has started.';
  }
}

async function saveYoutube() {
  const ok = await saveConnection({ youtubeApiKey: youtubeForm.value.apiKey.trim() });
  if (ok) {
    youtubeForm.value = { apiKey: '' };
    showYoutube.value = false;
    notice.value = 'YouTube is connected. A sync has started.';
  }
}

function toggleKind(kind: TwitchKind) {
  if (!status.value) return;
  const kinds = status.value.twitchKinds.includes(kind)
    ? status.value.twitchKinds.filter((k) => k !== kind)
    : [...status.value.twitchKinds, kind];
  void saveConnection({ twitchKinds: kinds });
}

async function sync() {
  error.value = '';
  notice.value = '';
  busy.value = true;
  try {
    status.value = (await api.post<{ connection: VideoConnectionStatus }>('/api/admin/videos/sync')).connection;
    schedule();
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}

async function add() {
  error.value = '';
  notice.value = '';
  busy.value = true;
  try {
    const { video } = await api.post<{ video: AdminVideo }>('/api/admin/videos', {
      url: addForm.value.url.trim(),
      title: addForm.value.title.trim() || null,
    });
    videos.value = [video, ...videos.value].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    addForm.value = { url: '', title: '' };
    show.value = 'visible';
    notice.value = `Added “${video.title}”.`;
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}

async function update(video: AdminVideo, patch: Partial<Pick<AdminVideo, 'isHidden' | 'isPinned'>> & { title?: string | null }) {
  error.value = '';
  try {
    const { video: saved } = await api.put<{ video: AdminVideo }>(`/api/admin/videos/${video.id}`, patch);
    videos.value = videos.value.map((row) => (row.id === saved.id ? saved : row));
  } catch (e) {
    error.value = errorMessage(e);
  }
}

function rename(video: AdminVideo, event: Event) {
  const value = (event.target as HTMLInputElement).value.trim();
  if ((video.titleOverride ?? '') === value) return;
  void update(video, { title: value || null });
}

async function remove(video: AdminVideo) {
  error.value = '';
  try {
    await api.delete(`/api/admin/videos/${video.id}`);
    videos.value = videos.value.filter((row) => row.id !== video.id);
  } catch (e) {
    error.value = errorMessage(e);
  }
}

const counts = computed(() => ({
  visible: videos.value.filter((v) => !v.isHidden && !v.goneAt).length,
  hidden: videos.value.filter((v) => v.isHidden && !v.goneAt).length,
  gone: videos.value.filter((v) => v.goneAt).length,
}));

const shown = computed(() =>
  videos.value.filter((v) =>
    show.value === 'gone' ? v.goneAt : show.value === 'hidden' ? v.isHidden && !v.goneAt : !v.isHidden && !v.goneAt,
  ),
);

const SYNC_LABELS = { ok: 'Finished', partial: 'Partly finished', failed: 'Failed' } as const;
const SOURCE_LABELS = { twitch: 'Twitch', youtube: 'YouTube', custom: 'Pasted' } as const;
const PROVIDER_LABELS = { twitch: 'Twitch', youtube: 'YouTube', vimeo: 'Vimeo' } as const;

const anyConnected = computed(
  () =>
    (status.value?.twitch.connected && status.value.twitch.channels.length > 0) ||
    (status.value?.youtube.connected && status.value.youtube.channels.length > 0),
);

onMounted(() => Promise.all([loadStatus(), loadVideos()]));
onBeforeUnmount(() => window.clearTimeout(timer));

const sort = useSortableTable(
  () => shown.value,
  {
    title: (row: AdminVideo) => row.titleOverride || row.sourceTitle,
    source: (row: AdminVideo) => SOURCE_LABELS[row.source],
  },
  { storageKey: 'admin-videos' },
);
</script>

<template>
  <h1 class="display text-4xl">Videos</h1>
  <p class="mt-2 max-w-prose text-sm text-muted">
    The past streams and videos on the Live page. Her Twitch and YouTube are read twice an hour and
    whenever you press Sync. You can also paste any YouTube, Twitch or Vimeo video. Anyone can watch
    them, signed in or not, in the player at the top of the page.
  </p>

  <p v-if="error" class="notice-error mt-5" role="alert">{{ error }}</p>
  <p v-if="notice" class="notice mt-5" role="status">{{ notice }}</p>

  <template v-if="status">
    <p v-if="status.fixtureMode" class="notice mt-5">
      <strong>Fixture mode is on</strong> (VIDEOS_MODE=fixture in the server's environment). Every channel
      gets a test list of videos, and both platforms count as connected without any key. Remove that
      setting and restart the API to sync for real.
    </p>

    <!-- The sync -->
    <section class="mt-7 max-w-3xl border-2 border-rule p-5">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p class="kicker">Sync</p>
          <p v-if="status.sync.running" class="mt-1" role="status">
            Reading {{ status.sync.platform === 'youtube' ? 'YouTube' : 'Twitch' }}… {{ status.sync.done }} videos so far.
          </p>
          <p v-else-if="status.lastSync.at" class="mt-1 text-sm">
            {{ formatDateTime(status.lastSync.at) }} —
            {{ status.lastSync.status ? SYNC_LABELS[status.lastSync.status] : '' }}<template v-if="status.lastSync.count !== null">,
              {{ status.lastSync.count }} videos read</template>
          </p>
          <p v-else class="mt-1 text-sm text-muted">Not synced yet.</p>
          <p
            v-if="status.lastSync.error && !status.sync.running"
            class="mt-2 text-sm"
            :class="status.lastSync.status === 'failed' ? 'text-danger' : 'text-muted'"
          >
            {{ status.lastSync.error }}
          </p>
        </div>
        <button type="button" class="btn" :disabled="busy || status.sync.running || !anyConnected" @click="sync">
          {{ status.sync.running ? 'Syncing…' : 'Sync now' }}
        </button>
      </div>
      <p class="rule-thin mt-4 pt-3 text-xs text-muted">
        The accounts read are the stream channels with a handle on the
        <RouterLink to="/admin/channels">Channels</RouterLink> screen: the Twitch login, and the YouTube
        channel id (starts with UC). They are the same ones the player uses.
      </p>
    </section>

    <!-- Twitch -->
    <section class="mt-6 max-w-3xl border-2 border-rule p-5">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p class="kicker">Twitch</p>
          <p class="display mt-1 text-2xl">{{ status.twitch.connected ? 'Connected' : 'Not connected' }}</p>
          <p v-if="status.twitch.clientId" class="mt-1 font-mono text-xs text-muted">Client ID {{ status.twitch.clientId }}</p>
          <p class="mt-1 text-xs text-muted">
            <template v-if="status.twitch.channels.length">
              Reads {{ status.twitch.channels.map((c) => c.handle).join(', ') }}
            </template>
            <template v-else>No Twitch stream channel has a handle yet.</template>
          </p>
        </div>
        <button v-if="status.twitch.connected && !status.fixtureMode" type="button" class="kicker hover:text-text" @click="showTwitch = !showTwitch">
          {{ showTwitch ? 'Never mind' : 'Replace the keys' }}
        </button>
      </div>

      <p v-if="status.twitch.needsReconnect" class="notice-error mt-4">
        The stored secret can no longer be read, because the server's encryption secret has changed
        since it was saved. Enter the Client ID and secret again.
      </p>

      <fieldset class="rule-thin mt-4 pt-4">
        <legend class="kicker">What to take from Twitch</legend>
        <div class="mt-2 flex flex-wrap gap-x-6 gap-y-2">
          <label v-for="(text, kind) in TWITCH_KIND_LABELS" :key="kind" class="flex items-center gap-2 text-sm">
            <input type="checkbox" :checked="status.twitchKinds.includes(kind)" :disabled="busy" @change="toggleKind(kind)" />
            {{ text }}
          </label>
        </div>
        <p class="mt-2 text-xs text-muted">
          Twitch deletes past broadcasts after 7 to 60 days, depending on the account. When one goes,
          it leaves the site at the next sync. Highlights, uploads and clips stay until they're deleted on Twitch.
          Unticking a kind takes it off the site and keeps the rows.
        </p>
      </fieldset>

      <form
        v-if="!status.fixtureMode && (!status.twitch.connected || showTwitch || status.twitch.needsReconnect)"
        class="rule-thin mt-4 space-y-4 pt-4"
        @submit.prevent="saveTwitch"
      >
        <ol class="list-decimal space-y-1.5 pl-5 text-sm text-muted">
          <li>
            Open <a href="https://dev.twitch.tv/console/apps" target="_blank" rel="noopener noreferrer">dev.twitch.tv/console/apps</a>
            and choose <strong class="text-text">Register Your Application</strong>. Any account works. It does not
            have to be hers.
          </li>
          <li>
            Use any name, OAuth Redirect URL <strong class="text-text">http://localhost</strong>, category
            <strong class="text-text">Website Integration</strong>, client type <strong class="text-text">Confidential</strong>.
          </li>
          <li>Open the application, copy the Client ID, press <strong class="text-text">New Secret</strong> and copy that too.</li>
        </ol>
        <div>
          <label for="twitchClientId" class="kicker block">Client ID</label>
          <input id="twitchClientId" v-model="twitchForm.clientId" required autocomplete="off" spellcheck="false" class="input mt-1.5 font-mono" />
        </div>
        <div>
          <label for="twitchClientSecret" class="kicker block">Client Secret</label>
          <input
            id="twitchClientSecret"
            v-model="twitchForm.clientSecret"
            type="password"
            required
            autocomplete="off"
            spellcheck="false"
            class="input mt-1.5 font-mono"
          />
          <p class="mt-1.5 text-xs text-muted">Stored encrypted and never shown again, here or anywhere.</p>
        </div>
        <button type="submit" class="btn" :disabled="busy">{{ busy ? 'Checking with Twitch…' : 'Connect Twitch' }}</button>
      </form>

      <div v-else-if="status.twitch.connected && !status.fixtureMode" class="rule-thin mt-4 flex pt-4">
        <ConfirmButton class="ml-auto" label="Disconnect" confirm-label="Disconnect Twitch?" :disabled="busy" @confirm="saveConnection({ forgetTwitch: true })" />
      </div>
    </section>

    <!-- YouTube -->
    <section class="mt-6 max-w-3xl border-2 border-rule p-5">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p class="kicker">YouTube</p>
          <p class="display mt-1 text-2xl">{{ status.youtube.connected ? 'Connected' : 'Not connected' }}</p>
          <p class="mt-1 text-xs text-muted">
            <template v-if="status.youtube.channels.length">
              Reads {{ status.youtube.channels.map((c) => c.name).join(', ') }}
            </template>
            <template v-else>No YouTube stream channel has a handle (its UC… channel id) yet.</template>
          </p>
        </div>
        <button v-if="status.youtube.connected && !status.fixtureMode" type="button" class="kicker hover:text-text" @click="showYoutube = !showYoutube">
          {{ showYoutube ? 'Never mind' : 'Replace the key' }}
        </button>
      </div>

      <p v-if="status.youtube.needsReconnect" class="notice-error mt-4">
        The stored key can no longer be read, because the server's encryption secret has changed since
        it was saved. Enter the key again.
      </p>

      <form
        v-if="!status.fixtureMode && (!status.youtube.connected || showYoutube || status.youtube.needsReconnect)"
        class="rule-thin mt-4 space-y-4 pt-4"
        @submit.prevent="saveYoutube"
      >
        <ol class="list-decimal space-y-1.5 pl-5 text-sm text-muted">
          <li>
            In <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noopener noreferrer">Google Cloud</a>,
            pick or create a project and enable the <strong class="text-text">YouTube Data API v3</strong>.
          </li>
          <li>
            Go to <strong class="text-text">APIs &amp; Services → Credentials → Create credentials → API key</strong>.
            Restrict it to the YouTube Data API v3.
          </li>
          <li>Paste it below. Everything synced is public, so no YouTube sign-in is needed.</li>
        </ol>
        <div>
          <label for="youtubeApiKey" class="kicker block">API key</label>
          <input
            id="youtubeApiKey"
            v-model="youtubeForm.apiKey"
            type="password"
            required
            autocomplete="off"
            spellcheck="false"
            class="input mt-1.5 font-mono"
          />
          <p class="mt-1.5 text-xs text-muted">Stored encrypted and never shown again, here or anywhere.</p>
        </div>
        <button type="submit" class="btn" :disabled="busy">{{ busy ? 'Checking with YouTube…' : 'Connect YouTube' }}</button>
      </form>

      <div v-else-if="status.youtube.connected && !status.fixtureMode" class="rule-thin mt-4 flex pt-4">
        <ConfirmButton class="ml-auto" label="Disconnect" confirm-label="Disconnect YouTube?" :disabled="busy" @confirm="saveConnection({ forgetYoutube: true })" />
      </div>
    </section>
  </template>

  <!-- Add a video -->
  <form class="mt-8 max-w-3xl space-y-4" @submit.prevent="add">
    <h2 class="kicker masthead-rule pt-4">Add a video</h2>
    <div>
      <label for="videoUrl" class="kicker block">Link</label>
      <input
        id="videoUrl"
        v-model="addForm.url"
        type="url"
        required
        maxlength="500"
        placeholder="https://www.youtube.com/watch?v=…"
        class="input mt-1.5"
      />
      <p class="mt-1.5 text-xs text-muted">
        A YouTube video, a Twitch video or clip, or a Vimeo video. It can be anyone's, like a collab or a
        guest spot. It has to allow embedding on other sites.
      </p>
    </div>
    <div>
      <label for="videoTitle" class="kicker block">Title <span class="normal-case tracking-normal text-muted">(optional)</span></label>
      <input id="videoTitle" v-model="addForm.title" maxlength="300" class="input mt-1.5" />
      <p class="mt-1.5 text-xs text-muted">Leave it blank to use the video's own title, where the platform can tell us.</p>
    </div>
    <button type="submit" class="btn" :disabled="busy">Add the video</button>
  </form>

  <!-- The list -->
  <div class="mt-10 flex flex-wrap items-end justify-between gap-4 border-b-[3px] border-rule pb-3">
    <h2 class="kicker">On the list</h2>
    <div class="flex gap-2" role="group" aria-label="Show">
      <button
        v-for="option in (['visible', 'hidden', 'gone'] as const)"
        :key="option"
        type="button"
        class="chip"
        :class="show === option ? 'chip-red' : ''"
        :aria-pressed="show === option"
        @click="show = option"
      >
        {{ option === 'visible' ? 'Showing' : option === 'hidden' ? 'Hidden' : 'Gone from the platform' }} ({{ counts[option] }})
      </button>
    </div>
  </div>

  <div class="overflow-x-auto">
    <table v-if="shown.length" class="mt-4 w-full min-w-[760px] text-sm">
      <thead>
        <tr class="border-b border-border text-left">
          <th class="kicker py-2.5 w-10 pr-4 text-right">#</th>
          <th class="kicker w-32 py-2.5"></th>
          <th class="kicker py-2.5" :aria-sort="sort.ariaSort('title')">
            <SortButton :table="sort" column="title">Title</SortButton>
          </th>
          <th class="kicker w-40 py-2.5" :aria-sort="sort.ariaSort('source')">
            <SortButton :table="sort" column="source">From</SortButton>
          </th>
          <th class="kicker w-36 py-2.5"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(video, rowIndex) in sort.sorted.value" :key="video.id" class="border-b border-border align-top">
          <td class="py-3 pr-4 text-right text-xs tabular-nums text-muted">{{ rowIndex + 1 }}</td>
          <td class="py-3 pr-4">
            <img v-if="video.thumbnailUrl" :src="video.thumbnailUrl" alt="" loading="lazy" referrerpolicy="no-referrer" class="aspect-video w-28 object-cover" />
            <div v-else class="aspect-video w-28 bg-surface-alt"></div>
          </td>
          <td class="py-3 pr-4">
            <input
              :value="video.titleOverride ?? ''"
              :placeholder="video.sourceTitle"
              :aria-label="`Title for ${video.sourceTitle}`"
              maxlength="300"
              class="input !py-1.5"
              @change="rename(video, $event)"
            />
            <span class="mt-1 block text-xs text-muted">
              {{ VIDEO_KIND_LABELS[video.kind] }} · {{ formatDate(video.publishedAt) }}
              <template v-if="video.durationSeconds"> · {{ formatDuration(video.durationSeconds) }}</template>
              <template v-if="video.goneAt"> · gone {{ formatDate(video.goneAt) }}</template>
              ·
              <a :href="video.url" target="_blank" rel="noopener noreferrer">open on {{ PROVIDER_LABELS[video.provider] }}</a>
              ·
              <RouterLink :to="{ path: '/live', query: { video: video.id } }">play on the site</RouterLink>
            </span>
          </td>
          <td class="py-3 text-xs text-muted">{{ SOURCE_LABELS[video.source] }}</td>
          <td class="py-3 text-right">
            <div class="flex flex-col items-end gap-1.5">
              <button type="button" class="kicker hover:text-text" @click="update(video, { isPinned: !video.isPinned })">
                {{ video.isPinned ? 'Unpin' : 'Pin to the top' }}
              </button>
              <button type="button" class="kicker hover:text-text" @click="update(video, { isHidden: !video.isHidden })">
                {{ video.isHidden ? 'Show' : 'Hide' }}
              </button>
              <ConfirmButton v-if="video.source === 'custom'" @confirm="remove(video)" />
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
  <p v-if="!shown.length" class="py-10 text-sm text-muted">Nothing here.</p>
</template>
