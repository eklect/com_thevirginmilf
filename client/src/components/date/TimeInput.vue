<script setup lang="ts">
import { computed, nextTick, ref, watch, type HTMLAttributes } from 'vue';
import { PopoverAnchor, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui';
import { Clock } from 'lucide-vue-next';
import { cn } from '@/lib/utils';
import { parseTypedTime, timeToDisplay } from '@/lib/date-entry';

/**
 * A time field that works on a phone: type `7:30 pm`, `730p` or `19:30` on
 * the ordinary keyboard, or pick from a list behind the clock button. The
 * typed text is shown back as `7:30 PM` on blur. `v-model` is `HH:mm`,
 * exactly what `<input type="time">` gave, and '' until it parses.
 * `step` is the list's spacing in minutes (15 by default); typing is not held to it.
 */
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    modelValue?: string | null;
    step?: number;
    required?: boolean;
    disabled?: boolean;
    class?: HTMLAttributes['class'];
  }>(),
  { step: 15 },
);
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>();

const input = ref<HTMLInputElement | null>(null);
const list = ref<HTMLElement | null>(null);
const text = ref(timeToDisplay(props.modelValue));
const open = ref(false);
let sent = props.modelValue ?? '';

function validate(): void {
  input.value?.setCustomValidity(text.value && !parseTypedTime(text.value) ? 'Enter a time such as 7:30 PM.' : '');
}

function commit(): void {
  const next = parseTypedTime(text.value) ?? '';
  validate();
  sent = next;
  if (next !== (props.modelValue ?? '')) emit('update:modelValue', next);
}

function onInput(event: Event): void {
  text.value = (event.target as HTMLInputElement).value;
  commit();
}

function onBlur(): void {
  const value = parseTypedTime(text.value);
  if (value) text.value = timeToDisplay(value);
  validate();
}

watch(
  () => props.modelValue,
  (value) => {
    if ((value ?? '') === sent) return;
    sent = value ?? '';
    text.value = timeToDisplay(value);
    validate();
  },
);

const options = computed(() => {
  const out: string[] = [];
  const step = Math.max(1, Math.min(60, props.step));
  for (let minute = 0; minute < 24 * 60; minute += step) {
    out.push(`${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`);
  }
  return out;
});

const selected = computed(() => parseTypedTime(text.value) ?? props.modelValue ?? '');

watch(open, async (isOpen) => {
  if (!isOpen) return;
  await nextTick();
  // Start the list at the chosen time, or at 9 AM rather than midnight.
  const target = selected.value || '09:00';
  const nearest = options.value.find((o) => o >= target) ?? options.value[options.value.length - 1];
  list.value?.querySelector<HTMLElement>(`[data-time="${nearest}"]`)?.scrollIntoView({ block: 'center' });
});

function pick(value: string): void {
  text.value = timeToDisplay(value);
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
          inputmode="text"
          autocomplete="off"
          placeholder="7:30 PM"
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
          aria-label="Choose a time from a list"
          class="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md outline-none focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-50"
        >
          <Clock class="size-4" aria-hidden="true" />
        </PopoverTrigger>
      </div>
    </PopoverAnchor>
    <PopoverPortal>
      <PopoverContent
        align="end"
        :side-offset="4"
        :collision-padding="8"
        class="bg-popover text-popover-foreground z-50 w-40 rounded-md border p-1 shadow-md outline-hidden"
      >
        <div ref="list" class="max-h-64 overflow-y-auto overscroll-contain" role="listbox" aria-label="Times">
          <button
            v-for="option in options"
            :key="option"
            type="button"
            role="option"
            :data-time="option"
            :aria-selected="option === selected"
            :class="cn(
              'focus-visible:ring-ring/50 block w-full rounded-sm px-3 py-1.5 text-left text-sm tabular-nums outline-none focus-visible:ring-3',
              option === selected ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary',
            )"
            @click="pick(option)"
          >
            {{ timeToDisplay(option) }}
          </button>
        </div>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
