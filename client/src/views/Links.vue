<script setup lang="ts">
import { ArrowUpRight } from 'lucide-vue-next';
import PlatformIcon from '../components/PlatformIcon.vue';
import { useSiteStore } from '../stores/site';

/** Everywhere else to find her. The rows are the channels, edited in one place. */
const site = useSiteStore();
</script>

<template>
  <section class="band">
    <div class="band-inner">
      <div class="mx-auto max-w-2xl">
        <div class="text-center">
          <img src="/brand/v1/lips.png" alt="" class="mx-auto h-20 w-auto" width="743" height="600" />
          <h1 class="display mt-5 text-6xl sm:text-7xl">Links</h1>
          <p v-if="site.settings.links_intro" class="mt-3 text-lg text-muted">
            {{ site.settings.links_intro }}
          </p>
        </div>

        <ul v-if="site.linkChannels.length" class="mt-10 space-y-5">
          <li v-for="channel in site.linkChannels" :key="channel.id">
            <a
              :href="channel.url"
              :target="channel.platform === 'email' ? undefined : '_blank'"
              rel="noopener noreferrer"
              class="panel panel-link flex items-center gap-4 p-4 sm:p-5"
            >
              <span class="flex size-12 shrink-0 items-center justify-center border-2 border-rule bg-accent text-accent-text">
                <PlatformIcon :platform="channel.platform" class="size-6" />
              </span>
              <span class="min-w-0 grow">
                <span class="display block text-2xl sm:text-3xl">{{ channel.name }}</span>
                <span v-if="channel.description" class="block text-sm text-muted">{{ channel.description }}</span>
              </span>
              <ArrowUpRight class="size-6 shrink-0" aria-hidden="true" />
            </a>
          </li>
        </ul>
        <p v-else class="mt-10 text-center text-muted">Nothing here yet.</p>
      </div>
    </div>
  </section>
</template>
