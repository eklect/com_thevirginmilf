<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';

const sections = [
  { to: '/admin/streams', label: 'Streams' },
  { to: '/admin/channels', label: 'Channels' },
  { to: '/admin/games', label: 'Games' },
  { to: '/admin/categories', label: 'Categories' },
  { to: '/admin/reviews', label: 'Reviews' },
  { to: '/admin/steam', label: 'Steam' },
  { to: '/admin/images', label: 'Images' },
  { to: '/admin/subscribers', label: 'Subscribers' },
  { to: '/admin/site', label: 'Site settings' },
  { to: '/admin/pages', label: 'Pages' },
  { to: '/admin/api-access', label: 'API access' },
];
</script>

<template>
  <div class="container-page py-8">
    <nav class="flex flex-wrap gap-x-6 gap-y-2 border-b-[3px] border-rule pb-4" aria-label="Admin">
      <RouterLink
        v-for="section in sections"
        :key="section.to"
        :to="section.to"
        class="kicker no-underline hover:text-text"
        active-class="!text-accent-ink"
      >
        {{ section.label }}
      </RouterLink>
    </nav>

    <div class="pt-8">
      <!--
        Keyed by path so an editor remounts when it links to another row of
        its own kind (a game to its next review): the editors read their id
        once, at setup. Path, not fullPath, so a list filtering through its
        query string keeps its state.
      -->
      <RouterView :key="$route.path" />
    </div>
  </div>
</template>
