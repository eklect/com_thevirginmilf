<script setup lang="ts">
import { computed, ref, useAttrs, watch, type HTMLAttributes } from 'vue';
import { cn } from '@/lib/utils';
import DateInput from './DateInput.vue';
import TimeInput from './TimeInput.vue';

/**
 * A date and a time, side by side, in place of `<input type="datetime-local">`.
 * `v-model` is `YYYY-MM-DDTHH:mm` — the same wall-clock string, so the
 * `toLocalInput` / `toZoneInput` helpers keep working unchanged — and ''
 * until both halves are filled. `id` goes to the date half, so a `<Label for>`
 * lands there; the time half gets `<id>-time`. `min` / `max` take either a
 * full value or a bare date, and bound the date half only.
 */
defineOptions({ inheritAttrs: false });

const props = defineProps<{
  modelValue?: string | null;
  min?: string;
  max?: string;
  step?: number;
  required?: boolean;
  disabled?: boolean;
  class?: HTMLAttributes['class'];
}>();
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>();
const attrs = useAttrs();

const split = (value: string | null | undefined) => {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value ?? '');
  return match ? { date: match[1], time: match[2] } : null;
};

const initial = split(props.modelValue);
const date = ref(initial?.date ?? '');
const time = ref(initial?.time ?? '');
let sent = props.modelValue ?? '';

watch(
  () => props.modelValue,
  (value) => {
    if ((value ?? '') === sent) return;
    sent = value ?? '';
    const parts = split(value);
    date.value = parts?.date ?? '';
    time.value = parts?.time ?? '';
  },
);

watch([date, time], ([d, t]) => {
  const next = d && t ? `${d}T${t}` : '';
  sent = next;
  if (next !== (props.modelValue ?? '')) emit('update:modelValue', next);
});

const timeId = computed(() => (attrs.id ? `${attrs.id}-time` : undefined));
const minDate = computed(() => props.min?.slice(0, 10));
const maxDate = computed(() => props.max?.slice(0, 10));
</script>

<template>
  <div :class="cn('grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-2', props.class)">
    <DateInput
      v-bind="attrs"
      v-model="date"
      :min="minDate"
      :max="maxDate"
      :required="required"
      :disabled="disabled"
    />
    <TimeInput
      :id="timeId"
      v-model="time"
      :step="step"
      :required="required"
      :disabled="disabled"
      :aria-invalid="attrs['aria-invalid']"
      :aria-describedby="attrs['aria-describedby']"
      aria-label="Time"
    />
  </div>
</template>
