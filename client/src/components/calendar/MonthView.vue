<script setup lang="ts">
import type { DateTime } from 'luxon';
import { DateTime as Luxon } from 'luxon';
import { computed } from 'vue';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import CalendarEntry from './CalendarEntry.vue';
import { dayKey } from './useCalendar';
import type { CalendarEvent } from './types';

const props = defineProps<{
  days: DateTime[];
  weekdays: string[];
  anchor: DateTime;
  groups: Map<string, CalendarEvent[]>;
  maxPerDay?: number;
}>();
const emit = defineEmits<{ select: [event: CalendarEvent]; selectDay: [date: DateTime] }>();

const limit = computed(() => props.maxPerDay ?? 3);
const todayKey = Luxon.local().toISODate();
</script>

<template>
  <div class="overflow-hidden border-2 border-rule bg-surface">
    <div class="grid grid-cols-7 border-b-2 border-rule bg-ink text-center font-head text-[11px] font-extrabold uppercase tracking-[0.14em] text-bg">
      <div v-for="name in weekdays" :key="name" class="py-2">{{ name }}</div>
    </div>
    <div class="grid grid-cols-7">
      <div
        v-for="day in days"
        :key="dayKey(day)"
        class="min-h-20 border-b border-r border-border p-1 last:border-r-0 sm:min-h-28 [&:nth-child(7n)]:border-r-0"
        :class="day.month !== anchor.month ? 'bg-surface-alt' : ''"
      >
        <button
          type="button"
          class="mb-1 flex size-6 items-center justify-center rounded-full text-xs"
          :class="[
            dayKey(day) === todayKey ? 'bg-accent font-semibold text-accent-text' : 'text-muted hover:bg-surface-alt hover:text-text',
            day.month !== anchor.month ? 'opacity-60' : '',
          ]"
          :aria-label="day.toFormat('cccc d LLLL')"
          @click="emit('selectDay', day)"
        >
          {{ day.day }}
        </button>
        <div class="space-y-1">
          <CalendarEntry
            v-for="event in (groups.get(dayKey(day)) ?? []).slice(0, limit)"
            :key="event.id"
            :event="event"
            compact
            @select="emit('select', $event)"
          >
            <template #default="slotProps"><slot v-bind="slotProps" /></template>
          </CalendarEntry>
          <Popover v-if="(groups.get(dayKey(day))?.length ?? 0) > limit">
            <PopoverTrigger as-child>
              <button type="button" class="w-full rounded px-1.5 py-0.5 text-left text-[11px] font-medium text-accent hover:bg-surface-alt">
                +{{ (groups.get(dayKey(day))?.length ?? 0) - limit }} more
              </button>
            </PopoverTrigger>
            <PopoverContent class="w-72 space-y-1 p-2" align="start">
              <p class="mb-1 px-1 text-xs font-semibold text-ink">{{ day.toFormat('cccc, d LLLL') }}</p>
              <CalendarEntry
                v-for="event in groups.get(dayKey(day)) ?? []"
                :key="event.id"
                :event="event"
                @select="emit('select', $event)"
              >
                <template #default="slotProps"><slot v-bind="slotProps" /></template>
              </CalendarEntry>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  </div>
</template>
