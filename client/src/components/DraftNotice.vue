<script setup lang="ts">
import { computed } from 'vue';
import type { DraftHandle } from '../composables/useDraft';
import { draftAge } from '../lib/drafts';

/**
 * Says that unsaved writing was found in this browser, and what happened to it.
 *
 * Renders nothing when there is no draft. Two states, from `useDraft`:
 * restored (the text is already back in the form; Discard takes it out) and
 * stale (the record changed since, so the draft is offered and not applied).
 */
const props = defineProps<{ draft: DraftHandle }>();

const age = computed(() => (props.draft.notice ? draftAge(props.draft.notice.at) : ''));
</script>

<template>
  <div
    v-if="draft.notice"
    role="status"
    class="draft-notice flex flex-wrap items-center gap-x-4 gap-y-2 border border-border bg-surface-alt px-4 py-3 text-sm"
  >
    <p v-if="draft.notice.stale" class="min-w-0 grow">
      You have an unsaved draft from {{ age }}, written before this was last saved.
    </p>
    <p v-else class="min-w-0 grow">Restored your unsaved draft from {{ age }}.</p>

    <div class="flex shrink-0 gap-4">
      <button
        v-if="draft.notice.stale"
        type="button"
        class="font-semibold underline underline-offset-2"
        @click="draft.apply()"
      >
        Use draft
      </button>
      <button
        v-else
        type="button"
        class="font-semibold underline underline-offset-2"
        @click="draft.dismiss()"
      >
        Keep
      </button>
      <button type="button" class="underline underline-offset-2" @click="draft.discard()">
        Discard
      </button>
    </div>
  </div>
</template>
