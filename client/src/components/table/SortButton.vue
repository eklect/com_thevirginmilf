<script setup lang="ts">
/**
 * The control inside a sortable column header. It goes INSIDE whatever header
 * cell the table already draws (`<th>` or `<TableHead>`), so it inherits that
 * cell's face; the cell itself carries `:aria-sort="table.ariaSort(column)"`.
 *
 *   <th class="kicker py-2" :aria-sort="sort.ariaSort('title')">
 *     <SortButton :table="sort" column="title">Title</SortButton>
 *   </th>
 */
import { computed } from 'vue';
import type { SortState } from '../../composables/useSortableTable';

const props = defineProps<{
  table: Pick<SortState, 'toggle' | 'dirOf'>;
  column: string;
}>();

const dir = computed(() => props.table.dirOf(props.column));
</script>

<template>
  <button
    type="button"
    class="inline-flex cursor-pointer items-center gap-1 [font:inherit] [letter-spacing:inherit] [text-transform:inherit] transition-colors hover:text-text focus-visible:underline"
    :class="dir ? 'text-text' : ''"
    @click="table.toggle(column)"
  >
    <slot />
    <span class="text-[0.85em] leading-none" :class="dir ? '' : 'opacity-50'" aria-hidden="true">{{
      dir === 'asc' ? '↑' : dir === 'desc' ? '↓' : '⇅'
    }}</span>
    <!-- Announces the next step without drawing it. -->
    <span class="sr-only">{{
      dir === 'asc' ? ', sorted ascending. Sort descending.' : dir === 'desc' ? ', sorted descending. Clear the sort.' : ', sort ascending.'
    }}</span>
  </button>
</template>
