<script setup lang="ts">
import { brandIcon } from './brand-icons';
import type { ProviderInfo } from '../api/social';

/**
 * One button per upstream provider MAP offers — Google, Apple, Microsoft and
 * the rest — in this site's own outlined button, with the provider's
 * monochrome mark. The list comes from `GET /api/auth/providers`, so a provider
 * MAP has no credentials for is simply not drawn.
 *
 * Clicking is a full-page navigation to this site's own `/api/auth/login` (or
 * the URL `POST /api/register/social` answered with), which sends the browser
 * on to MAP. No provider is ever contacted from here.
 */
const props = defineProps<{
  providers: ReadonlyArray<ProviderInfo>;
  disabled?: boolean;
  /** "Continue" on sign-in, "Sign up" on the signup form. */
  verb?: string;
}>();

const emit = defineEmits<{ pick: [key: ProviderInfo['key']] }>();

function pick(key: ProviderInfo['key']) {
  if (props.disabled) return;
  emit('pick', key);
}
</script>

<template>
  <div v-if="providers.length" class="grid gap-3 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
    <button
      v-for="provider in providers"
      :key="provider.key"
      type="button"
      class="inline-flex items-center justify-start gap-3 btn-outline w-full disabled:cursor-not-allowed disabled:opacity-50"
      :disabled="disabled"
      @click="pick(provider.key)"
    >
      <component :is="brandIcon(provider.key)" class="size-4 flex-none" />
      <span class="truncate">{{ verb ?? 'Continue' }} with {{ provider.label }}</span>
    </button>
  </div>
</template>
