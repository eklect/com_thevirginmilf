<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useIntersectionObserver } from '@vueuse/core';
import { api, errorMessage } from '../api/client';

/**
 * The image library as something to choose from: search, a grid of
 * thumbnails that fills in as it is scrolled, and uploading by dropping files
 * anywhere on it.
 *
 * It is a panel and not a dialog so that both callers can hold it:
 * `ImageLibraryDialog` (the picker on cover and artwork fields) and the
 * Library tab of `ImageInsertDialog` (the editor), which is already a dialog.
 *
 * ## A page at a time
 *
 * `GET /api/admin/uploads?limit=50` answers the newest fifty and a cursor.
 * A sentinel under the grid asks for the next fifty when it comes into view,
 * observed against the panel's OWN scroll box: the dialog does not scroll, so
 * the viewport would never see it move. A page that still leaves the sentinel
 * on screen (a tall window, a short page) asks again, because an observer
 * only fires on a change. That second ask goes by where the sentinel actually
 * is at that moment (`sentinelNear`).
 *
 * ## Thumbnails are the images themselves
 *
 * Each item carries `url`, the object's address in the bucket, so fifty of
 * them cost the API nothing and never meet its rate limit. They are loaded
 * lazily and cached for a year.
 */
interface LibraryImage {
  id: string;
  mimeType: string;
  byteSize: number;
  originalFilename: string;
  createdAt: string;
  url?: string;
}

interface Page {
  uploads: LibraryImage[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
}

const props = defineProps<{
  /** The current choice, `''` for none. */
  selectedId: string;
  /** Mime types this slot takes, when that is fewer than the library holds. */
  accept?: string[];
}>();

const emit = defineEmits<{
  select: [image: LibraryImage];
  /** A double-click: chosen, and nothing more to ask. */
  confirm: [image: LibraryImage];
}>();

const PAGE = 50;
const ACCEPT_ALL = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const uid = Math.random().toString(36).slice(2, 9);

const items = ref<LibraryImage[]>([]);
const total = ref(0);
const cursor = ref<string | null>(null);
const hasMore = ref(false);
const loading = ref(false);
const loaded = ref(false);
const error = ref('');
const search = ref('');

const scrollEl = ref<HTMLElement | null>(null);
const sentinel = ref<HTMLElement | null>(null);
const gridEl = ref<HTMLElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

/** Bumped by every fresh search, so an answer to an older one is dropped. */
let generation = 0;
/** How far below the visible grid the next page is asked for. */
const AHEAD_PX = 300;
let searchTimer: ReturnType<typeof setTimeout> | null = null;

function listPath(next: string | null): string {
  const params = new URLSearchParams({ limit: String(PAGE) });
  const q = search.value.trim();
  if (q) params.set('q', q);
  if (props.accept?.length) params.set('type', props.accept.join(','));
  if (next) params.set('cursor', next);
  return `/api/admin/uploads?${params.toString()}`;
}

async function fetchPage(reset: boolean): Promise<void> {
  if (!reset && (loading.value || !hasMore.value)) return;
  if (reset) generation += 1;
  const mine = generation;
  loading.value = true;
  error.value = '';
  try {
    const page = await api.get<Page>(listPath(reset ? null : cursor.value));
    if (mine !== generation) return;
    // An upload that landed while this was in flight is already in the list.
    const known = new Set(reset ? [] : items.value.map((item) => item.id));
    const fresh = page.uploads.filter((item) => !known.has(item.id));
    items.value = reset ? fresh : [...items.value, ...fresh];
    cursor.value = page.nextCursor;
    hasMore.value = page.hasMore;
    total.value = page.total;
    if (reset && scrollEl.value) scrollEl.value.scrollTop = 0;
  } catch (e) {
    if (mine !== generation) return;
    // A refused search is usually the firewall disliking the text, not an outage.
    error.value = search.value.trim()
      ? 'That search could not be run. Try different words.'
      : errorMessage(e);
    hasMore.value = false;
  } finally {
    if (mine === generation) {
      loading.value = false;
      loaded.value = true;
      await nextTick();
      if (sentinelNear()) void fetchPage(false);
    }
  }
}

/**
 * Measured, not remembered: the observer's last word is from before the page
 * that just landed pushed the sentinel down, so trusting it fetches one page
 * too many.
 */
function sentinelNear(): boolean {
  if (!sentinel.value || !scrollEl.value) return false;
  const box = scrollEl.value.getBoundingClientRect();
  return sentinel.value.getBoundingClientRect().top <= box.bottom + AHEAD_PX;
}

useIntersectionObserver(
  sentinel,
  (entries) => {
    if (entries[entries.length - 1]?.isIntersecting) void fetchPage(false);
  },
  { root: scrollEl, rootMargin: `${AHEAD_PX}px` },
);

watch(search, () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void fetchPage(true), 250);
});

watch(
  () => props.accept?.join(','),
  () => void fetchPage(true),
);

onMounted(() => void fetchPage(true));
onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer);
  generation += 1;
});

// ── Uploading ────────────────────────────────────────────────────────────

interface QueueRow {
  key: number;
  name: string;
  state: 'waiting' | 'uploading' | 'failed';
  message: string;
}

const queue = ref<QueueRow[]>([]);
const dragging = ref(false);
let dragDepth = 0;
let queueKey = 0;
let draining = false;
const waiting: { row: QueueRow; file: File }[] = [];

function allowedTypes(): string[] {
  return props.accept?.length ? props.accept : ACCEPT_ALL;
}

function typeNames(): string {
  return allowedTypes()
    .map((type) => type.replace('image/', '').toUpperCase())
    .join(', ');
}

function addFiles(files: FileList | File[] | null | undefined): void {
  for (const file of Array.from(files ?? [])) {
    const row: QueueRow = { key: (queueKey += 1), name: file.name, state: 'waiting', message: '' };
    // The server decides the type from the bytes. This only catches the
    // obvious case early, so a dropped PDF does not spend an upload to be told no.
    if (file.type && !allowedTypes().includes(file.type)) {
      row.state = 'failed';
      row.message = `Not one of ${typeNames()}.`;
      queue.value.push(row);
      continue;
    }
    queue.value.push(row);
    waiting.push({ row: queue.value[queue.value.length - 1], file });
  }
  void drain();
}

/** One at a time: the uploads are small and the order they appear in stays the order dropped. */
async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    for (let next = waiting.shift(); next; next = waiting.shift()) {
      const { row, file } = next;
      row.state = 'uploading';
      const body = new FormData();
      body.append('file', file);
      try {
        const { upload } = await api.post<{ upload: LibraryImage }>('/api/admin/uploads', body);
        queue.value = queue.value.filter((item) => item.key !== row.key);
        items.value = [upload, ...items.value.filter((item) => item.id !== upload.id)];
        total.value += 1;
        emit('select', upload);
        if (scrollEl.value) scrollEl.value.scrollTop = 0;
      } catch (e) {
        row.state = 'failed';
        row.message = errorMessage(e);
      }
    }
  } finally {
    draining = false;
  }
}

function dismissRow(key: number): void {
  queue.value = queue.value.filter((item) => item.key !== key);
}

function onFileInput(event: Event): void {
  const input = event.target as HTMLInputElement;
  addFiles(input.files);
  // Cleared so choosing the same file again still fires `change`.
  input.value = '';
}

const carriesFiles = (event: DragEvent): boolean =>
  Array.from(event.dataTransfer?.types ?? []).includes('Files');

function onDragEnter(event: DragEvent): void {
  if (!carriesFiles(event)) return;
  dragDepth += 1;
  dragging.value = true;
}

function onDragLeave(event: DragEvent): void {
  if (!carriesFiles(event)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dragging.value = false;
}

function onDrop(event: DragEvent): void {
  if (!carriesFiles(event)) return;
  dragDepth = 0;
  dragging.value = false;
  addFiles(event.dataTransfer?.files);
}

// ── Choosing ─────────────────────────────────────────────────────────────

/** The one thumbnail in the tab order: the choice if it is on screen, else the first. */
function tabStop(index: number): number {
  const chosen = items.value.findIndex((item) => item.id === props.selectedId);
  return index === (chosen === -1 ? 0 : chosen) ? 0 : -1;
}

/** How many thumbnails the grid currently puts on a row. */
function columns(): number {
  if (!gridEl.value) return 1;
  return getComputedStyle(gridEl.value).gridTemplateColumns.split(' ').filter(Boolean).length || 1;
}

function onGridKey(event: KeyboardEvent, index: number): void {
  const step: Record<string, number> = {
    ArrowRight: 1,
    ArrowLeft: -1,
    ArrowDown: columns(),
    ArrowUp: -columns(),
    Home: -index,
    End: items.value.length - 1 - index,
  };
  if (!(event.key in step)) return;
  event.preventDefault();
  const target = Math.min(Math.max(index + step[event.key], 0), items.value.length - 1);
  const button = gridEl.value?.querySelectorAll<HTMLElement>('[role="option"]')[target];
  button?.focus();
}

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const thumb = (item: LibraryImage): string => item.url || `/api/uploads/${item.id}`;
</script>

<template>
  <div
    class="image-library relative grid gap-3"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <div class="flex flex-wrap items-center gap-3">
      <label :for="`library-search-${uid}`" class="sr-only">Search images by filename</label>
      <input
        :id="`library-search-${uid}`"
        v-model="search"
        type="search"
        placeholder="Search by filename"
        autocomplete="off"
        spellcheck="false"
        class="min-w-0 grow border border-border bg-surface px-3 py-2 text-sm"
        @keydown.enter.prevent
      />
      <input
        ref="fileInput"
        type="file"
        multiple
        class="sr-only"
        tabindex="-1"
        :accept="allowedTypes().join(',')"
        aria-hidden="true"
        @change="onFileInput"
      />
      <button
        type="button"
        class="shrink-0 border border-border px-3 py-2 text-sm hover:border-accent"
        @click="fileInput?.click()"
      >
        Upload images
      </button>
    </div>

    <ul v-if="queue.length" class="grid gap-1 text-xs" aria-live="polite">
      <li
        v-for="row in queue"
        :key="row.key"
        class="flex items-baseline gap-2 border border-border px-3 py-1.5"
      >
        <span class="min-w-0 grow truncate">{{ row.name }}</span>
        <span v-if="row.state === 'failed'" class="shrink-0 text-danger">{{ row.message }}</span>
        <span v-else class="shrink-0 text-muted">
          {{ row.state === 'uploading' ? 'Uploading…' : 'Waiting' }}
        </span>
        <button
          v-if="row.state === 'failed'"
          type="button"
          class="shrink-0 underline"
          :aria-label="`Dismiss ${row.name}`"
          @click="dismissRow(row.key)"
        >
          Dismiss
        </button>
      </li>
    </ul>

    <div
      ref="scrollEl"
      class="h-[45vh] min-h-48 overflow-y-auto border border-border bg-surface-alt p-2"
    >
      <p v-if="error" role="alert" class="p-4 text-sm text-danger">{{ error }}</p>

      <p v-else-if="loaded && !items.length && !loading" class="p-4 text-sm text-muted">
        <template v-if="search.trim()">No image has a filename matching “{{ search.trim() }}”.</template>
        <template v-else>No images yet. Drop some here, or use Upload images.</template>
      </p>

      <div
        v-if="items.length"
        ref="gridEl"
        role="listbox"
        aria-label="Images"
        class="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2"
      >
        <button
          v-for="(item, index) in items"
          :key="item.id"
          type="button"
          role="option"
          :aria-selected="item.id === selectedId"
          :aria-label="`${item.originalFilename}, ${sizeLabel(item.byteSize)}`"
          :title="item.originalFilename"
          :tabindex="tabStop(index)"
          :class="[
            'group relative block aspect-square overflow-hidden border-2 bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
            item.id === selectedId ? 'border-accent' : 'border-transparent hover:border-border',
          ]"
          @click="emit('select', item)"
          @dblclick="emit('confirm', item)"
          @keydown="onGridKey($event, index)"
        >
          <img
            :src="thumb(item)"
            alt=""
            loading="lazy"
            decoding="async"
            class="h-full w-full object-cover"
          />
          <span
            class="absolute inset-x-0 bottom-0 truncate bg-surface/90 px-1.5 py-0.5 text-left text-[0.6875rem] text-text"
          >
            {{ item.originalFilename }}
          </span>
        </button>
      </div>

      <div ref="sentinel" class="h-px" aria-hidden="true"></div>
      <p v-if="loading" class="p-3 text-center text-xs text-muted">Loading…</p>
    </div>

    <p class="text-xs text-muted" aria-live="polite">
      <template v-if="loaded && !error">
        Showing {{ items.length }} of {{ total }}{{ search.trim() ? ' matching' : '' }}, newest
        first.
      </template>
      Drop images anywhere here to upload them.
    </p>

    <div
      v-if="dragging"
      class="pointer-events-none absolute inset-0 grid place-items-center border-2 border-dashed border-accent bg-surface/90 text-sm font-semibold"
      aria-hidden="true"
    >
      Drop to upload
    </div>
  </div>
</template>
