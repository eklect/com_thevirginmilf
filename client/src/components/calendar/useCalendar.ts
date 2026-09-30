import { DateTime, Interval } from 'luxon';
import { computed, ref, type Ref } from 'vue';
import type { CalendarEvent, CalendarRange, CalendarView, WeekStart } from './types';

export interface UseCalendarOptions {
  view?: CalendarView;
  anchor?: DateTime;
  weekStart?: WeekStart;
}

/**
 * The calendar's state and arithmetic, with no rendering: which view, which
 * date is in focus, what range that covers, and the days in it. Every date is
 * a Luxon `DateTime` in the viewer's zone; a tool fetches for `range` and
 * hands back events with ISO starts, which `groupByDay` buckets by local day.
 */
export function useCalendar(options: UseCalendarOptions = {}) {
  const view: Ref<CalendarView> = ref(options.view ?? 'month');
  const anchor: Ref<DateTime> = ref(options.anchor ?? DateTime.local().startOf('day'));
  const weekStart: Ref<WeekStart> = ref(options.weekStart ?? 1);

  const startOfWeek = (date: DateTime): DateTime => {
    // Luxon's `startOf('week')` is ISO (Monday). Shift for a Sunday start.
    const offset = (date.weekday - weekStart.value + 7) % 7;
    return date.startOf('day').minus({ days: offset });
  };
  const endOfWeek = (date: DateTime): DateTime => startOfWeek(date).plus({ days: 6 }).endOf('day');

  const range = computed<CalendarRange>(() => {
    const a = anchor.value;
    switch (view.value) {
      case 'month':
        return { from: startOfWeek(a.startOf('month')), to: endOfWeek(a.endOf('month')) };
      case 'week':
        return { from: startOfWeek(a), to: endOfWeek(a) };
      default:
        return { from: a.startOf('day'), to: a.endOf('day') };
    }
  });

  const days = computed<DateTime[]>(() =>
    Interval.fromDateTimes(range.value.from, range.value.to)
      .splitBy({ days: 1 })
      .map((slice) => slice.start!.startOf('day')),
  );

  /** The seven weekday names in display order, for column headers. */
  const weekdays = computed<string[]>(() => {
    const first = startOfWeek(DateTime.local());
    return Array.from({ length: 7 }, (_, i) => first.plus({ days: i }).toFormat('ccc'));
  });

  const label = computed<string>(() => {
    const a = anchor.value;
    switch (view.value) {
      case 'month':
        return a.toFormat('LLLL yyyy');
      case 'week': {
        const from = startOfWeek(a);
        const to = from.plus({ days: 6 });
        return from.month === to.month
          ? `${from.toFormat('d')}–${to.toFormat('d LLLL yyyy')}`
          : `${from.toFormat('d LLL')} – ${to.toFormat('d LLL yyyy')}`;
      }
      default:
        return a.toFormat('cccc, d LLLL yyyy');
    }
  });

  const stepFor = (): { months?: number; weeks?: number; days?: number } =>
    view.value === 'month' ? { months: 1 } : view.value === 'week' ? { weeks: 1 } : { days: 1 };

  function prev(): void {
    anchor.value = anchor.value.minus(stepFor());
  }
  function next(): void {
    anchor.value = anchor.value.plus(stepFor());
  }
  function today(): void {
    anchor.value = DateTime.local().startOf('day');
  }
  function setView(next: CalendarView): void {
    view.value = next;
  }
  function focus(date: DateTime, nextView?: CalendarView): void {
    anchor.value = date.startOf('day');
    if (nextView) view.value = nextView;
  }

  return { view, anchor, weekStart, range, days, weekdays, label, prev, next, today, setView, focus };
}

/** Buckets events by the viewer's local day (`yyyy-MM-dd`), each bucket sorted by start. */
export function groupByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const groups = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const key = DateTime.fromISO(event.start).toLocal().toISODate();
    if (!key) continue;
    const bucket = groups.get(key);
    if (bucket) bucket.push(event);
    else groups.set(key, [event]);
  }
  for (const bucket of groups.values()) {
    bucket.sort((a, b) => DateTime.fromISO(a.start).toMillis() - DateTime.fromISO(b.start).toMillis());
  }
  return groups;
}

export const dayKey = (date: DateTime): string => date.toISODate() ?? '';
