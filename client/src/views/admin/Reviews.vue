<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { api, errorMessage } from '../../api/client';
import { formatDate, type ReviewSummary } from '../../api/types';
import { useSaveNotice } from './useSaveNotice';
import SortButton from '@/components/table/SortButton.vue';
import { useSortableTable } from '@/composables/useSortableTable';

/** Every review across the library, most recently edited first. */
const reviews = ref<ReviewSummary[]>([]);
const loading = ref(true);
const error = ref('');

onMounted(async () => {
  try {
    reviews.value = (await api.get<{ reviews: ReviewSummary[] }>('/api/admin/reviews')).reviews;
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
});

// Shows the confirmation the editor left behind on its way here.
const { notice } = useSaveNotice();

const sort = useSortableTable(
  () => reviews.value,
  {
    title: (row: ReviewSummary) => row.title,
    game: (row: ReviewSummary) => row.game.title,
    status: (row: ReviewSummary) => (row.isPublished && row.publishedAt ? Date.parse(row.publishedAt) : 0),
  },
  { storageKey: 'admin-reviews' },
);
</script>

<template>
  <h1 class="display text-4xl">Reviews</h1>
  <p class="mt-2 max-w-prose text-sm text-muted">
    A review belongs to a game, so a new one is started from that game's page:
    <RouterLink to="/admin/games">find the game</RouterLink>, then “Write a review”.
  </p>

  <p v-if="error" class="notice-error mt-5">{{ error }}</p>
  <p v-if="notice" role="status" class="notice mt-5">{{ notice }}</p>

  <table v-if="reviews.length" class="mt-7 w-full text-sm">
    <thead>
      <tr class="border-y border-border text-left">
        <th class="kicker py-2.5 w-10 pr-4 text-right">#</th>
        <th class="kicker py-2.5" :aria-sort="sort.ariaSort('title')">
          <SortButton :table="sort" column="title">Review</SortButton>
        </th>
        <th class="kicker w-64 py-2.5" :aria-sort="sort.ariaSort('game')">
          <SortButton :table="sort" column="game">Game</SortButton>
        </th>
        <th class="kicker w-44 py-2.5" :aria-sort="sort.ariaSort('status')">
          <SortButton :table="sort" column="status">Status</SortButton>
        </th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(review, rowIndex) in sort.sorted.value" :key="review.id" class="border-b border-border align-top">
        <td class="py-3 pr-4 text-right text-xs tabular-nums text-muted">{{ rowIndex + 1 }}</td>
        <td class="py-3 pr-4">
          <RouterLink :to="`/admin/reviews/${review.id}`" class="font-semibold no-underline hover:underline">
            {{ review.title }}
          </RouterLink>
        </td>
        <td class="py-3 pr-4">
          <RouterLink :to="`/admin/games/${review.game.id}`" class="no-underline hover:underline">
            {{ review.game.title }}
          </RouterLink>
        </td>
        <td class="py-3">
          <span class="kicker">
            {{ review.isPublished ? `Published ${formatDate(review.publishedAt)}` : 'Draft' }}
          </span>
        </td>
      </tr>
    </tbody>
  </table>

  <p v-if="!loading && !error && !reviews.length" class="py-10 text-sm text-muted">No reviews yet.</p>
</template>
