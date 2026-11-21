<script setup lang="ts">
import { computed } from 'vue';
import { formatDate, formatDuration, VIDEO_KIND_LABELS, type Video } from '../api/types';
import PlatformIcon from './PlatformIcon.vue';

/**
 * One past video. A button, not a link out: pressing it plays the video in
 * the player at the top of the Live page. The platform's own page is one
 * click from there, under the player.
 *
 * The thumbnail is hotlinked from the platform, as the sync stored it. A
 * Twitch broadcast still processing has none, and gets the lettered fallback
 * the game tiles use.
 */
const props = defineProps<{ video: Video; playing?: boolean }>();
defineEmits<{ play: [video: Video] }>();

const duration = computed(() => formatDuration(props.video.durationSeconds));
const platform = computed(() => (props.video.provider === 'vimeo' ? 'other' : props.video.provider));
</script>

<template>
  <button
    type="button"
    class="panel panel-link flex h-full w-full flex-col text-left"
    :class="playing ? '!border-accent' : ''"
    :aria-current="playing ? 'true' : undefined"
    @click="$emit('play', video)"
  >
    <span class="relative block">
      <img
        v-if="video.thumbnailUrl"
        :src="video.thumbnailUrl"
        alt=""
        loading="lazy"
        referrerpolicy="no-referrer"
        class="aspect-video w-full bg-surface-alt object-cover"
      />
      <span v-else class="cover-fallback flex aspect-video w-full items-center justify-center" aria-hidden="true">
        <PlatformIcon :platform="platform" class="size-10 opacity-60" />
      </span>
      <span v-if="playing" class="chip chip-red absolute left-2 top-2">Now playing</span>
      <span v-else-if="video.isPinned" class="chip chip-ink absolute left-2 top-2">Pinned</span>
      <span v-if="duration" class="chip chip-ink absolute bottom-2 right-2 tabular-nums">{{ duration }}</span>
    </span>
    <span class="flex min-w-0 grow flex-col gap-1.5 p-4">
      <span class="flex items-center gap-1.5 text-xs text-muted">
        <PlatformIcon :platform="platform" class="size-3.5" />
        {{ VIDEO_KIND_LABELS[video.kind] }} · {{ formatDate(video.publishedAt) }}
      </span>
      <span class="line-clamp-2 font-head text-base font-bold leading-snug">{{ video.title }}</span>
    </span>
  </button>
</template>
