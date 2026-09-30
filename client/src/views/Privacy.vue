<script setup lang="ts">
import MarkdownBody from '../components/MarkdownBody.vue';
import { useSiteStore } from '../stores/site';

const site = useSiteStore();
</script>

<template>
  <section class="band">
    <div class="band-inner">
      <p class="kicker">The small print</p>
      <h1 class="display mt-2 text-6xl sm:text-7xl">Privacy</h1>
      <hr class="masthead-rule mt-6" />
      <div class="mt-8">
        <MarkdownBody v-if="site.settings.privacy_body" :source="site.settings.privacy_body" />
        <p v-else class="text-muted">Nothing written here yet.</p>
      </div>
    </div>
  </section>
</template>
