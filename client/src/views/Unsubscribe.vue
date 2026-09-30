<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { api, errorMessage } from '../api/client';

interface State {
  found: boolean;
  subscribed: boolean;
  email: string | null;
}

const route = useRoute();
const token = route.params.token as string;

const state = ref<State | null>(null);
const error = ref('');
const busy = ref(false);
const done = ref(false);

/**
 * The GET only reports; the POST performs.
 *
 * Outlook Safe Links and corporate mail scanners follow every URL in a message
 * before a human sees it, so a GET that unsubscribed would let them quietly
 * empty the list. This page loads, shows one button, and waits to be clicked.
 * See server/src/subscribers/unsubscribe.controller.ts.
 */
onMounted(async () => {
  try {
    state.value = await api.get<State>(`/api/unsubscribe/${encodeURIComponent(token)}`);
  } catch (e) {
    error.value = errorMessage(e);
  }
});

async function act(path: string): Promise<void> {
  error.value = '';
  busy.value = true;
  try {
    state.value = await api.post<State>(`/api/unsubscribe/${encodeURIComponent(token)}${path}`);
    done.value = true;
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="band">
    <div class="band-inner">
    <div class="mx-auto max-w-lg py-10 text-center">
      <p class="kicker">Email preferences</p>

      <p v-if="error" class="notice-error mt-6 text-left">{{ error }}</p>

      <template v-else-if="state && !state.found">
        <h1 class="display mt-3 text-5xl">That link has expired</h1>
        <p class="mt-4 text-muted">
          It may already have been used. If you are still getting emails, sign in and turn them off
          from your account page.
        </p>
        <p class="mt-8"><RouterLink to="/account" class="kicker no-underline">Account →</RouterLink></p>
      </template>

      <template v-else-if="state">
        <template v-if="state.subscribed">
          <h1 class="display mt-3 text-5xl">Unsubscribe?</h1>
          <p class="mt-4 text-muted">
            You will stop getting stream emails at
            <strong>{{ state.email }}</strong
            >.
          </p>
          <button type="button" class="btn mt-8" :disabled="busy" @click="act('')">
            {{ busy ? 'Working…' : 'Unsubscribe' }}
          </button>
        </template>

        <template v-else>
          <h1 class="display mt-3 text-5xl">{{ done ? 'Done' : 'Already unsubscribed' }}</h1>
          <p class="mt-4 text-muted">
            <template v-if="done">You will not get any more stream emails.</template>
            <template v-else>This address is not getting stream emails.</template>
          </p>
          <button
            type="button"
            class="kicker mt-8 underline disabled:opacity-50"
            :disabled="busy"
            @click="act('/resubscribe')"
          >
            {{ done ? 'Actually, put me back on' : 'Subscribe again' }}
          </button>
        </template>
      </template>

      <p class="masthead-rule mx-auto mt-12 max-w-[12rem] pt-6"><RouterLink to="/" class="kicker no-underline">Back to the site →</RouterLink></p>
    </div>
    </div>
  </section>
</template>
