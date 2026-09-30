<script setup lang="ts">
import { onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import type { AdminCategory } from '../../api/types';
import ConfirmButton from './ConfirmButton.vue';
import { useCollection } from './useCollection';
import { useSaveNotice } from './useSaveNotice';

const collection = useCollection<AdminCategory>('categories', 'categories');
onMounted(collection.load);

// Shows the confirmation the editor left behind on its way here.
const { notice } = useSaveNotice();
</script>

<template>
  <header class="flex items-center justify-between gap-4">
    <h1 class="display text-4xl">Categories</h1>
    <RouterLink to="/admin/categories/new" class="btn btn-sm">New category</RouterLink>
  </header>
  <p class="mt-2 max-w-prose text-sm text-muted">
    Her own collections of similar games — “Cozy”, “Made me scream”. A game can be in as many as
    she likes; put games in one from the game's own page. A category with no visible games is left
    off the public filter.
  </p>

  <p v-if="collection.error.value" class="notice-error mt-5">{{ collection.error.value }}</p>
  <p v-if="notice" role="status" class="notice mt-5">{{ notice }}</p>

  <table class="mt-7 w-full text-sm">
    <thead>
      <tr class="border-y border-border text-left">
        <th class="kicker py-2.5">Category</th>
        <th class="kicker w-28 py-2.5">Published</th>
        <th class="kicker w-24 py-2.5">Order</th>
        <th class="kicker w-32 py-2.5"></th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(item, i) in collection.items.value" :key="item.id" class="border-b border-border align-top">
        <td class="py-3 pr-4">
          <RouterLink :to="`/admin/categories/${item.id}`" class="font-semibold no-underline hover:underline">
            {{ item.name }}
          </RouterLink>
          <span v-if="item.description" class="block text-xs text-muted">{{ item.description }}</span>
        </td>
        <td class="py-3">
          <button
            type="button"
            class="kicker hover:text-text"
            :disabled="collection.busy.value"
            @click="collection.setPublished(item.id, !item.isPublished)"
          >
            {{ item.isPublished ? 'Live' : 'Hidden' }}
          </button>
        </td>
        <td class="py-3">
          <button type="button" class="kicker px-1 hover:text-text" :disabled="i === 0" aria-label="Move up" @click="collection.move(item.id, -1)">↑</button>
          <button type="button" class="kicker px-1 hover:text-text" :disabled="i === collection.items.value.length - 1" aria-label="Move down" @click="collection.move(item.id, 1)">↓</button>
        </td>
        <td class="py-3 text-right">
          <ConfirmButton :disabled="collection.busy.value" @confirm="collection.remove(item.id)" />
        </td>
      </tr>
    </tbody>
  </table>

  <p v-if="!collection.loading.value && !collection.items.value.length" class="py-10 text-sm text-muted">
    No categories yet.
  </p>
</template>
