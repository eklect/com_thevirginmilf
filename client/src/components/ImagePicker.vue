<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { api, ApiError, errorMessage } from '../api/client';
import type { Upload } from '../api/types';
import { formatBytes } from '../api/types';
import ImageLibraryDialog from './ImageLibraryDialog.vue';

/**
 * Choose an uploaded image, or add one without leaving the form.
 *
 * The control on every cover, logo and artwork slot: a preview of the current
 * choice and a button that opens the library (`ImageLibraryDialog`), where
 * images are searched, scrolled a page at a time, and uploaded by dropping
 * them in. It used to be a dropdown of every filename, which stopped being
 * usable once a library held more than a screenful.
 *
 * `modelValue` is still the upload's id, so no form that uses this changed.
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

const selected = ref<Upload | null>(null);
const error = ref('');
const open = ref(false);
const labelId = `image-picker-${Math.random().toString(36).slice(2, 9)}`;

const wrongFormat = computed(
  () => !!props.accept && !!selected.value && !props.accept.includes(selected.value.mimeType),
);

/**
 * The name and type of the current choice.
 *
 * The library is read a page at a time now, so the chosen image is not
 * necessarily in any list this component has seen. It is asked for by id, and
 * only when the dialog did not just hand it over.
 */
watch(
  () => props.modelValue,
  async (id) => {
    error.value = '';
    if (!id) {
      selected.value = null;
      return;
    }
    if (selected.value?.id === id) return;
    selected.value = null;
    try {
      const { upload } = await api.get<{ upload: Upload }>(`/api/admin/uploads/${id}`);
      if (props.modelValue === id) selected.value = upload;
    } catch (e) {
      // A 404 is an image deleted since it was chosen; the empty preview says so.
      if (!(e instanceof ApiError && e.status === 404)) error.value = errorMessage(e);
    }
  },
  { immediate: true },
);

function choose(image: Upload): void {
  selected.value = image;
  emit('update:modelValue', image.id);
}
</script>

<template>
  <div>
    <span :id="labelId" class="kicker block">{{ label }}</span>

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
        <p class="truncate text-sm" :class="modelValue ? '' : 'text-muted'">
          <template v-if="selected">
            {{ selected.originalFilename }} ({{ formatBytes(selected.byteSize) }})
          </template>
          <template v-else-if="modelValue">Selected image</template>
          <template v-else>None</template>
        </p>

        <div class="flex flex-wrap items-center gap-3">
          <button
            type="button"
            class="border border-border bg-surface px-3 py-1.5 text-sm hover:border-accent"
            :aria-describedby="labelId"
            @click="open = true"
          >
            {{ modelValue ? 'Change image' : 'Choose image' }}
          </button>
          <button
            v-if="modelValue"
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

    <ImageLibraryDialog
      v-model:open="open"
      :selected-id="modelValue"
      :accept="accept"
      :label="label"
      @choose="choose"
    />
  </div>
</template>
