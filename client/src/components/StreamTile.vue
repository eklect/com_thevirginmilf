<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { formatStreamWhen, isLiveNow, type Stream } from '../api/types';
import PlatformIcon from './PlatformIcon.vue';

/**
 * One stream as a ticket: the date torn off down the left, what and where on
 * the right. Links to the stream's place on the calendar, which is where the
 * watch link is — this tile never carries it.
 */
const props = defineProps<{ stream: Stream }>();

const start = computed(() => new Date(props.stream.startsAt));
const month = computed(() => start.value.toLocaleDateString('en-US', { month: 'short' }));
const day = computed(() => start.value.getDate());
const weekday = computed(() => start.value.toLocaleDateString('en-US', { weekday: 'short' }));
const live = computed(() => isLiveNow(props.stream));
</script>

<template>
  <RouterLink :to="`/streams/${stream.id}`" class="panel panel-link flex h-full">
    <div
      class="flex w-24 shrink-0 flex-col items-center justify-center border-r-2 border-rule bg-accent px-2 py-4 text-accent-text"
    >
      <span class="font-head text-[11px] font-extrabold uppercase tracking-[0.14em]">{{ weekday }}</span>
      <span class="display text-5xl">{{ day }}</span>
      <span class="font-head text-[11px] font-extrabold uppercase tracking-[0.14em]">{{ month }}</span>
    </div>
    <div class="flex min-w-0 grow flex-col gap-2 p-4">
      <p v-if="live" class="chip chip-red self-start">Live now</p>
      <p v-else-if="!stream.isPublished" class="chip chip-ink self-start">Draft</p>
      <h3 class="display text-2xl">{{ stream.title }}</h3>
      <p class="text-sm text-muted">{{ formatStreamWhen(stream.startsAt, stream.endsAt) }}</p>
      <p v-if="stream.game" class="text-sm">
        Playing <strong class="font-semibold">{{ stream.game.title }}</strong>
      </p>
      <p class="mt-auto flex flex-wrap gap-2 pt-1">
        <span v-for="channel in stream.channels" :key="channel.id" class="chip">
          <PlatformIcon :platform="channel.platform" class="size-3" />
          {{ channel.name }}
        </span>
      </p>
    </div>
  </RouterLink>
</template>
