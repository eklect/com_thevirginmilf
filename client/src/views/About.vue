<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { uploadUrl } from '../api/types';
import MarkdownBody from '../components/MarkdownBody.vue';
import { useAuthStore } from '../stores/auth';
import { useSiteStore } from '../stores/site';

const auth = useAuthStore();
const site = useSiteStore();
</script>

<template>
  <section class="band band-brand">
    <div class="band-inner !py-12">
      <p class="font-head text-xs font-extrabold uppercase tracking-[0.2em] text-white/80">
        {{ site.streamerName }}
      </p>
      <h1 class="display mt-2 text-6xl sm:text-8xl">About</h1>
    </div>
  </section>
  <div class="stripes" aria-hidden="true"></div>

  <section class="band">
    <div class="band-inner grid gap-12 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div>
        <MarkdownBody v-if="site.settings.about_body" :source="site.settings.about_body" />
        <p v-else class="text-muted">Nothing written here yet.</p>
      </div>

      <aside class="space-y-7">
        <div v-if="site.settings.headshot_upload_id" class="panel">
          <img :src="uploadUrl(site.settings.headshot_upload_id)" :alt="site.streamerName" class="h-auto w-full" />
        </div>
        <div v-else class="panel p-6" style="background: #ffffff">
          <img src="/brand/v1/logo.png" :alt="`${site.siteName} logo`" class="h-auto w-full" width="1299" height="961" />
        </div>

        <div class="panel p-5">
          <p class="kicker">Catch her live</p>
          <p class="display mt-2 text-2xl">Get told before she starts</p>
          <div class="mt-4 flex flex-wrap gap-3">
            <RouterLink v-if="site.isEnabled('streams')" to="/streams" class="btn btn-sm">The schedule</RouterLink>
            <RouterLink
              v-if="!auth.user && site.isEnabled('signup')"
              to="/signup"
              class="btn btn-sm btn-ink"
            >
              Sign up
            </RouterLink>
          </div>
        </div>
      </aside>
    </div>
  </section>
</template>
