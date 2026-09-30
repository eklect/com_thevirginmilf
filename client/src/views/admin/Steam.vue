<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { api, errorMessage } from '../../api/client';
import { formatDateTime, type SteamStatus } from '../../api/types';
import ConfirmButton from './ConfirmButton.vue';

/**
 * Connect her Steam account, and pull her library from it.
 *
 * The key she pastes here is sent once, stored sealed on the server, and never
 * comes back — this screen only ever learns that one is stored. Replacing it
 * is the same form again.
 *
 * A sync runs in the background for as long as the library is large, so this
 * page polls while one is running rather than holding a request open.
 */
const status = ref<SteamStatus | null>(null);
const error = ref('');
const busy = ref(false);
const form = ref({ apiKey: '', profile: '' });
const showForm = ref(false);

let timer = 0;

async function load() {
  try {
    status.value = (await api.get<{ steam: SteamStatus }>('/api/admin/steam')).steam;
    schedule();
  } catch (e) {
    error.value = errorMessage(e);
  }
}

/** Poll every two seconds while a sync is running; stop when it is not. */
function schedule() {
  window.clearTimeout(timer);
  if (status.value?.sync.running) timer = window.setTimeout(load, 2000);
}

async function run(work: () => Promise<{ steam: SteamStatus }>) {
  error.value = '';
  busy.value = true;
  try {
    status.value = (await work()).steam;
    schedule();
    return true;
  } catch (e) {
    error.value = errorMessage(e);
    return false;
  } finally {
    busy.value = false;
  }
}

async function connect() {
  const ok = await run(() =>
    // `steamProfile`, not `profile`: the WAF reads a JSON key called
    // `profile` as the shell dotfile and refuses the request. See the DTO.
    api.put('/api/admin/steam/connection', {
      apiKey: form.value.apiKey.trim(),
      steamProfile: form.value.profile.trim(),
    }),
  );
  if (ok) {
    form.value = { apiKey: '', profile: '' };
    showForm.value = false;
  }
}

const sync = () => run(() => api.post('/api/admin/steam/sync'));
const disconnect = () => run(() => api.delete('/api/admin/steam/connection'));

const progress = computed(() => {
  const s = status.value?.sync;
  if (!s?.running) return null;
  const label = s.phase === 'details' ? 'Fetching store pages' : 'Reading her library';
  return { label, done: s.done, total: s.total, percent: s.total ? Math.round((s.done / s.total) * 100) : 0 };
});

const SYNC_LABELS = { ok: 'Finished', partial: 'Partly finished', failed: 'Failed' } as const;

onMounted(load);
onBeforeUnmount(() => window.clearTimeout(timer));
</script>

<template>
  <h1 class="display text-4xl">Steam</h1>
  <p class="mt-2 max-w-prose text-sm text-muted">
    Her Steam library becomes the game list: what she owns, how long she has played it, and the
    store's artwork and screenshots. It refreshes itself once a day, and whenever you press Sync.
  </p>

  <p v-if="error" class="notice-error mt-5" role="alert">{{ error }}</p>

  <template v-if="status">
    <p v-if="status.fixtureMode" class="notice mt-5">
      <strong>Fixture mode is on</strong> (STEAM_MODE=fixture in the server's environment). The library
      comes from a test file of ten real games with made-up playtimes, not from a Steam account, and
      any key entered below is not checked. Remove that setting and restart the API to connect for real.
    </p>

    <!-- Connected -->
    <section v-if="status.connected" class="mt-7 max-w-2xl border-2 border-rule p-5">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p class="kicker">Connected as</p>
          <p class="display mt-1 text-3xl">{{ status.personaName || status.vanity || status.steamId }}</p>
          <p class="mt-1 text-xs text-muted">
            SteamID {{ status.steamId }} · connected {{ formatDateTime(status.connectedAt) }}
          </p>
        </div>
        <button type="button" class="btn" :disabled="busy || status.sync.running || status.needsReconnect" @click="sync">
          {{ status.sync.running ? 'Syncing…' : 'Sync now' }}
        </button>
      </div>

      <p v-if="status.needsReconnect" class="notice-error mt-4">
        The stored API key can no longer be read — the server's encryption secret has changed since it
        was saved. Enter the key again below to reconnect.
      </p>

      <div v-if="progress" class="mt-5" role="status">
        <p class="kicker">{{ progress.label }} — {{ progress.done }} of {{ progress.total }}</p>
        <div class="mt-2 h-3 border-2 border-rule">
          <div class="h-full bg-accent transition-[width]" :style="{ width: `${progress.percent}%` }"></div>
        </div>
        <p class="mt-2 text-xs text-muted">
          This takes about a second and a half per new game, so a first sync of a big library runs for
          several minutes. It keeps going if you leave this page.
        </p>
      </div>

      <dl v-else-if="status.lastSync.at" class="rule-thin mt-5 grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 pt-4 text-sm">
        <dt class="kicker pt-0.5">Last sync</dt>
        <dd>
          {{ formatDateTime(status.lastSync.at) }} —
          {{ status.lastSync.status ? SYNC_LABELS[status.lastSync.status] : '' }}
        </dd>
        <template v-if="status.lastSync.gameCount !== null">
          <dt class="kicker pt-0.5">In her library</dt>
          <dd>
            {{ status.lastSync.gameCount }} games ·
            <RouterLink to="/admin/games">see them</RouterLink>
          </dd>
        </template>
        <template v-if="status.lastSync.error">
          <dt class="kicker pt-0.5">Note</dt>
          <dd :class="status.lastSync.status === 'failed' ? 'text-danger' : 'text-muted'">{{ status.lastSync.error }}</dd>
        </template>
      </dl>
      <p v-else class="rule-thin mt-5 pt-4 text-sm text-muted">Not synced yet.</p>

      <div class="rule-thin mt-5 flex flex-wrap items-center gap-5 pt-4">
        <button type="button" class="kicker hover:text-text" @click="showForm = !showForm">
          {{ showForm ? 'Never mind' : 'Replace the key or the account' }}
        </button>
        <ConfirmButton
          class="ml-auto"
          label="Disconnect"
          confirm-label="Disconnect Steam?"
          :disabled="busy || status.sync.running"
          @confirm="disconnect"
        />
      </div>
      <p class="mt-2 text-xs text-muted">
        Disconnecting forgets the key. The games stay, with her ratings and reviews.
      </p>
    </section>

    <!-- Connect, or reconnect -->
    <form
      v-if="!status.connected || showForm || status.needsReconnect"
      class="mt-7 max-w-2xl space-y-5"
      @submit.prevent="connect"
    >
      <h2 class="kicker masthead-rule pt-4">{{ status.connected ? 'Replace the connection' : 'Connect her account' }}</h2>

      <ol class="list-decimal space-y-2 pl-5 text-sm text-muted">
        <li>
          Signed in to Steam as her, open
          <a href="https://steamcommunity.com/dev/apikey" target="_blank" rel="noopener noreferrer">steamcommunity.com/dev/apikey</a>.
          For the domain name, enter <strong class="text-text">thevirginmilf.com</strong>. Copy the key it gives you.
        </li>
        <li>
          In Steam, open her profile → <strong class="text-text">Edit Profile</strong> →
          <strong class="text-text">Privacy Settings</strong> and set
          <strong class="text-text">Game details</strong> to <strong class="text-text">Public</strong>, with
          “Always keep my total playtime private” unticked. Without that, Steam sends no game list.
        </li>
        <li>Paste the key and the address of her profile below.</li>
      </ol>

      <div>
        <label for="apiKey" class="kicker block">Steam Web API key</label>
        <input
          id="apiKey"
          v-model="form.apiKey"
          type="password"
          required
          autocomplete="off"
          spellcheck="false"
          pattern="[0-9A-Fa-f]{32}"
          class="input mt-1.5 font-mono"
        />
        <p class="mt-1.5 text-xs text-muted">
          32 letters and digits. It is stored encrypted and never shown again, here or anywhere.
        </p>
      </div>
      <div>
        <label for="profile" class="kicker block">Her Steam profile</label>
        <input
          id="profile"
          v-model="form.profile"
          type="text"
          required
          maxlength="200"
          placeholder="https://steamcommunity.com/id/…"
          class="input mt-1.5"
        />
        <p class="mt-1.5 text-xs text-muted">The profile's address, its custom name, or the 17-digit SteamID.</p>
      </div>

      <button type="submit" class="btn" :disabled="busy">{{ busy ? 'Checking with Steam…' : 'Connect and sync' }}</button>
    </form>
  </template>
</template>
