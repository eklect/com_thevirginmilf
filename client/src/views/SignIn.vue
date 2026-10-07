<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { ProviderInfo } from '../api/social';
import SocialButtons from '../components/SocialButtons.vue';
import SocialDivider from '../components/SocialDivider.vue';
import { RouterLink, useRoute } from 'vue-router';
import ThemeToggle from '../components/ThemeToggle.vue';
import { useAuthStore } from '../stores/auth';
import { useSiteStore } from '../stores/site';

const auth = useAuthStore();
const site = useSiteStore();
const route = useRoute();

/**
 * There is no password form here, deliberately.
 *
 * This site never sees a password — signing in is a full-page trip to MAP and
 * back. The page exists to explain that, and to carry the error MAP's callback
 * bounced here when something went wrong.
 */
const error = ref('');

onMounted(() => {
  const description = route.query.error_description ?? route.query.error;
  if (description) error.value = String(description);
  void auth.loadProviders();
});

/** The same trip, started at a provider's door on MAP's side. */
function continueWith(provider: ProviderInfo['key']) {
  auth.startSocial(provider, '/');
}
</script>

<template>
  <div class="grid min-h-screen lg:grid-cols-2">
    <aside class="band-brand flex flex-col justify-between px-7 py-10 sm:px-12 sm:py-14">
      <div class="my-auto">
        <img src="/brand/v1/lips.png" alt="" class="h-24 w-auto sm:h-32" width="743" height="600" />
        <h1 class="display mt-6 text-[clamp(64px,11vw,150px)] leading-[0.88]">Sign in</h1>
        <p class="mt-6 border-t-2 border-white/50 pt-5 font-head text-xs font-extrabold uppercase tracking-[0.18em] text-white/85">
          Through the Mucci &amp; Co portal
        </p>
      </div>
      <RouterLink to="/" class="font-head text-xs font-bold uppercase tracking-[0.14em] no-underline hover:underline">
        ← Back to {{ site.siteName }}
      </RouterLink>
    </aside>

    <div class="relative grid place-items-center px-7 py-12">
      <ThemeToggle class="absolute right-7 top-7" />

      <div class="w-full max-w-[400px]">
        <p class="kicker">Welcome back</p>
        <h2 class="display mt-2 text-5xl">Come on in</h2>
        <hr class="masthead-rule mt-5" />

        <p v-if="error" class="notice-error mt-6">{{ error }}</p>

        <p class="mt-6 text-sm leading-relaxed text-muted">
          Your account lives at the Mucci &amp; Co portal. We'll send you there to sign in, and
          bring you straight back.
        </p>

        <button type="button" class="btn mt-7 w-full" @click="auth.startLogin('/')">
          Continue to the portal
        </button>

        <template v-if="auth.providers.length">
          <SocialDivider />
          <SocialButtons :providers="auth.providers" @pick="continueWith" />
        </template>

        <p v-if="site.isEnabled('signup')" class="kicker mt-8 text-center">
          No account yet?
          <RouterLink to="/signup" class="text-text">Create one</RouterLink>
        </p>
      </div>
    </div>
  </div>
</template>
