<script setup lang="ts">
import { ref, watch } from 'vue';

/**
 * A game's cover at Steam's header proportions (460 × 215).
 *
 * Falls back to the title on the red slab when there is no image — and when
 * there is one that fails to load, which for a hotlinked Steam URL is a real
 * case: the store withdraws art for a delisted game. A broken-image glyph in a
 * grid of covers reads as a broken site.
 */
const props = defineProps<{ title: string; coverUrl: string | null }>();

const failed = ref(false);
watch(
  () => props.coverUrl,
  () => (failed.value = false),
);
</script>

<template>
  <img
    v-if="coverUrl && !failed"
    :src="coverUrl"
    :alt="`${title} cover art`"
    loading="lazy"
    class="aspect-[460/215] w-full bg-surface-alt object-cover"
    @error="failed = true"
  />
  <div v-else class="cover-fallback aspect-[460/215] w-full" aria-hidden="true">
    <span class="line-clamp-2">{{ title }}</span>
  </div>
</template>
