<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api, errorMessage } from '../api/client';
import type { AccountSettings } from '../api/types';
import { Switch } from '../components/ui/switch';
import {
  currentSubscription,
  disablePush,
  enablePush,
  PushError,
  pushPermission,
  pushSupport,
  resyncPush,
} from '../lib/push';
import { useAuthStore } from '../stores/auth';
import { useSiteStore } from '../stores/site';

/**
 * Stream alerts, two ways, each with its own switch.
 *
 * Email and notifications are independent on purpose: somebody who wants a
 * buzz on their phone and nothing in their inbox turns email off and
 * notifications on, and the reverse is just as ordinary. Neither switch knows
 * about the other.
 *
 * They also differ in what they are attached to. The email switch is the
 * ACCOUNT's — one address, wherever you sign in. The notification switch is
 * THIS BROWSER's — a phone and a laptop are two subscriptions, switched on in
 * each.
 */
const auth = useAuthStore();
const site = useSiteStore();
const route = useRoute();

const welcome = computed(() => route.query.welcome === '1');

// ---------- email ----------

const settings = ref<AccountSettings | null>(null);
const emailError = ref('');
const emailSaved = ref(false);
const emailBusy = ref(false);

/**
 * Saves immediately on toggle rather than behind a Save button. A switch that
 * needs a second click to mean anything invites somebody to flip it, read the
 * confirmation they expected, and leave without it having been saved.
 */
async function setEmailAlerts(value: boolean): Promise<void> {
  emailError.value = '';
  emailSaved.value = false;
  emailBusy.value = true;
  try {
    settings.value = (
      await api.put<{ settings: AccountSettings }>('/api/account/settings', { emailAlerts: value })
    ).settings;
    emailSaved.value = true;
  } catch (e) {
    emailError.value = errorMessage(e);
  } finally {
    emailBusy.value = false;
  }
}

// ---------- notifications on this device ----------

const support = computed(() => pushSupport(site.pushPublicKey));
const pushOn = ref(false);
const devices = ref(0);
const pushBusy = ref(false);
const pushError = ref('');
const pushSaved = ref('');
/** Read once at load; a denied prompt updates it. */
const blocked = ref(false);

async function refreshPush(): Promise<void> {
  if (support.value !== 'supported') return;
  blocked.value = pushPermission() === 'denied';
  // A subscription only counts if the permission behind it still stands.
  pushOn.value = pushPermission() === 'granted' && (await currentSubscription()) !== null;
  try {
    // Quietly re-sends an existing subscription; asks for nothing.
    if (pushOn.value) await resyncPush();
    devices.value = (await api.get<{ devices: number }>('/api/account/push-subscriptions')).devices;
  } catch {
    // The switch still reflects this browser; the device count is a nicety.
  }
}

/** Called from the switch — a click — which is what lets it ask permission. */
async function setPush(value: boolean): Promise<void> {
  pushError.value = '';
  pushSaved.value = '';
  pushBusy.value = true;
  try {
    if (value) {
      await enablePush(site.pushPublicKey);
      pushSaved.value = 'Notifications are on for this device.';
    } else {
      await disablePush();
      pushSaved.value = 'Notifications are off for this device.';
    }
  } catch (e) {
    pushError.value = e instanceof PushError ? e.message : errorMessage(e);
    if (e instanceof PushError && e.reason === 'denied') blocked.value = true;
  } finally {
    await refreshPush();
    pushBusy.value = false;
  }
}

async function turnOffEverywhere(): Promise<void> {
  pushError.value = '';
  pushSaved.value = '';
  pushBusy.value = true;
  try {
    const subscription = await currentSubscription();
    await api.delete('/api/account/push-subscriptions');
    await subscription?.unsubscribe();
    pushSaved.value = 'Notifications are off on every device.';
  } catch (e) {
    pushError.value = errorMessage(e);
  } finally {
    await refreshPush();
    pushBusy.value = false;
  }
}

onMounted(async () => {
  try {
    settings.value = (await api.get<{ settings: AccountSettings }>('/api/account/settings')).settings;
  } catch (e) {
    emailError.value = errorMessage(e);
  }
  await refreshPush();
});
</script>

<template>
  <section class="band">
    <div class="band-inner">
      <div class="mx-auto max-w-2xl">
        <p class="kicker">Account</p>
        <h1 class="display mt-2 text-5xl sm:text-6xl">{{ auth.displayName }}</h1>
        <hr class="masthead-rule mt-5" />

        <p v-if="welcome" class="notice mt-6" role="status">
          You're in. This is where your stream alerts live — check they are set the way you want.
        </p>

        <h2 class="display mt-10 text-3xl">Stream alerts</h2>
        <p class="mt-2 text-muted">
          {{ site.settings.subscribe_intro || 'Get told when a stream is scheduled, and again just before she goes live.' }}
          Email and notifications are separate: have either, both or neither.
        </p>

        <!-- Email -->
        <div class="panel mt-6 p-5">
          <p v-if="emailError" class="notice-error mb-4">{{ emailError }}</p>
          <div v-if="settings" class="flex items-start justify-between gap-5">
            <div>
              <label for="email-alerts" class="font-head text-base font-extrabold">Email</label>
              <p class="mt-1 text-sm text-muted">
                Sent to <strong class="text-text">{{ settings.email }}</strong>. Every email carries an
                unsubscribe link, so you never need to sign in to stop them.
              </p>
            </div>
            <Switch
              id="email-alerts"
              class="mt-1 scale-150"
              :model-value="settings.emailAlerts"
              :disabled="emailBusy"
              @update:model-value="(value: boolean) => setEmailAlerts(value)"
            />
          </div>
          <p v-if="emailSaved && settings" class="kicker mt-3" role="status">
            Saved — email alerts are {{ settings.emailAlerts ? 'on' : 'off' }}.
          </p>
        </div>

        <!-- Notifications. Absent altogether when the server cannot send them. -->
        <div v-if="support !== 'unavailable'" class="panel mt-6 p-5">
          <p v-if="pushError" class="notice-error mb-4">{{ pushError }}</p>

          <div v-if="support === 'supported'" class="flex items-start justify-between gap-5">
            <div>
              <label for="push-alerts" class="font-head text-base font-extrabold">
                Notifications on this device
              </label>
              <p class="mt-1 text-sm text-muted">
                A notification from your browser, even when this site is not open. It is for this
                browser only — switch it on again on each phone or computer you want it on.
              </p>
              <p v-if="blocked" class="mt-3 text-sm text-danger">
                Notifications are blocked for this site in your browser. Allow them in the site settings
                (the icon beside the address), then switch this on.
              </p>
            </div>
            <Switch
              id="push-alerts"
              class="mt-1 scale-150"
              :model-value="pushOn"
              :disabled="pushBusy"
              @update:model-value="(value: boolean) => setPush(value)"
            />
          </div>

          <!-- An iPhone in a browser tab: possible, but only after installing. -->
          <div v-else-if="support === 'ios-needs-install'">
            <p class="font-head text-base font-extrabold">Notifications on this iPhone or iPad</p>
            <p class="mt-1 text-sm text-muted">
              Apple only delivers notifications to a site you have added to your Home Screen. In Safari,
              tap <strong class="text-text">Share</strong>, then
              <strong class="text-text">Add to Home Screen</strong>, open {{ site.siteName }} from the
              new icon, and come back to this page to switch them on. Email alerts work without any of that.
            </p>
          </div>

          <div v-else>
            <p class="font-head text-base font-extrabold">Notifications</p>
            <p class="mt-1 text-sm text-muted">
              This browser cannot receive notifications from a website. Email alerts work everywhere.
            </p>
          </div>

          <p v-if="pushSaved" class="kicker mt-3" role="status">{{ pushSaved }}</p>
          <p v-if="devices > 0" class="rule-thin mt-4 flex flex-wrap items-center justify-between gap-3 pt-3 text-xs text-muted">
            <span>On for {{ devices }} {{ devices === 1 ? 'device' : 'devices' }} on this account.</span>
            <button type="button" class="kicker hover:text-danger" :disabled="pushBusy" @click="turnOffEverywhere">
              Turn off everywhere
            </button>
          </p>
        </div>

        <!--
          Everything identity-shaped lives at MAP and this page links out rather
          than proxying it. This site holds no name, no email of record and no
          password — see server/src/common/auth/principal.ts.
        -->
        <section class="masthead-rule mt-12 pt-6">
          <h2 class="kicker">Name, email and password</h2>
          <p class="mt-2 text-sm text-muted">
            Your account is shared across every Mucci &amp; Co site, so those are managed in one place.
          </p>
          <p class="mt-3">
            <a :href="site.mapPortalUrl" target="_blank" rel="noopener noreferrer" class="kicker text-text">
              Open your account portal →
            </a>
          </p>
        </section>
      </div>
    </div>
  </section>
</template>
