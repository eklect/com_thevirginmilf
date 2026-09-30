<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { api, errorMessage } from '../../api/client';
import {
  CHANNEL_PLATFORMS,
  PLATFORM_LABELS,
  type AdminChannel,
  type ChannelPlatform,
} from '../../api/types';
import { useSiteStore } from '../../stores/site';
import { useSaveNotice } from './useSaveNotice';

const route = useRoute();
const router = useRouter();
const site = useSiteStore();
const id = route.params.id as string | undefined;

const form = ref({
  name: '',
  platform: 'twitch' as ChannelPlatform,
  url: '',
  handle: '',
  description: '',
  isStreamChannel: true,
  showOnLinks: true,
  isPublished: true,
});
const error = ref('');
const busy = ref(false);

// This view returns to /admin/channels on success, so the confirmation has to
// be said there rather than on a form that is already unmounting.
const { flashSaved, clearNotice } = useSaveNotice();

onMounted(async () => {
  if (!id) return;
  try {
    const { item } = await api.get<{ item: AdminChannel }>(`/api/admin/channels/${id}`);
    form.value = {
      name: item.name,
      platform: item.platform,
      url: item.url,
      handle: item.handle ?? '',
      description: item.description ?? '',
      isStreamChannel: item.isStreamChannel,
      showOnLinks: item.showOnLinks,
      isPublished: item.isPublished,
    };
  } catch (e) {
    error.value = errorMessage(e);
  }
});

/** What the handle is, in the platform's own words — only two can be embedded. */
const handleHelp = computed(() => {
  if (form.value.platform === 'twitch') {
    return 'The Twitch channel name, as in twitch.tv/NAME. With it, the Live page embeds the player and chat.';
  }
  if (form.value.platform === 'youtube') {
    return 'The YouTube channel ID — it starts with UC and is 24 characters, from YouTube Studio → Settings → Channel → Advanced. Not the @handle. With it, the Live page can embed the live stream.';
  }
  return '';
});

async function save() {
  error.value = '';
  clearNotice();
  busy.value = true;
  try {
    // Exactly the fields the DTO declares — the API refuses unknown keys.
    const body = {
      name: form.value.name,
      platform: form.value.platform,
      url: form.value.url,
      handle: handleHelp.value ? form.value.handle || null : null,
      description: form.value.description || null,
      isStreamChannel: form.value.isStreamChannel,
      showOnLinks: form.value.showOnLinks,
      isPublished: form.value.isPublished,
    };
    if (id) await api.put(`/api/admin/channels/${id}`, body);
    else await api.post('/api/admin/channels', body);
    // The footer and two pages draw channels from the bootstrap.
    await site.reload();
    flashSaved(id ? 'Channel saved.' : 'Channel added.', '/admin/channels');
    void router.push('/admin/channels');
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <h1 class="display text-4xl">{{ id ? 'Edit channel' : 'Add a channel' }}</h1>
  <p v-if="error" class="notice-error mt-5">{{ error }}</p>

  <form class="mt-7 max-w-xl space-y-5" @submit.prevent="save">
    <div class="grid gap-5 sm:grid-cols-2">
      <div>
        <label for="name" class="kicker block">Name</label>
        <input id="name" v-model="form.name" type="text" required maxlength="80" class="input mt-1.5" />
      </div>
      <div>
        <label for="platform" class="kicker block">Platform</label>
        <select id="platform" v-model="form.platform" class="input mt-1.5">
          <option v-for="platform in CHANNEL_PLATFORMS" :key="platform" :value="platform">
            {{ PLATFORM_LABELS[platform] }}
          </option>
        </select>
      </div>
    </div>

    <div>
      <label for="url" class="kicker block">Link</label>
      <input
        id="url"
        v-model="form.url"
        type="text"
        required
        maxlength="500"
        :placeholder="form.platform === 'email' ? 'mailto:hello@example.com' : 'https://…'"
        class="input mt-1.5"
      />
      <p class="mt-1.5 text-xs text-muted">Starts with https:// — or mailto: for an email address.</p>
    </div>

    <div v-if="handleHelp">
      <label for="handle" class="kicker block">Handle (optional)</label>
      <input id="handle" v-model="form.handle" type="text" maxlength="120" class="input mt-1.5" />
      <p class="mt-1.5 text-xs text-muted">{{ handleHelp }}</p>
    </div>

    <div>
      <label for="description" class="kicker block">Line on the Links page (optional)</label>
      <input id="description" v-model="form.description" type="text" maxlength="200" class="input mt-1.5" />
    </div>

    <div class="space-y-2.5">
      <label class="flex cursor-pointer items-center gap-2.5 text-sm">
        <input v-model="form.isStreamChannel" type="checkbox" class="size-4 accent-[var(--accent)]" />
        She streams here — offer it when scheduling a stream
      </label>
      <label class="flex cursor-pointer items-center gap-2.5 text-sm">
        <input v-model="form.showOnLinks" type="checkbox" class="size-4 accent-[var(--accent)]" />
        Show it on the Links page and in the footer
      </label>
      <label class="flex cursor-pointer items-center gap-2.5 text-sm">
        <input v-model="form.isPublished" type="checkbox" class="size-4 accent-[var(--accent)]" />
        Published
      </label>
    </div>

    <div class="flex items-center gap-5">
      <button type="submit" :disabled="busy" class="btn">{{ busy ? 'Saving…' : 'Save' }}</button>
      <RouterLink to="/admin/channels" class="kicker no-underline hover:text-text">Cancel</RouterLink>
    </div>
  </form>
</template>
