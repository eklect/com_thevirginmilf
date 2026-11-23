<script setup lang="ts">
import { onMounted, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { PLATFORM_LABELS, formatDateTime, type AdminChannel } from '../../api/types';
import { useSiteStore } from '../../stores/site';
import ConfirmButton from './ConfirmButton.vue';
import { useCollection } from './useCollection';
import { useSaveNotice } from './useSaveNotice';
import SortButton from '@/components/table/SortButton.vue';
import SortedNotice from '@/components/table/SortedNotice.vue';
import { useSortableTable } from '@/composables/useSortableTable';

const site = useSiteStore();
const collection = useCollection<AdminChannel>('channels', 'channels');

// The footer, the Links page and the Live page draw channels from the
// bootstrap, which was fetched once at page load. Any change made on this
// screen — reorder, hide, delete — refreshes it, or the public pages would
// show the old list until the next full reload. Registered here, at setup,
// so Vue owns the watcher and stops it with the component; `loaded` keeps the
// first fill of the list from counting as a change.
let loaded = false;
watch(collection.items, () => {
  if (loaded) void site.reload();
});

onMounted(async () => {
  await collection.load();
  loaded = true;
});

// Shows the confirmation the editor left behind on its way here.
const { notice } = useSaveNotice();

const sort = useSortableTable(
  () => collection.items.value,
  {
    name: (row: AdminChannel) => row.name,
    platform: (row: AdminChannel) => PLATFORM_LABELS[row.platform],
    usedFor: (row: AdminChannel) => [row.isStreamChannel ? 'Streams' : null, row.showOnLinks ? 'Links page' : null].filter(Boolean).join(' · '),
    published: (row: AdminChannel) => row.isPublished,
    created: (row: AdminChannel) => row.createdAt,
    updated: (row: AdminChannel) => row.updatedAt,
  },
  { storageKey: 'admin-channels' },
);
</script>

<template>
  <header class="flex items-center justify-between gap-4">
    <h1 class="display text-4xl">Channels</h1>
    <RouterLink to="/admin/channels/new" class="btn btn-sm">Add a channel</RouterLink>
  </header>
  <p class="mt-2 max-w-prose text-sm text-muted">
    Everywhere she can be found. One list feeds the Links page, the footer, the Live page and the
    channel picker on a stream — so each address is edited once, here.
  </p>

  <p v-if="collection.error.value" class="notice-error mt-5">{{ collection.error.value }}</p>
  <p v-if="notice" role="status" class="notice mt-5">{{ notice }}</p>

  <SortedNotice :table="sort" />
  <div class="overflow-x-auto">
    <table class="mt-7 w-full min-w-[960px] text-sm">
      <thead>
        <tr class="border-y border-border text-left">
          <th class="kicker py-2.5" :aria-sort="sort.ariaSort('name')">
            <SortButton :table="sort" column="name">Channel</SortButton>
          </th>
          <th class="kicker w-28 py-2.5" :aria-sort="sort.ariaSort('platform')">
            <SortButton :table="sort" column="platform">Platform</SortButton>
          </th>
          <th class="kicker w-44 py-2.5" :aria-sort="sort.ariaSort('usedFor')">
            <SortButton :table="sort" column="usedFor">Used for</SortButton>
          </th>
          <th class="kicker w-24 py-2.5" :aria-sort="sort.ariaSort('published')">
            <SortButton :table="sort" column="published">Published</SortButton>
          </th>
          <th class="kicker w-40 py-2.5" :aria-sort="sort.ariaSort('created')">
            <SortButton :table="sort" column="created">Created</SortButton>
          </th>
          <th class="kicker w-40 py-2.5" :aria-sort="sort.ariaSort('updated')">
            <SortButton :table="sort" column="updated">Updated</SortButton>
          </th>
          <th class="kicker w-20 py-2.5">Order</th>
          <th class="kicker w-32 py-2.5"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(item, i) in sort.sorted.value" :key="item.id" class="border-b border-border align-top">
          <td class="py-3 pr-4">
            <RouterLink :to="`/admin/channels/${item.id}`" class="font-semibold no-underline hover:underline">
              {{ item.name }}
            </RouterLink>
            <span class="block break-all text-xs text-muted">{{ item.url }}</span>
          </td>
          <td class="py-3">{{ PLATFORM_LABELS[item.platform] }}</td>
          <td class="py-3 text-xs text-muted">
            {{ [item.isStreamChannel ? 'Streams' : null, item.showOnLinks ? 'Links page' : null].filter(Boolean).join(' · ') || 'Nothing' }}
            <span v-if="item.isStreamChannel && !item.handle && (item.platform === 'twitch' || item.platform === 'youtube')" class="block text-warn-text">
              No handle, so it cannot be embedded on the Live page
            </span>
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
          <td class="py-3 pr-4 text-xs text-muted">{{ formatDateTime(item.createdAt) || '—' }}</td>
          <td class="py-3 pr-4 text-xs text-muted">{{ formatDateTime(item.updatedAt) || '—' }}</td>
          <td class="py-3">
            <button type="button" class="kicker px-1 hover:text-text" :disabled="sort.isSorted.value || i === 0" aria-label="Move up" @click="collection.move(item.id, -1)">↑</button>
            <button type="button" class="kicker px-1 hover:text-text" :disabled="sort.isSorted.value || i === collection.items.value.length - 1" aria-label="Move down" @click="collection.move(item.id, 1)">↓</button>
          </td>
          <td class="py-3 text-right">
            <ConfirmButton :disabled="collection.busy.value" @confirm="collection.remove(item.id)" />
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <p v-if="!collection.loading.value && !collection.items.value.length" class="py-10 text-sm text-muted">
    Nothing here yet.
  </p>
</template>
