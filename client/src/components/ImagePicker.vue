<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, errorMessage } from '../api/client';
import type { Upload } from '../api/types';
import { formatBytes } from '../api/types';

/**
 * Choose an uploaded image, or add one without leaving the form.
 *
 * The admin forms had no way to set `*UploadId` at all — only the `*Url`
 * fallback — so uploaded images could be stored and never attached to
 * anything. This is the control that closes that gap.
 *
 * It owns its own list rather than being handed one, because uploading has to
 * refresh it and a parent passing a prop down would have to be told to refetch.
 */
const props = defineProps<{
  /** The chosen upload's id. `''` means none, matching how the forms hold it. */
  modelValue: string;
  label: string;
  /** Shown under the control — what this image is for, and any size rules. */
  hint?: string;
  /**
   * Mime types this particular slot can use, if it is narrower than what the
   * server accepts. Narrows the file dialog and flags an existing choice that
   * does not qualify — the show artwork takes JPEG and PNG only, and a WebP
   * there is not refused by anything here, just quietly rejected by Apple
   * weeks later.
   */
  accept?: string[];
}>();

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const uploads = ref<Upload[]>([]);
const error = ref('');
const busy = ref(false);
const inputId = `image-picker-${Math.random().toString(36).slice(2, 9)}`;

const selected = computed(() => uploads.value.find((u) => u.id === props.modelValue) ?? null);

const ACCEPT_ALL = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const accepted = computed(() => (props.accept ?? ACCEPT_ALL).join(','));
const wrongFormat = computed(
  () => !!props.accept && !!selected.value && !props.accept.includes(selected.value.mimeType),
);

async function load() {
  try {
    uploads.value = (await api.get<{ uploads: Upload[] }>('/api/admin/uploads')).uploads;
  } catch (e) {
    error.value = errorMessage(e);
  }
}

/** Uploads, then selects what was uploaded — the only reason to pick this over the library page. */
async function upload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  error.value = '';
  busy.value = true;
  const body = new FormData();
  body.append('file', file);

  try {
    const { upload: created } = await api.post<{ upload: Upload }>('/api/admin/uploads', body);
    await load();
    emit('update:modelValue', created.id);
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
    input.value = '';
  }
}

onMounted(load);
</script>

<template>
  <div>
    <label :for="inputId" class="kicker block">{{ label }}</label>

    <div class="mt-1.5 flex items-start gap-4">
      <!-- The preview is the point: a filename does not tell anyone which image this is. -->
      <img
        v-if="modelValue"
        :src="`/api/uploads/${modelValue}`"
        :alt="selected?.originalFilename ?? 'Selected image'"
        class="h-20 w-20 shrink-0 border border-border object-cover"
      />
      <div v-else class="h-20 w-20 shrink-0 border border-border bg-surface-alt" aria-hidden="true"></div>

      <div class="min-w-0 grow space-y-2">
        <select
          :id="inputId"
          :value="modelValue"
          class="w-full border border-border bg-surface px-3 py-2 text-sm"
          @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">None</option>
          <option v-for="item in uploads" :key="item.id" :value="item.id">
            {{ item.originalFilename }} ({{ formatBytes(item.byteSize) }})
          </option>
        </select>

        <div class="flex flex-wrap items-center gap-3">
          <input
            type="file"
            :accept="accepted"
            :disabled="busy"
            class="text-xs"
            :aria-label="`Upload a new image for ${label}`"
            @change="upload"
          />
          <span v-if="busy" class="kicker">Uploading…</span>
          <button
            v-else-if="modelValue"
            type="button"
            class="kicker hover:text-danger"
            @click="emit('update:modelValue', '')"
          >
            Clear
          </button>
        </div>
      </div>
    </div>

    <p v-if="wrongFormat" class="mt-2 text-xs text-danger">
      {{ selected?.mimeType }} is not one of the formats this slot accepts. Choose a
      {{ (accept ?? []).map((type) => type.replace('image/', '').toUpperCase()).join(' or ') }} image.
    </p>
    <p v-if="error" class="mt-2 text-xs text-danger">{{ error }}</p>
    <p v-if="hint" class="mt-1.5 text-xs text-muted">{{ hint }}</p>
  </div>
</template>
