<script setup lang="ts">
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';
import type { DateTime } from 'luxon';
import { computed, watch } from 'vue';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DayView from './DayView.vue';
import MonthView from './MonthView.vue';
import WeekView from './WeekView.vue';
import { groupByDay, useCalendar } from './useCalendar';
import type { CalendarEvent, CalendarRange, CalendarView, WeekStart } from './types';

/**
 * The one component a caller mounts. Hand it events, listen for
 * `range-change` to fetch more, and `select` to open whatever an entry is.
 * State (view, anchor) is owned here; `v-model:view` and `v-model:anchor`
 * are for a caller that wants to remember or deep-link them.
 */
const props = withDefaults(
  defineProps<{
    events: CalendarEvent[];
    loading?: boolean;
    view?: CalendarView;
    anchor?: DateTime;
    weekStart?: WeekStart;
    maxPerDay?: number;
  }>(),
  { loading: false, weekStart: 1 },
);
const emit = defineEmits<{
  'range-change': [range: CalendarRange];
  select: [event: CalendarEvent];
  'select-day': [date: DateTime];
  'update:view': [view: CalendarView];
  'update:anchor': [anchor: DateTime];
}>();

const calendar = useCalendar({ view: props.view, anchor: props.anchor, weekStart: props.weekStart });

watch(() => props.view, (v) => v && v !== calendar.view.value && calendar.setView(v));
watch(() => props.anchor, (a) => a && !a.equals(calendar.anchor.value) && calendar.focus(a));
watch(() => props.weekStart, (w) => (calendar.weekStart.value = w));
watch(calendar.view, (v) => emit('update:view', v));
watch(calendar.anchor, (a) => emit('update:anchor', a));
watch(
  () => [calendar.range.value.from.toMillis(), calendar.range.value.to.toMillis()],
  () => emit('range-change', calendar.range.value),
  { immediate: true },
);

const groups = computed(() => groupByDay(props.events));

function openDay(date: DateTime): void {
  emit('select-day', date);
  calendar.focus(date, 'day');
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-1">
        <Button variant="outline" size="icon-sm" aria-label="Previous" @click="calendar.prev()"><ChevronLeft class="size-4" /></Button>
        <Button variant="outline" size="sm" @click="calendar.today()">Today</Button>
        <Button variant="outline" size="icon-sm" aria-label="Next" @click="calendar.next()"><ChevronRight class="size-4" /></Button>
        <h3 class="display ml-2 text-2xl text-ink">{{ calendar.label.value }}</h3>
        <span v-if="loading" class="ml-2 text-xs text-muted">Loading…</span>
      </div>
      <Tabs :model-value="calendar.view.value" @update:model-value="(v) => calendar.setView(v as CalendarView)">
        <TabsList>
          <TabsTrigger value="month">Month</TabsTrigger>
          <TabsTrigger value="week">Week</TabsTrigger>
          <TabsTrigger value="day">Day</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>

    <MonthView
      v-if="calendar.view.value === 'month'"
      :days="calendar.days.value"
      :weekdays="calendar.weekdays.value"
      :anchor="calendar.anchor.value"
      :groups="groups"
      :max-per-day="maxPerDay"
      @select="emit('select', $event)"
      @select-day="openDay"
    >
      <template #default="slotProps"><slot v-bind="slotProps" /></template>
    </MonthView>
    <WeekView
      v-else-if="calendar.view.value === 'week'"
      :days="calendar.days.value"
      :groups="groups"
      @select="emit('select', $event)"
      @select-day="openDay"
    >
      <template #default="slotProps"><slot v-bind="slotProps" /></template>
    </WeekView>
    <DayView v-else :day="calendar.anchor.value" :groups="groups" @select="emit('select', $event)">
      <template #default="slotProps"><slot v-bind="slotProps" /></template>
    </DayView>
  </div>
</template>
