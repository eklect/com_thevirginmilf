<script setup lang="ts">
import { DateTime } from 'luxon';
import { computed } from 'vue';
import type { CalendarEvent, CalendarTone } from './types';

/**
 * One event on the grid. The tone maps to theme tokens here and nowhere
 * else; a caller that wants its own inline content (icons, a count) puts it
 * in the default slot.
 *
 * An event with an `end` prints its range — "7:00 PM – 10:00 PM" — everywhere
 * but the month grid, where `compact` keeps a cell to the start time alone
 * and stacks it over the title: a seventh of the page is too narrow for a
 * time and a title side by side, and the title is the half worth reading.
 */
const props = withDefaults(defineProps<{ event: CalendarEvent; compact?: boolean }>(), { compact: false });
const emit = defineEmits<{ select: [event: CalendarEvent] }>();

const TONES: Record<CalendarTone, string> = {
  accent: 'border-accent bg-accent/10 text-ink hover:bg-accent/20',
  success: 'border-ok-text/60 bg-ok-bg text-ok-text hover:brightness-95',
  warning: 'border-warn-text/60 bg-warn-bg text-warn-text hover:brightness-95',
  danger: 'border-danger bg-danger/10 text-danger hover:bg-danger/15',
  muted: 'border-border bg-surface-alt text-muted hover:text-text',
  pending: 'border-accent/50 bg-surface-alt text-muted animate-pulse',
};

const toneClass = computed(() => TONES[props.event.tone ?? 'accent']);
const time = computed(() => {
  const start = DateTime.fromISO(props.event.start).toLocal().toFormat('t');
  if (props.compact || !props.event.end) return start;
  const end = DateTime.fromISO(props.event.end).toLocal();
  return end.isValid ? `${start} – ${end.toFormat('t')}` : start;
});
</script>

<template>
  <button
    type="button"
    class="flex w-full min-w-0 items-start border-l-4 px-1.5 py-1 text-left text-xs transition-colors"
    :class="[toneClass, compact ? 'flex-col' : 'gap-1.5']"
    :title="event.title"
    @click="emit('select', event)"
  >
    <span class="shrink-0 tabular-nums opacity-80" :class="compact ? 'text-[11px] max-sm:hidden' : ''">{{ time }}</span>
    <span class="min-w-0" :class="compact ? 'w-full' : 'flex-1'">
      <span class="block font-semibold" :class="compact ? 'line-clamp-2 leading-tight' : 'truncate'">{{ event.title }}</span>
      <span v-if="!compact && event.subtitle" class="block truncate opacity-80">{{ event.subtitle }}</span>
      <slot :event="event" />
    </span>
  </button>
</template>
