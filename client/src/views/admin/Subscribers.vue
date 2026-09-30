<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, errorMessage } from '../../api/client';
import { formatDate, type SubscriberRow } from '../../api/types';

interface Payload {
  summary: { total: number; subscribed: number; suppressed: number };
  subscribers: SubscriberRow[];
  queue: Record<string, number>;
  push: { devices: number; people: number };
  pushQueue: Record<string, number>;
}

const data = ref<Payload | null>(null);
const error = ref('');

onMounted(async () => {
  try {
    data.value = await api.get<Payload>('/api/admin/subscribers');
  } catch (e) {
    error.value = errorMessage(e);
  }
});

const QUEUE_LABELS: Record<string, string> = {
  pending: 'Waiting',
  sending: 'Sending',
  sent: 'Sent',
  logged: 'Logged, not sent',
  expired: 'Expired unsent',
  dead: 'Gave up',
};
</script>

<template>
  <h1 class="display text-4xl">Subscribers</h1>
  <p class="mt-2 max-w-prose text-sm text-muted">
    Read-only. Somebody else's alerts are theirs — they set them on their account page and clear
    email from the unsubscribe link in any message. There is deliberately no way to opt somebody in
    from here.
  </p>

  <p v-if="error" class="notice-error mt-5">{{ error }}</p>

  <template v-if="data">
    <div class="mt-7 flex flex-wrap gap-x-10 gap-y-5">
      <div>
        <p class="kicker">Getting email</p>
        <p class="display text-5xl">{{ data.summary.subscribed }}</p>
      </div>
      <div>
        <p class="kicker">Getting notifications</p>
        <p class="display text-5xl">{{ data.push.people }}</p>
        <p class="text-xs text-muted">on {{ data.push.devices }} {{ data.push.devices === 1 ? 'device' : 'devices' }}</p>
      </div>
      <div>
        <p class="kicker">Accounts</p>
        <p class="display text-5xl">{{ data.summary.total }}</p>
      </div>
      <div v-if="data.summary.suppressed">
        <p class="kicker">Bouncing</p>
        <p class="display text-5xl">{{ data.summary.suppressed }}</p>
      </div>
    </div>

    <section
      v-for="queue in [
        { title: 'Email queue', counts: data.queue },
        { title: 'Notification queue', counts: data.pushQueue },
      ]"
      :key="queue.title"
      class="mt-10"
    >
      <h2 class="kicker masthead-rule pt-4">{{ queue.title }}</h2>
      <p v-if="!Object.keys(queue.counts).length" class="mt-3 text-sm text-muted">Nothing sent yet.</p>
      <div v-else class="mt-3 flex flex-wrap gap-6">
        <p v-for="(count, status) in queue.counts" :key="status" class="text-sm">
          <span class="kicker">{{ QUEUE_LABELS[status] ?? status }}</span>
          <span class="ml-2 font-head font-bold">{{ count }}</span>
        </p>
      </div>
    </section>
    <p class="mt-3 max-w-prose text-xs text-muted">
      “Logged, not sent” means sending is switched off in the server's environment (MAIL_ENABLED or
      PUSH_ENABLED), so the message was written to the log instead.
    </p>

    <table class="mt-10 w-full text-sm">
      <thead>
        <tr class="border-y border-border text-left">
          <th class="kicker py-2.5">Email</th>
          <th class="kicker w-32 py-2.5">Email alerts</th>
          <th class="kicker w-40 py-2.5">Joined</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in data.subscribers" :key="row.id" class="border-b border-border">
          <td class="py-3">{{ row.email }}</td>
          <td class="py-3">
            <span v-if="row.suppressedAt" class="kicker !text-danger">Bouncing</span>
            <span v-else-if="row.isSubscribed" class="kicker !text-text">On</span>
            <span v-else class="kicker">Off</span>
          </td>
          <td class="py-3 text-muted">{{ formatDate(row.createdAt) }}</td>
        </tr>
      </tbody>
    </table>

    <p v-if="!data.subscribers.length" class="py-10 text-sm text-muted">Nobody yet.</p>
  </template>
</template>
