<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import { api, errorMessage } from '../api/client';
import ThemeToggle from '../components/ThemeToggle.vue';
import { useAuthStore } from '../stores/auth';
import { useSiteStore } from '../stores/site';

const auth = useAuthStore();
const site = useSiteStore();

const firstName = ref('');
const lastName = ref('');
const email = ref('');
const password = ref('');
/**
 * Ticked to begin with: being told about streams is what this account is for,
 * and the box is on the form, in plain sight, for anybody who wants the
 * account without the email. The server treats an absent value as not ticked.
 */
const emailAlerts = ref(true);
const error = ref('');
const busy = ref(false);
const created = ref(false);

/**
 * The account is created at MAP by this site's server, over the service plane.
 * Nothing comes back but `ok` — the next step is the ordinary sign-in trip to
 * MAP, which is where a session comes from. It lands on the account page, so
 * the first thing a new person sees is what they just chose, and the switch
 * for notifications on this device beside it.
 */
async function submit() {
  error.value = '';
  busy.value = true;
  try {
    await api.post('/api/register', {
      firstName: firstName.value,
      lastName: lastName.value,
      email: email.value,
      password: password.value,
      emailAlerts: emailAlerts.value,
    });
    created.value = true;
    auth.startLogin('/account?welcome=1');
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="grid min-h-screen lg:grid-cols-2">
    <aside class="band-brand flex flex-col justify-between px-7 py-10 sm:px-12 sm:py-14">
      <div class="my-auto">
        <img src="/brand/v1/lips.png" alt="" class="h-24 w-auto sm:h-32" width="743" height="600" />
        <h1 class="display mt-6 text-[clamp(64px,11vw,150px)] leading-[0.88]">Join</h1>
        <p class="mt-6 border-t-2 border-white/50 pt-5 font-head text-xs font-extrabold uppercase tracking-[0.18em] text-white/85">
          One account for every Mucci &amp; Co venture
        </p>
        <p class="mt-6 hidden max-w-[28ch] text-lg leading-relaxed text-white/90 lg:block">
          {{ site.settings.subscribe_intro || 'Get told when a stream is scheduled, and again just before she goes live.' }}
        </p>
      </div>
      <RouterLink to="/" class="font-head text-xs font-bold uppercase tracking-[0.14em] no-underline hover:underline">
        ← Back to {{ site.siteName }}
      </RouterLink>
    </aside>

    <div class="relative grid place-items-center px-7 py-12">
      <ThemeToggle class="absolute right-7 top-7" />

      <div class="w-full max-w-[420px]">
        <p class="kicker">New here</p>
        <h2 class="display mt-2 text-5xl">Create your account</h2>
        <hr class="masthead-rule mt-5" />

        <p v-if="created" class="notice mt-6">Account created. Taking you to sign in…</p>
        <p v-if="error" class="notice-error mt-6">{{ error }}</p>

        <form v-if="!created" class="mt-7 space-y-5" @submit.prevent="submit">
          <div class="grid gap-5 sm:grid-cols-2">
            <div>
              <label for="first" class="kicker block">First name</label>
              <input id="first" v-model="firstName" type="text" autocomplete="given-name" required class="field mt-1.5" />
            </div>
            <div>
              <label for="last" class="kicker block">Last name</label>
              <input id="last" v-model="lastName" type="text" autocomplete="family-name" required class="field mt-1.5" />
            </div>
          </div>

          <div>
            <label for="email" class="kicker block">Email</label>
            <input id="email" v-model="email" type="email" autocomplete="username" required class="field mt-1.5" />
          </div>

          <div>
            <label for="password" class="kicker block">Password</label>
            <!-- 12 is MAP's rule, restated here so the field fails locally
                 rather than as a 400 from the service plane. Keep the three
                 copies in step: this input, CreateRegisterDto, and MAP. -->
            <input
              id="password"
              v-model="password"
              type="password"
              autocomplete="new-password"
              minlength="12"
              required
              class="field mt-1.5"
            />
            <p class="mt-1.5 text-xs text-muted">At least 12 characters. Length matters more than symbols.</p>
          </div>

          <label class="flex cursor-pointer items-start gap-3 border-2 border-rule bg-surface-alt p-4">
            <input v-model="emailAlerts" type="checkbox" class="mt-0.5 size-4 accent-[var(--accent)]" />
            <span>
              <span class="font-head text-sm font-bold">Email me when she streams</span>
              <span class="mt-1 block text-xs text-muted">
                One email when a stream is scheduled and one shortly before it starts. Every email has an
                unsubscribe link, and you can change this from your account page.
              </span>
            </span>
          </label>

          <button type="submit" :disabled="busy" class="btn w-full">
            {{ busy ? 'Creating…' : 'Create account' }}
          </button>
        </form>

        <p class="kicker mt-8 text-center">
          Already have one?
          <button type="button" class="font-bold uppercase text-text underline decoration-accent decoration-2 underline-offset-4" @click="auth.startLogin('/')">
            Sign in
          </button>
        </p>
      </div>
    </div>
  </div>
</template>
