<script setup lang="ts">
import type { DateTime } from 'luxon';
import CalendarEntry from './CalendarEntry.vue';
import { dayKey } from './useCalendar';
import type { CalendarEvent } from './types';

defineProps<{ day: DateTime; groups: Map<string, CalendarEvent[]> }>();
const emit = defineEmits<{ select: [event: CalendarEvent] }>();
</script>

<template>
  <div class="border-2 border-rule bg-surface">
    <div v-if="!(groups.get(dayKey(day))?.length)" class="px-4 py-12 text-center text-sm text-muted">
      Nothing scheduled on {{ day.toFormat('cccc, d LLLL') }}.
    </div>
    <ul v-else class="divide-y divide-border">
      <li v-for="event in groups.get(dayKey(day)) ?? []" :key="event.id" class="p-2">
        <CalendarEntry :event="event" class="text-sm" @select="emit('select', $event)">
          <template #default="slotProps"><slot v-bind="slotProps" /></template>
        </CalendarEntry>
      </li>
    </ul>
  </div>
</template>
