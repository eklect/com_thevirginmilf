<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Button } from '@/components/ui/button';
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
import ImageLibraryPanel from './ImageLibraryPanel.vue';

/**
 * Choose an image to drop into a Markdown body.
 *
 * Two sources, one result. "Library" is `ImageLibraryPanel`, the same grid the
 * cover, logo and headshot slots open, held here directly because this is
 * already a dialog. A picture uploaded in it lands in the `uploads` table and
 * shows up on the Images page like any other. "URL" takes
 * an address somebody already has. Either way the dialog hands back a plain
 * `{ src, alt }`, and the editor decides what to do with it: a TipTap image
 * node in rich text, `![alt](src)` at the caret in raw mode.
 *
 * ## The library's `src` is the extension-free `/api/uploads/<id>`
 *
 * The same URL `imageSrc()` in `api/types.ts` builds for a cover. nginx's
 * static block claims any `*.png` path before the `/api/` proxy sees it, so
 * the id alone is the address — see `server/src/uploads/uploads.controller.ts`.
 * Nothing here appends an extension, and nothing should.
 *
 * ## No `data:` URLs
 *
 * A pasted screenshot arrives as a `data:` URI several megabytes long, and the
 * column is `longtext`, so it would save without complaint and then ride along
 * with every read of the post. The editor's Image node refuses them
 * (`allowBase64: false`) and this field does too, so the only way a picture
 * reaches a post is as a file in storage or a link to one somewhere else.
 */
const props = defineProps<{ open: boolean }>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  insert: [image: { src: string; alt: string }];
}>();

type Source = 'library' | 'url';

const source = ref<Source>('library');
const uploadId = ref('');
const url = ref('');
const alt = ref('');

/** `http(s)://` or site-relative — anything else is not an image address. */
const urlOk = computed(() => /^(https?:\/\/|\/)[^\s]+$/i.test(url.value.trim()));

const src = computed(() => {
  if (source.value === 'library') return uploadId.value ? `/api/uploads/${uploadId.value}` : '';
  return urlOk.value ? url.value.trim() : '';
});

const canInsert = computed(() => src.value !== '');

function close(): void {
  emit('update:open', false);
}

function insert(): void {
  if (!canInsert.value) return;
  emit('insert', { src: src.value, alt: alt.value.trim() });
  close();
}

// Every opening starts blank. Resetting on close rather than on open keeps the
// preview from flashing stale content during the close animation.
watch(
  () => props.open,
  (open) => {
    if (open) return;
    source.value = 'library';
    uploadId.value = '';
    url.value = '';
    alt.value = '';
  },
);

const seg = (on: boolean): string =>
  [
    'border px-3 py-1.5 font-head text-xs',
    on ? 'border-accent bg-accent text-accent-text' : 'border-border text-muted hover:text-text',
  ].join(' ');
</script>

<template>
  <Dialog :open="open" @update:open="(value) => !value && close()">
    <DialogContent class="sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>Insert an image</DialogTitle>
        <DialogDescription>
          Pick one from the library, drop new ones in to upload them, or paste the address of
          an image hosted elsewhere.
        </DialogDescription>
      </DialogHeader>

      <div class="grid gap-4">
        <div class="flex gap-1" role="tablist" aria-label="Image source">
          <button
            type="button"
            role="tab"
            :aria-selected="source === 'library'"
            :class="seg(source === 'library')"
            @click="source = 'library'"
          >
            Library
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="source === 'url'"
            :class="seg(source === 'url')"
            @click="source = 'url'"
          >
            URL
          </button>
        </div>

        <ImageLibraryPanel
          v-if="source === 'library'"
          :selected-id="uploadId"
          @select="(image) => (uploadId = image.id)"
          @confirm="
            (image) => {
              uploadId = image.id;
              insert();
            }
          "
        />

        <div v-else class="grid gap-2">
          <Label for="image-url">Image address</Label>
          <Input
            id="image-url"
            v-model="url"
            type="url"
            placeholder="https://example.com/picture.jpg"
            autocomplete="off"
            spellcheck="false"
          />
          <p v-if="url && !urlOk" class="text-xs text-danger">
            Enter a full <code>https://</code> address or a path starting with <code>/</code>.
          </p>
          <img
            v-if="src"
            :src="src"
            alt=""
            class="max-h-48 w-full border border-border object-contain"
          />
        </div>

        <div class="grid gap-2">
          <Label for="image-alt">Alt text</Label>
          <Input
            id="image-alt"
            v-model="alt"
            placeholder="What the picture shows, for readers who cannot see it"
            @keydown.enter.prevent="insert"
          />
          <p class="text-xs text-muted">
            Read aloud by screen readers and shown if the image fails to load. Leave it blank
            only for a purely decorative image.
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="close">Cancel</Button>
        <Button variant="default" :disabled="!canInsert" @click="insert">Insert</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
