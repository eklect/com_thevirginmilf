<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';

/**
 * A destructive button that asks first, in place.
 *
 * The first click arms it and the label becomes the question; the second
 * click does it. Left alone, it disarms after a few seconds. No browser
 * dialog: a native `confirm()` blocks the page, cannot be styled, and reads
 * the same for deleting a draft as for deleting a game with six reviews.
 */
const props = withDefaults(
  defineProps<{ label?: string; confirmLabel?: string; disabled?: boolean }>(),
  { label: 'Delete', confirmLabel: 'Really delete?', disabled: false },
);
const emit = defineEmits<{ confirm: [] }>();

const armed = ref(false);
let timer = 0;

function click(): void {
  window.clearTimeout(timer);
  if (armed.value) {
    armed.value = false;
    emit('confirm');
    return;
  }
  armed.value = true;
  timer = window.setTimeout(() => (armed.value = false), 4000);
}

onBeforeUnmount(() => window.clearTimeout(timer));
</script>

<template>
  <button
    type="button"
    class="kicker"
    :class="armed ? 'bg-danger px-2 py-1 !text-white' : '!text-danger hover:underline'"
    :disabled="props.disabled"
    @click="click"
    @blur="armed = false"
  >
    {{ armed ? confirmLabel : label }}
  </button>
</template>
