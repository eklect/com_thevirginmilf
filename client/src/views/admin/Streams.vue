<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { api, errorMessage } from '../../api/client';
import { formatDateTime, type AdminStream } from '../../api/types';
import ConfirmButton from './ConfirmButton.vue';
import { useSaveNotice } from './useSaveNotice';

/**
 * Not `useCollection`: streams have no `sort_order` and order themselves by
 * date, so there is no `PUT /order` route to call. See `StreamsService`.
 */
const streams = ref<AdminStream[]>([]);
const loading = ref(true);
const error = ref('');
const busy = ref(false);

async function load() {
  error.value = '';
  try {
    streams.value = (await api.get<{ streams: AdminStream[] }>('/api/admin/streams')).streams;
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}

async function setPublished(stream: AdminStream) {
  error.value = '';
  busy.value = true;
  try {
    const { stream: updated } = await api.put<{ stream: AdminStream }>(`/api/admin/streams/${stream.id}`, {
      isPublished: !stream.isPublished,
    });
    streams.value = streams.value.map((row) => (row.id === stream.id ? updated : row));
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}

async function remove(stream: AdminStream) {
  error.value = '';
  busy.value = true;
  try {
    await api.delete(`/api/admin/streams/${stream.id}`);
    streams.value = streams.value.filter((row) => row.id !== stream.id);
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}

const isPast = (stream: AdminStream) => new Date(stream.startsAt).getTime() < Date.now();

/** Where the alerts for a stream stand, in a few words. */
function alertState(stream: AdminStream): string {
  if (!stream.isPublished) return 'Draft — nobody is told';
  if (!stream.notify) return 'Alerts off for this stream';
  if (stream.remindedStartAt) return 'Announced and reminded';
  if (stream.announcedAt) return isPast(stream) ? 'Announced' : 'Announced · reminder to come';
  return isPast(stream) ? 'Not announced' : 'Announcing shortly';
}

const upcoming = computed(() => streams.value.filter((stream) => !isPast(stream)).reverse());
const past = computed(() => streams.value.filter(isPast));

onMounted(load);

// Shows the confirmation the editor left behind on its way here.
const { notice } = useSaveNotice();
</script>

<template>
  <header class="flex items-center justify-between gap-4">
    <h1 class="display text-4xl">Streams</h1>
    <RouterLink to="/admin/streams/new" class="btn btn-sm">Schedule a stream</RouterLink>
  </header>
  <p class="mt-2 max-w-prose text-sm text-muted">
    Publishing a stream puts it on the calendar and tells everyone who signed up — about two minutes
    after your last edit, so there is time to fix a mistake first.
  </p>

  <p v-if="error" class="notice-error mt-5">{{ error }}</p>
  <!-- Set by the editor just before it navigated back here. -->
  <p v-if="notice" role="status" class="notice mt-5">{{ notice }}</p>

  <template v-for="group in [{ title: 'Coming up', rows: upcoming }, { title: 'Past', rows: past }]" :key="group.title">
    <template v-if="group.rows.length">
      <h2 class="kicker masthead-rule mt-9 pt-4">{{ group.title }}</h2>
      <div class="overflow-x-auto">
        <table class="mt-3 w-full min-w-[640px] text-sm">
          <thead>
            <tr class="border-b border-border text-left">
              <th class="kicker py-2.5">Stream</th>
              <th class="kicker w-48 py-2.5">When</th>
              <th class="kicker w-52 py-2.5">Alerts</th>
              <th class="kicker w-28 py-2.5">Calendar</th>
              <th class="kicker w-32 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="stream in group.rows" :key="stream.id" class="border-b border-border align-top">
              <td class="py-3 pr-4">
                <RouterLink :to="`/admin/streams/${stream.id}`" class="font-semibold no-underline hover:underline">
                  {{ stream.title }}
                </RouterLink>
                <span class="block text-xs text-muted">
                  {{ stream.channels.map((channel) => channel.name).join(' · ') || 'No channel yet' }}
                  <template v-if="stream.game"> · {{ stream.game.title }}</template>
                </span>
              </td>
              <td class="py-3 pr-4" :class="isPast(stream) ? 'text-muted' : ''">
                {{ formatDateTime(stream.startsAt) }}
              </td>
              <td class="py-3 pr-4 text-xs text-muted">{{ alertState(stream) }}</td>
              <td class="py-3">
                <button type="button" class="kicker hover:text-text" :disabled="busy" @click="setPublished(stream)">
                  {{ stream.isPublished ? 'Published' : 'Draft' }}
                </button>
              </td>
              <td class="py-3 text-right">
                <ConfirmButton :disabled="busy" @confirm="remove(stream)" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </template>

  <p v-if="!loading && !streams.length" class="py-10 text-sm text-muted">
    Nothing scheduled yet.
  </p>
</template>
