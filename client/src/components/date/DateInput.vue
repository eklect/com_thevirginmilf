<script setup lang="ts">
import { computed, ref, watch, type HTMLAttributes } from 'vue';
import { PopoverAnchor, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-vue-next';
import { cn } from '@/lib/utils';
import {
  daysInMonth,
  displayToIso,
  formatTypedDate,
  isoDate,
  isoToDisplay,
  parseIsoDate,
  todayIso,
} from '@/lib/date-entry';

/**
 * A date field that works on a phone: the text box brings up the number pad
 * (MM/DD/YYYY, slashes added for you) and the calendar button opens a month
 * grid drawn here, not the browser's own picker. `v-model` is `YYYY-MM-DD`,
 * exactly what `<input type="date">` gave, and '' until the date is whole.
 * `id`, `aria-*`, `autocomplete` and `name` land on the text box, so a
 * `<Label for>` still points at it.
 */
defineOptions({ inheritAttrs: false });

const props = defineProps<{
  modelValue?: string | null;
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  class?: HTMLAttributes['class'];
}>();
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>();

const input = ref<HTMLInputElement | null>(null);
const text = ref(isoToDisplay(props.modelValue));
const open = ref(false);
/** The last value this field sent up, so the watcher can tell its own echo from an outside change. */
let sent = props.modelValue ?? '';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function outOfRange(iso: string): boolean {
  return (!!props.min && iso < props.min) || (!!props.max && iso > props.max);
}

function rangeMessage(): string {
  if (props.min && props.max) return `Enter a date from ${isoToDisplay(props.min)} to ${isoToDisplay(props.max)}.`;
  if (props.min) return `Enter a date on or after ${isoToDisplay(props.min)}.`;
  return `Enter a date on or before ${isoToDisplay(props.max)}.`;
}

/** Sets the browser's own validity, so a form's submit stops on a half-typed date. */
function validate(): void {
  const el = input.value;
  if (!el) return;
  const iso = displayToIso(text.value);
  if (!text.value) el.setCustomValidity('');
  else if (!iso) el.setCustomValidity('Enter a date as MM/DD/YYYY.');
  else if (outOfRange(iso)) el.setCustomValidity(rangeMessage());
  else el.setCustomValidity('');
}

function commit(): void {
  const iso = displayToIso(text.value);
  const next = iso && !outOfRange(iso) ? iso : '';
  validate();
  sent = next;
  if (next !== (props.modelValue ?? '')) emit('update:modelValue', next);
}

function onInput(event: Event): void {
  const el = event.target as HTMLInputElement;
  const inserting = !(event as InputEvent).inputType?.startsWith('delete');
  text.value = formatTypedDate(el.value, inserting);
  el.value = text.value;
  commit();
}

function onBlur(): void {
  // A whole date typed with a stray character tidies itself; anything else stays as typed for the person to fix.
  const iso = displayToIso(text.value);
  if (iso) text.value = isoToDisplay(iso);
  validate();
}

watch(
  () => props.modelValue,
  (value) => {
    // Our own echo: leave whatever is typed alone, half-typed or not.
    if ((value ?? '') === sent) return;
    sent = value ?? '';
    text.value = isoToDisplay(value);
    validate();
  },
);

// ---------- the calendar ----------

const today = todayIso();
const yearNow = Number(today.slice(0, 4));
const minYear = computed(() => parseIsoDate(props.min)?.year ?? yearNow - 120);
const maxYear = computed(() => parseIsoDate(props.max)?.year ?? yearNow + 10);
const years = computed(() => {
  const list: number[] = [];
  for (let y = maxYear.value; y >= minYear.value; y -= 1) list.push(y);
  return list;
});

const view = ref({ year: yearNow, month: 1 });

function startView(): void {
  const picked = parseIsoDate(displayToIso(text.value) ?? props.modelValue);
  let anchor = picked ? isoDate(picked.year, picked.month, 1) : today;
  if (!picked && props.max && anchor > props.max) anchor = props.max;
  if (!picked && props.min && anchor < props.min) anchor = props.min;
  const parts = parseIsoDate(anchor.slice(0, 8) + '01')!;
  view.value = { year: parts.year, month: parts.month };
}

watch(open, (isOpen) => {
  if (isOpen) startView();
});

function step(delta: number): void {
  let { year, month } = view.value;
  month += delta;
  if (month < 1) { month = 12; year -= 1; }
  if (month > 12) { month = 1; year += 1; }
  view.value = { year, month };
}

const canBack = computed(() => !props.min || isoDate(view.value.year, view.value.month, 1) > props.min);
const canForward = computed(() => !props.max || isoDate(view.value.year, view.value.month, daysInMonth(view.value.year, view.value.month)) < props.max);

const cells = computed(() => {
  const { year, month } = view.value;
  const lead = new Date(year, month - 1, 1).getDay();
  const list: ({ day: number; iso: string; disabled: boolean } | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= daysInMonth(year, month); day += 1) {
    const iso = isoDate(year, month, day);
    list.push({ day, iso, disabled: outOfRange(iso) });
  }
  return list;
});

const selected = computed(() => displayToIso(text.value) ?? props.modelValue ?? '');

function pick(iso: string): void {
  text.value = isoToDisplay(iso);
  commit();
  open.value = false;
}
</script>

<template>
  <PopoverRoot v-model:open="open">
    <PopoverAnchor as-child>
      <div :class="cn('relative w-full', props.class)">
        <input
          ref="input"
          v-bind="$attrs"
          :value="text"
          type="text"
          inputmode="numeric"
          placeholder="MM/DD/YYYY"
          maxlength="10"
          :required="required"
          :disabled="disabled"
          data-slot="input"
          class="input placeholder:text-muted-foreground min-w-0 pr-10 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive"
          @input="onInput"
          @blur="onBlur"
        />
        <PopoverTrigger
          type="button"
          :disabled="disabled"
          aria-label="Choose a date from a calendar"
          class="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md outline-none focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-50"
        >
          <CalendarDays class="size-4" aria-hidden="true" />
        </PopoverTrigger>
      </div>
    </PopoverAnchor>
    <PopoverPortal>
      <PopoverContent
        align="end"
        :side-offset="4"
        :collision-padding="8"
        class="bg-popover text-popover-foreground z-50 w-72 rounded-md border p-3 shadow-md outline-hidden"
      >
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="hover:bg-secondary focus-visible:ring-ring/50 flex size-8 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-3 disabled:opacity-30"
            :disabled="!canBack"
            aria-label="Previous month"
            @click="step(-1)"
          >
            <ChevronLeft class="size-4" aria-hidden="true" />
          </button>
          <select
            v-model.number="view.month"
            aria-label="Month"
            class="border-input bg-popover h-8 min-w-0 flex-1 rounded-md border px-1 text-sm"
          >
            <option v-for="(name, index) in MONTHS" :key="name" :value="index + 1">{{ name }}</option>
          </select>
          <select
            v-model.number="view.year"
            aria-label="Year"
            class="border-input bg-popover h-8 w-[5.25rem] shrink-0 rounded-md border px-1 text-sm"
          >
            <option v-for="year in years" :key="year" :value="year">{{ year }}</option>
          </select>
          <button
            type="button"
            class="hover:bg-secondary focus-visible:ring-ring/50 flex size-8 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-3 disabled:opacity-30"
            :disabled="!canForward"
            aria-label="Next month"
            @click="step(1)"
          >
            <ChevronRight class="size-4" aria-hidden="true" />
          </button>
        </div>
        <div class="mt-2 grid grid-cols-7 gap-0.5 text-center" role="grid" :aria-label="`${MONTHS[view.month - 1]} ${view.year}`">
          <span v-for="name in WEEKDAYS" :key="name" class="text-muted-foreground py-1 text-xs" aria-hidden="true">{{ name }}</span>
          <template v-for="(cell, index) in cells" :key="cell ? cell.iso : `blank-${index}`">
            <span v-if="!cell" aria-hidden="true" />
            <button
              v-else
              type="button"
              :disabled="cell.disabled"
              :aria-pressed="cell.iso === selected"
              :aria-label="isoToDisplay(cell.iso)"
              :class="cn(
                'focus-visible:ring-ring/50 h-9 rounded-md text-sm tabular-nums outline-none focus-visible:ring-3 disabled:opacity-30',
                cell.iso === selected ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary',
                cell.iso === today && cell.iso !== selected && 'ring-border ring-1',
              )"
              @click="pick(cell.iso)"
            >
              {{ cell.day }}
            </button>
          </template>
        </div>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
