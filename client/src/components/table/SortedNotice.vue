<script setup lang="ts">
/**
 * Shown above a hand-ordered table while a column sort is applied. The stored
 * order is what the public site shows, and a sorted view never writes one, so
 * the move controls are off until the sort is cleared.
 */
import type { SortState } from '../../composables/useSortableTable';

defineProps<{ table: Pick<SortState, 'isSorted' | 'clear'> }>();
</script>

<template>
  <p v-if="table.isSorted.value" role="status" class="mt-4 text-xs text-muted">
    Sorted by a column, so reordering is off.
    <button type="button" class="underline underline-offset-2 hover:text-text" @click="table.clear()">
      Clear the sort
    </button>
    to move rows.
  </p>
</template>
