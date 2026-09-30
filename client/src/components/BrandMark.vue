<script setup lang="ts">
import { useSiteStore } from '../stores/site';

/**
 * The lockup in the masthead: the lips, then the name in type.
 *
 * The name is LIVE TYPE, not the logo image, and that is the whole reason
 * this component exists. The logo file is black letters on transparency — on
 * the dark theme it is black on black. Set in the display face it follows
 * `--text` like every other word on the page, and the lips, which are red in
 * either theme, carry the identity.
 *
 * The full logo as drawn is used once, on the home page's hero, where it sits
 * on a white plate in both themes.
 */
const site = useSiteStore();
</script>

<template>
  <span class="inline-flex items-center gap-2.5">
    <img src="/brand/v1/lips.png" alt="" class="h-8 w-auto shrink-0 sm:h-9" width="743" height="600" />
    <span class="display whitespace-nowrap text-xl leading-none sm:text-2xl">{{ site.siteName }}</span>
  </span>
</template>
