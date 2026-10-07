<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { PAGE_PATHS } from '../api/types';
import { useSiteStore } from '../stores/site';
import PlatformIcon from './PlatformIcon.vue';

const site = useSiteStore();
</script>

<template>
  <div class="stripes" aria-hidden="true"></div>
  <footer class="band band-ink">
    <div class="container-page py-14">
      <div class="grid gap-10 sm:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <!--
            An uploaded logo REPLACES the lockup rather than stacking above
            it. The lockup is the fallback, not the default: the logo as drawn
            is black type and would vanish on this band, so what sits here out
            of the box is the lips and the name in white.
          -->
          <img
            v-if="site.settings.logo_upload_id"
            :src="`/api/uploads/${site.settings.logo_upload_id}`"
            :alt="site.siteName"
            class="h-auto w-full max-w-xs"
          />
          <template v-else>
            <img src="/brand/v1/lips.png" alt="" class="h-16 w-auto" width="743" height="600" />
            <p class="display mt-3 text-4xl">{{ site.siteName }}</p>
          </template>
          <p v-if="site.settings.tagline" class="mt-3 max-w-[30ch] text-sm opacity-75">
            {{ site.settings.tagline }}
          </p>
        </div>

        <!-- Sub pages are indented under their parent, the same arrangement
             the phone drawer uses. A footer is a sitemap, so flattening the
             hierarchy here would throw away the one thing it is for. -->
        <nav class="flex flex-col gap-2.5" aria-label="Footer">
          <p class="kicker !text-white/60">Browse</p>
          <template v-for="node in site.navTree" :key="node.page.key">
            <RouterLink :to="PAGE_PATHS[node.page.key]" class="font-head text-sm font-semibold no-underline hover:underline">
              {{ node.page.navLabel }}
            </RouterLink>
            <RouterLink
              v-for="child in node.children"
              :key="child.key"
              :to="PAGE_PATHS[child.key]"
              class="ml-4 font-head text-sm no-underline opacity-80 hover:underline"
            >
              {{ child.navLabel }}
            </RouterLink>
          </template>
        </nav>

        <div class="flex flex-col gap-2.5">
          <p class="kicker !text-white/60">Find her</p>
          <a
            v-for="channel in site.linkChannels"
            :key="channel.id"
            :href="channel.url"
            :target="channel.platform === 'email' ? undefined : '_blank'"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-2 font-head text-sm font-semibold no-underline hover:underline"
          >
            <PlatformIcon :platform="channel.platform" class="size-4" />
            {{ channel.name }}
          </a>
          <RouterLink
            v-if="site.isEnabled('settings')"
            to="/account"
            class="mt-2 font-head text-sm no-underline opacity-80 hover:underline"
          >
            Stream alerts
          </RouterLink>
        </div>
      </div>

      <p class="kicker mt-12 border-t border-white/20 pt-6 !text-white/60">
        © {{ new Date().getFullYear() }} {{ site.siteName }} ·
        <a :href="site.orgSiteUrl" target="_blank" rel="noopener noreferrer" class="no-underline hover:underline">
          A Mucci &amp; Co venture
        </a>
        <!-- One Terms and one Privacy Policy for every venture, kept at the
             corporate site. The local /privacy route redirects there. -->
        ·
        <a :href="`${site.orgSiteUrl}/terms`" target="_blank" rel="noopener noreferrer" class="no-underline hover:underline">Terms</a>
        ·
        <a :href="`${site.orgSiteUrl}/privacy`" target="_blank" rel="noopener noreferrer" class="no-underline hover:underline">Privacy</a>
      </p>
      <!-- Required by the Steam Web API terms wherever Steam data is shown. -->
      <p class="mt-3 max-w-prose text-xs text-white/50">
        Game details, artwork and playtime come from
        <a href="https://store.steampowered.com/" target="_blank" rel="noopener noreferrer">Steam</a>.
        Steam and the Steam logo are trademarks of Valve Corporation. This site is not affiliated with Valve.
      </p>
    </div>
  </footer>
</template>
