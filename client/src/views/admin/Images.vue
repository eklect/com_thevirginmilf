<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, errorMessage } from '../../api/client';
import type { Upload } from '../../api/types';
import { formatBytes, formatDate } from '../../api/types';

/**
 * The image library: every uploaded cover, screenshot and logo.
 *
 * A grid rather than a table, because a filename says almost nothing about an
 * image — `artwork-2.png` tells an admin nothing they need at the moment they
 * are choosing one.
 *
 * An image still used as a game's cover, in a gallery or as the footer logo
 * cannot be deleted from here; the server refuses and says so.
 */
const uploads = ref<Upload[]>([]);
const error = ref('');
const busy = ref(false);
const loaded = ref(false);

async function load() {
  try {
    uploads.value = (await api.get<{ uploads: Upload[] }>('/api/admin/uploads')).uploads;
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loaded.value = true;
  }
}

async function upload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  error.value = '';
  busy.value = true;
  const body = new FormData();
  body.append('file', file);

  try {
    await api.post('/api/admin/uploads', body);
    await load();
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
    // Cleared either way, so picking the same file again still fires `change`.
    input.value = '';
  }
}

/**
 * The server refuses to delete an image anything still points at, and says
 * where. That message is the useful half of this, so it is shown as-is.
 */
async function remove(id: string) {
  error.value = '';
  try {
    await api.delete(`/api/admin/uploads/${id}`);
    await load();
  } catch (e) {
    error.value = errorMessage(e);
  }
}

onMounted(load);
</script>

<template>
  <header>
    <h1 class="display text-3xl">Images</h1>
    <p class="mt-3 max-w-prose text-sm text-muted">
      Post artwork, season artwork and guest photographs. Upload here or straight from the
      page that uses the image; attach it on that page either way. PNG, JPEG, GIF or WebP,
      up to 5&nbsp;MB.
    </p>
  </header>

  <p v-if="error" class="mt-5 border border-danger px-4 py-3 text-sm text-danger">{{ error }}</p>

  <div class="mt-6 border border-border p-5">
    <label for="file" class="kicker block">Upload an image</label>
    <input
      id="file"
      type="file"
      accept="image/png,image/jpeg,image/gif,image/webp"
      :disabled="busy"
      class="mt-2 text-sm"
      @change="upload"
    />
    <p v-if="busy" class="kicker mt-3">Uploading…</p>
    <!--
      SVG is absent from `accept` on purpose, and the server refuses it too:
      this API is same-origin with the site, so an inline SVG would be stored
      XSS with the session cookie in reach.
    -->
    <p class="mt-2 text-xs text-muted">
      SVG is not accepted — it can carry script, and these are served from the site's own origin.
    </p>
  </div>

  <ul v-if="uploads.length" class="mt-7 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
    <li v-for="item in uploads" :key="item.id" class="border border-border">
      <a :href="`/api/uploads/${item.id}`" target="_blank" rel="noopener" class="block no-underline">
        <img
          :src="`/api/uploads/${item.id}`"
          :alt="item.originalFilename"
          class="aspect-square w-full bg-surface-alt object-cover"
          loading="lazy"
        />
      </a>
      <div class="border-t border-border p-3">
        <p class="truncate font-head text-xs" :title="item.originalFilename">
          {{ item.originalFilename }}
        </p>
        <p class="kicker mt-1">{{ formatBytes(item.byteSize) }} · {{ formatDate(item.createdAt) }}</p>
        <button type="button" class="kicker mt-2 text-danger" @click="remove(item.id)">
          Delete
        </button>
      </div>
    </li>
  </ul>

  <p v-else-if="loaded" class="py-10 text-sm text-muted">No images uploaded yet.</p>
</template>
