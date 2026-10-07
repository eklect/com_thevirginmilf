<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, errorMessage } from '../../api/client';
import type { SiteSettingKey, SiteSettings } from '../../api/types';
import { SITE_SETTING_KEYS } from '../../api/types';
import ImagePicker from '../../components/ImagePicker.vue';
import MarkdownEditor from '../../components/MarkdownEditor.vue';
import { useSiteStore } from '../../stores/site';
import { useSaveNotice } from './useSaveNotice';

const site = useSiteStore();
const form = ref<SiteSettings>(
  Object.fromEntries(SITE_SETTING_KEYS.map((k) => [k, ''])) as SiteSettings,
);
const error = ref('');
const busy = ref(false);

// Stays on the page after saving, and it is a long page — the confirmation is
// pinned to the form so it cannot outlive the version it is about.
const { notice, alertEl, revealAlert, flagSaved, clearNotice } = useSaveNotice(form);

/**
 * `toggle` is stored as a string like every other setting — `'on'` / `'off'` —
 * because `site_settings.value` is one text column and giving one key its own
 * type would mean giving the table a schema. It reads as "not off", so a key
 * nobody has saved yet is on.
 */
type Field = {
  key: SiteSettingKey;
  label: string;
  hint?: string;
  long?: boolean;
  /** Edited with the Markdown editor (toolbar, visual pane, raw toggle) rather than a textarea. */
  markdown?: boolean;
  type?: string;
  toggle?: boolean;
};

/**
 * An upload-id setting, edited with `ImagePicker` rather than a text box.
 * Kept beside the group's fields so adding one is data, not another `v-if`
 * pinned to a group's title.
 */
type ImageField = { key: SiteSettingKey; label: string; hint?: string };

const GROUPS: {
  title: string;
  note?: string;
  fields: Field[];
  images?: ImageField[];
}[] = [
  {
    title: 'Identity',
    fields: [
      { key: 'site_name', label: 'Site name', hint: 'The wordmark at the top of every page.' },
      {
        key: 'streamer_name',
        label: 'Streamer name',
        hint: 'Her gamer tag, as alerts and the hero say it — "TheVirginMILF is going live…".',
      },
      { key: 'tagline', label: 'Tagline', hint: 'The big headline on the front page.' },
    ],
    images: [
      {
        key: 'logo_upload_id',
        label: 'Footer logo',
        hint:
          'Shown in the footer IN PLACE OF the lips and the name. The footer is black in both ' +
          'themes, so upload a version with white or red lettering on a transparent background — ' +
          'the standard logo is black type and would disappear. Leave it empty and the footer ' +
          'draws the lips and the name in white.',
      },
      {
        key: 'headshot_upload_id',
        label: 'Photo',
        hint: 'Shown beside the About page. Portrait or square works best. Empty shows the logo.',
      },
    ],
  },
  {
    title: 'Page introductions',
    note: 'The line under each page’s heading. Plain text — leave one blank to omit it.',
    fields: [
      { key: 'home_intro', label: 'Home', long: true },
      { key: 'streams_intro', label: 'Streams', long: true },
      { key: 'live_intro', label: 'Live', long: true, hint: 'Shown when she is off air.' },
      { key: 'games_intro', label: 'Games', long: true },
      { key: 'favorites_intro', label: 'Favorites', long: true },
      { key: 'links_intro', label: 'Links', long: true },
      {
        key: 'subscribe_intro',
        label: 'Stream alerts',
        long: true,
        hint: 'The pitch for signing up: on the front page, the sign-up page and the account page.',
      },
    ],
  },
  {
    title: 'About',
    fields: [
      {
        key: 'about_body',
        label: 'About page',
        markdown: true,
        hint:
          'Stored as Markdown; the toolbar and the raw view edit the same source. A heading ' +
          '(H2) starts a new section.',
      },
    ],
  },
  {
    title: 'Favorites',
    note:
      'The favorites list is every game with a heart, followed by the most-played games from ' +
      'Steam that are not already on it.',
    fields: [
      {
        key: 'favorites_auto_count',
        label: 'How many most-played games to add',
        type: 'number',
        hint:
          'A whole number up to 50. 0 shows hearted games only. Keep a single game off this half ' +
          'of the list from its edit page.',
      },
    ],
  },
  {
    title: 'Stream alerts',
    note:
      'What goes out to people who signed up — by email, and as a notification to every browser ' +
      'that asked for one. Switching a kind off here stops it for everybody; each person also ' +
      'chooses email and notifications for themselves on their account page. A stream is ' +
      'announced about two minutes after it was last edited, so there is time to fix a typo.',
    fields: [
      {
        key: 'notify_announce',
        label: 'Announce a stream when it is published',
        toggle: true,
        hint:
          'One message per stream, ever. Streams published while this is off are NOT announced ' +
          'later when it is switched back on.',
      },
      {
        key: 'notify_reminder',
        label: 'Remind people shortly before it starts',
        toggle: true,
        hint: 'A rescheduled stream gets a fresh reminder for its new time.',
      },
      {
        key: 'reminder_lead_minutes',
        label: 'Minutes before the start to send the reminder',
        type: 'number',
        hint: 'Between 5 and 1440. Blank is 30.',
      },
      {
        key: 'alerts_timezone',
        label: 'Time zone used in alerts',
        hint:
          'An IANA zone name such as America/New_York or America/Los_Angeles. The calendar on the ' +
          'site shows each visitor their own time; an email or a notification cannot, so it ' +
          'states the time in this zone and names it.',
      },
      {
        key: 'mail_from_name',
        label: 'Sign emails as',
        hint:
          'The NAME emails arrive from. The address is MAIL_FROM in the server’s environment, ' +
          'because it has to match what the mail service is allowed to send as.',
      },
    ],
  },
];

onMounted(async () => {
  try {
    const { settings } = await api.get<{ settings: SiteSettings }>('/api/admin/settings');
    form.value = { ...form.value, ...settings };
  } catch (e) {
    error.value = errorMessage(e);
  }
});

async function save() {
  error.value = '';
  clearNotice();
  busy.value = true;
  try {
    // A flat key -> value map, not a `{ settings }` envelope: the endpoint reads
    // the body's own keys and 400s on any that is not a known setting.
    await api.put('/api/admin/settings', form.value);
    await site.reload();
    await flagSaved('Saved.');
  } catch (e) {
    error.value = errorMessage(e);
    await revealAlert();
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <h1 class="display text-3xl">Site settings</h1>

  <p
    v-if="error"
    ref="alertEl"
    role="alert"
    class="notice-error mt-5"
  >
    {{ error }}
  </p>
  <p
    v-else-if="notice"
    ref="alertEl"
    role="status"
    class="notice mt-5"
  >
    {{ notice }}
  </p>

  <form class="mt-7 max-w-2xl" @submit.prevent="save">
    <section v-for="group in GROUPS" :key="group.title" class="mb-10">
      <h2 class="kicker masthead-rule pt-4">{{ group.title }}</h2>
      <p v-if="group.note" class="mt-3 max-w-prose text-xs leading-relaxed text-muted">
        {{ group.note }}
      </p>

      <div class="mt-5 space-y-5">
        <div v-for="field in group.fields" :key="field.key">
          <!--
            A toggle labels itself, so it opts out of the `.kicker` label above
            the control and carries its hint inside the same clickable label.
          -->
          <label v-if="field.toggle" class="flex cursor-pointer items-start gap-3">
            <input
              :id="field.key"
              type="checkbox"
              class="mt-1 h-4 w-4 accent-[var(--accent)]"
              :checked="form[field.key] !== 'off'"
              @change="
                form[field.key] = ($event.target as HTMLInputElement).checked ? 'on' : 'off'
              "
            />
            <span>
              <span class="font-head text-sm font-bold">{{ field.label }}</span>
              <span v-if="field.hint" class="mt-1 block text-xs leading-relaxed text-muted">
                {{ field.hint }}
              </span>
            </span>
          </label>

          <template v-else>
          <label :for="field.key" class="kicker block">{{ field.label }}</label>
          <MarkdownEditor
            v-if="field.markdown"
            v-model="form[field.key]"
            class="mt-1.5"
          />
          <textarea
            v-else-if="field.long"
            :id="field.key"
            v-model="form[field.key]"
            rows="4"
            class="input mt-1.5"
          ></textarea>
          <input
            v-else
            :id="field.key"
            v-model="form[field.key]"
            :type="field.type ?? 'text'"
            class="input mt-1.5"
          />
          <p v-if="field.hint" class="mt-1.5 text-xs text-muted">{{ field.hint }}</p>
          </template>
        </div>

        <ImagePicker
          v-for="image in group.images ?? []"
          :key="image.key"
          v-model="form[image.key]"
          :label="image.label"
          :hint="image.hint"
        />
      </div>
    </section>

    <button type="submit" :disabled="busy" class="btn">
      {{ busy ? 'Saving…' : 'Save settings' }}
    </button>
  </form>
</template>
