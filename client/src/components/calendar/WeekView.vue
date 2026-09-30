<script setup lang="ts">
import type { DateTime } from 'luxon';
import { DateTime as Luxon } from 'luxon';
import CalendarEntry from './CalendarEntry.vue';
import { dayKey } from './useCalendar';
import type { CalendarEvent } from './types';

defineProps<{ days: DateTime[]; groups: Map<string, CalendarEvent[]> }>();
const emit = defineEmits<{ select: [event: CalendarEvent]; selectDay: [date: DateTime] }>();
const todayKey = Luxon.local().toISODate();
</script>

<template>
  <div class="grid gap-2 md:grid-cols-7 md:gap-0 md:overflow-hidden md:border-2 md:border-rule md:bg-surface">
    <section
      v-for="day in days"
      :key="dayKey(day)"
      class="border-2 border-rule bg-surface md:min-h-72 md:border-0 md:border-r md:border-border md:last:border-r-0"
    >
      <button
        type="button"
        class="flex w-full items-baseline justify-between gap-2 border-b border-border px-2 py-1.5 text-left hover:bg-surface-alt"
        @click="emit('selectDay', day)"
      >
        <span class="text-[11px] font-semibold uppercase tracking-wide text-muted">{{ day.toFormat('ccc') }}</span>
        <span
          class="flex size-6 items-center justify-center rounded-full text-sm"
          :class="dayKey(day) === todayKey ? 'bg-accent font-semibold text-accent-text' : 'text-ink'"
        >
          {{ day.day }}
        </span>
      </button>
      <div class="space-y-1 p-1.5">
        <p v-if="!(groups.get(dayKey(day))?.length)" class="px-1 py-2 text-center text-xs text-muted md:hidden">Nothing scheduled</p>
        <CalendarEntry v-for="event in groups.get(dayKey(day)) ?? []" :key="event.id" :event="event" @select="emit('select', $event)">
          <template #default="slotProps"><slot v-bind="slotProps" /></template>
        </CalendarEntry>
      </div>
    </section>
  </div>
</template>
