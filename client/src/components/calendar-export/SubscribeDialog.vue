<script setup lang="ts">
import { Check, Copy, ExternalLink, RefreshCw, Trash2 } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { api, errorMessage } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { LEVEL_INFO, sortLevels, type DetailLevel, type SubscribeLinks } from './levels';

/**
 * A private subscription feed: an address Google Calendar, Outlook or Apple
 * Calendar re-reads every few hours, so changes and cancellations follow.
 *
 * `basePath` answers `GET/POST/DELETE <basePath>/subscription` and — for an
 * administrator — `PATCH <basePath>/settings { cap }`. The address is shown
 * once, when it is made; only a fingerprint of it is kept.
 */
const props = defineProps<{
  basePath: string;
  /** Where the dates come from, when there is a choice. */
  sources?: Array<{ key: string; label: string }>;
  isAdmin: boolean;
  /** "this account", "your family" — what the cap applies to. */
  capScope: string;
}>();
const open = defineModel<boolean>('open', { required: true });
const emit = defineEmits<{ capChanged: [levels: DetailLevel[]] }>();

interface FeedState {
  feed: { name: string; level: DetailLevel; sources: string[] | null; createdAt: string; lastFetchedAt: string | null } | null;
  cap: DetailLevel;
  levels: DetailLevel[];
}

const state = ref<FeedState | null>(null);
const level = ref<DetailLevel>('busy');
const name = ref('');
const chosen = ref<Set<string>>(new Set());
const links = ref<SubscribeLinks | null>(null);
const busy = ref(false);
const copied = ref(false);
const error = ref('');
const notice = ref('');

watch(open, async (isOpen) => {
  error.value = '';
  notice.value = '';
  if (!isOpen) {
    links.value = null;
    return;
  }
  try {
    state.value = await api.get<FeedState>(`${props.basePath}/subscription`);
    const feed = state.value.feed;
    level.value = feed && state.value.levels.includes(feed.level) ? feed.level : state.value.levels[state.value.levels.length - 1];
    name.value = feed?.name ?? '';
    chosen.value = new Set(feed?.sources ?? props.sources?.map((s) => s.key) ?? []);
  } catch (caught) {
    error.value = errorMessage(caught);
  }
});

const levels = computed(() => sortLevels(state.value?.levels ?? ['busy']));
/** What the existing feed actually sends: its own choice, cut to today's cap. */
const sharing = computed<DetailLevel | null>(() => {
  const feed = state.value?.feed;
  if (!feed) return null;
  return levels.value.includes(feed.level) ? feed.level : levels.value[levels.value.length - 1];
});
const allLevels: DetailLevel[] = ['busy', 'basic', 'full'];

function toggleSource(key: string, on: boolean): void {
  const next = new Set(chosen.value);
  if (on) next.add(key);
  else next.delete(key);
  chosen.value = next;
}

async function create(): Promise<void> {
  if (props.sources && chosen.value.size === 0) {
    error.value = 'Choose at least one calendar to include.';
    return;
  }
  busy.value = true;
  error.value = '';
  try {
    const everything = !props.sources || chosen.value.size === props.sources.length;
    const answer = await api.post<FeedState & { links: SubscribeLinks }>(`${props.basePath}/subscription`, {
      name: name.value.trim() || null,
      level: level.value,
      sources: everything ? null : [...chosen.value],
    });
    links.value = answer.links;
    state.value = answer;
  } catch (caught) {
    error.value = errorMessage(caught);
  } finally {
    busy.value = false;
  }
}

async function revoke(): Promise<void> {
  busy.value = true;
  try {
    await api.delete(`${props.basePath}/subscription`);
    links.value = null;
    if (state.value) state.value = { ...state.value, feed: null };
    notice.value = 'Subscription stopped. That address no longer works.';
  } catch (caught) {
    error.value = errorMessage(caught);
  } finally {
    busy.value = false;
  }
}

async function setCap(cap: DetailLevel): Promise<void> {
  try {
    const answer = await api.patch<{ cap: DetailLevel; levels: DetailLevel[] }>(`${props.basePath}/settings`, { cap });
    if (state.value) state.value = { ...state.value, ...answer };
    if (!answer.levels.includes(level.value)) level.value = answer.levels[answer.levels.length - 1];
    emit('capChanged', answer.levels);
  } catch (caught) {
    error.value = errorMessage(caught);
  }
}

async function copy(): Promise<void> {
  if (!links.value) return;
  try {
    await navigator.clipboard.writeText(links.value.url);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } catch {
    error.value = 'Copy did not work. Select the address and copy it yourself.';
  }
}

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'not yet';
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Subscribe in another calendar</DialogTitle>
        <DialogDescription>
          Google Calendar, Outlook or Apple Calendar can keep a copy of this calendar up to date. It refreshes on their schedule,
          usually every few hours.
        </DialogDescription>
      </DialogHeader>

      <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>
      <p v-if="notice" class="text-sm text-muted" role="status">{{ notice }}</p>

      <div v-if="links" class="space-y-4">
        <p class="text-sm">
          Your private address is ready. <strong>It is shown only now</strong>; anyone who has it can read this calendar at the
          level you chose, so keep it to yourself.
        </p>
        <div class="flex gap-2">
          <Input :model-value="links.url" readonly class="font-mono text-xs" @focus="($event.target as HTMLInputElement).select()" />
          <Button type="button" variant="outline" size="icon" :aria-label="copied ? 'Copied' : 'Copy address'" @click="copy">
            <Check v-if="copied" class="size-4" /><Copy v-else class="size-4" />
          </Button>
        </div>
        <div class="grid gap-2 sm:grid-cols-2">
          <Button as="a" :href="links.google" target="_blank" rel="noopener noreferrer" variant="outline"><ExternalLink class="size-4" /> Google Calendar</Button>
          <Button as="a" :href="links.outlook" target="_blank" rel="noopener noreferrer" variant="outline"><ExternalLink class="size-4" /> Outlook.com</Button>
          <Button as="a" :href="links.office365" target="_blank" rel="noopener noreferrer" variant="outline"><ExternalLink class="size-4" /> Outlook (work or school)</Button>
          <Button as="a" :href="links.webcal" variant="outline"><ExternalLink class="size-4" /> Apple Calendar</Button>
        </div>
      </div>

      <form v-else-if="state" class="space-y-5" @submit.prevent="create">
        <p v-if="state.feed" class="rounded-md border border-border bg-surface-alt p-3 text-sm">
          You have a subscription, <strong>{{ state.feed.name }}</strong>, sharing {{ LEVEL_INFO[sharing ?? state.feed.level].label.toLowerCase() }}.
          Last read {{ when(state.feed.lastFetchedAt) }}. Making a new address stops the old one working.
        </p>

        <fieldset>
          <legend class="text-sm font-medium text-ink">What to share</legend>
          <RadioGroup v-model="level" class="mt-2 space-y-2">
            <label v-for="l in levels" :key="l" class="flex items-start gap-2 text-sm">
              <RadioGroupItem :value="l" class="mt-0.5" />
              <span><span class="font-medium">{{ LEVEL_INFO[l].label }}</span> <span class="block text-xs text-muted">{{ LEVEL_INFO[l].description }}</span></span>
            </label>
          </RadioGroup>
          <p v-if="levels.length < 3" class="mt-2 text-xs text-muted">An administrator limits how much can be shared from {{ capScope }}.</p>
        </fieldset>

        <fieldset v-if="sources?.length">
          <legend class="text-sm font-medium text-ink">Include</legend>
          <div class="mt-2 grid gap-1.5 sm:grid-cols-2">
            <label v-for="source in sources" :key="source.key" class="flex items-center gap-2 text-sm">
              <Checkbox :model-value="chosen.has(source.key)" @update:model-value="(v) => toggleSource(source.key, v === true)" />
              {{ source.label }}
            </label>
          </div>
        </fieldset>

        <div>
          <Label for="feedName">Name in your calendar <span class="font-normal text-muted">(optional)</span></Label>
          <Input id="feedName" v-model="name" maxlength="80" class="mt-1.5" />
        </div>

        <div v-if="isAdmin" class="rounded-md border border-border p-3">
          <p class="text-sm font-medium text-ink">Most detail that may leave {{ capScope }}</p>
          <p class="text-xs text-muted">Applies to everyone, to every download and to subscriptions that already exist.</p>
          <RadioGroup :model-value="state.cap" class="mt-2 flex flex-wrap gap-x-4 gap-y-2" @update:model-value="(v) => setCap(v as DetailLevel)">
            <label v-for="l in allLevels" :key="l" class="flex items-center gap-2 text-sm"><RadioGroupItem :value="l" /> {{ LEVEL_INFO[l].label }}</label>
          </RadioGroup>
        </div>

        <DialogFooter class="gap-2 sm:justify-between">
          <Button v-if="state.feed" type="button" variant="ghost" class="text-danger" :disabled="busy" @click="revoke"><Trash2 class="size-4" /> Stop subscription</Button>
          <Button type="submit" :disabled="busy"><RefreshCw v-if="state.feed" class="size-4" />{{ state.feed ? 'Make a new address' : 'Make my address' }}</Button>
        </DialogFooter>
      </form>
      <p v-else class="py-8 text-center text-sm text-muted">Loading…</p>
    </DialogContent>
  </Dialog>
</template>
