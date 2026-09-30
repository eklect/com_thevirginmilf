<script setup lang="ts">
import { Star } from 'lucide-vue-next';
import { computed, ref } from 'vue';

/**
 * Stars out of ten.
 *
 * Read-only by default. With `editable`, each star is a button: click the
 * seventh for a seven, click the seventh again to clear it back to "not
 * rated". That second click matters — without it a rating given by mistake
 * could be changed but never taken away.
 *
 * Ten real buttons rather than a slider or a range input, because the admin
 * list sets a rating in one click from a table row and the target has to be
 * the star itself.
 */
const props = withDefaults(
  defineProps<{
    rating: number | null;
    editable?: boolean;
    disabled?: boolean;
    /** Tailwind size utility for one star. */
    size?: string;
    /** Print "8/10" beside the stars. */
    showNumber?: boolean;
  }>(),
  { editable: false, disabled: false, size: 'size-4', showNumber: false },
);
const emit = defineEmits<{ 'update:rating': [value: number | null] }>();

const hovered = ref<number | null>(null);
const shown = computed(() => (props.editable && hovered.value !== null ? hovered.value : (props.rating ?? 0)));

function choose(star: number): void {
  if (!props.editable || props.disabled) return;
  emit('update:rating', props.rating === star ? null : star);
}
</script>

<template>
  <span
    class="inline-flex items-center gap-2"
    :role="editable ? 'group' : 'img'"
    :aria-label="rating ? `Rated ${rating} out of 10` : 'Not rated'"
  >
    <span class="inline-flex" @mouseleave="hovered = null">
      <template v-for="star in 10" :key="star">
        <button
          v-if="editable"
          type="button"
          class="p-px"
          :disabled="disabled"
          :aria-label="rating === star ? `Clear the rating` : `Rate ${star} out of 10`"
          :aria-pressed="rating === star"
          @mouseenter="hovered = star"
          @focus="hovered = star"
          @blur="hovered = null"
          @click="choose(star)"
        >
          <Star
            :class="[size, star <= shown ? 'fill-accent text-accent' : 'text-border']"
            :stroke-width="2"
          />
        </button>
        <Star
          v-else
          :class="[size, star <= shown ? 'fill-accent text-accent' : 'text-border']"
          :stroke-width="2"
          aria-hidden="true"
        />
      </template>
    </span>
    <span v-if="showNumber && rating" class="font-head text-sm font-extrabold tabular-nums">
      {{ rating }}<span class="text-muted">/10</span>
    </span>
  </span>
</template>
