<script setup lang="ts">
import { ref, watch } from 'vue';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import ImageLibraryPanel from './ImageLibraryPanel.vue';

/**
 * Choose one image from the library, in a dialog.
 *
 * What `ImagePicker` opens. The panel does the work; this adds the frame and
 * the Choose button, so a click only marks a thumbnail and nothing changes on
 * the form until the choice is confirmed (or double-clicked).
 */
interface ChosenImage {
  id: string;
  mimeType: string;
  byteSize: number;
  originalFilename: string;
  createdAt: string;
  url?: string;
}

const props = defineProps<{
  open: boolean;
  /** The form's current choice, marked when the dialog opens. */
  selectedId: string;
  accept?: string[];
  /** What the image is for, in the title: "Cover image". */
  label?: string;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  choose: [image: ChosenImage];
}>();

const picked = ref<ChosenImage | null>(null);
const pickedId = ref('');

watch(
  () => props.open,
  (open) => {
    picked.value = null;
    pickedId.value = open ? props.selectedId : '';
  },
);

function mark(image: ChosenImage): void {
  picked.value = image;
  pickedId.value = image.id;
}

function choose(image: ChosenImage | null = picked.value): void {
  if (!image) return;
  emit('choose', image);
  emit('update:open', false);
}
</script>

<template>
  <Dialog :open="open" @update:open="(value) => emit('update:open', value)">
    <DialogContent class="sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>{{ label ? `Choose: ${label}` : 'Choose an image' }}</DialogTitle>
        <DialogDescription>
          Search the library, scroll for older images, or drop new ones in to upload them.
        </DialogDescription>
      </DialogHeader>

      <ImageLibraryPanel
        v-if="open"
        :selected-id="pickedId"
        :accept="accept"
        @select="mark"
        @confirm="choose"
      />

      <DialogFooter>
        <Button variant="outline" @click="emit('update:open', false)">Cancel</Button>
        <Button variant="default" :disabled="!picked" @click="choose()">Choose</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
