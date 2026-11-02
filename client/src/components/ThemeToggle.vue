<script setup lang="ts">
import { computed } from 'vue';
import { Monitor, Moon, Sun } from 'lucide-vue-next';
import { PREFERENCE_LABEL, nextPreference, preference, theme, toggleTheme } from '../theme';

/**
 * One tap steps Light → Dark → System → Light. The icon shows where the tap
 * goes, as it always has (a moon to go dark, a monitor to follow the device);
 * the title says where the reader is now, and on System which palette their
 * device is asking for.
 */
const next = computed(() => nextPreference(preference.value));
const icon = computed(() => ({ light: Sun, dark: Moon, system: Monitor })[next.value]);
const now = computed(() =>
  preference.value === 'system' ? `System (${theme.value})` : PREFERENCE_LABEL[preference.value],
);
const action = computed(() =>
  next.value === 'system' ? 'Follow your device' : `Switch to ${next.value} mode`,
);
</script>

<template>
  <button
    type="button"
    class="inline-flex size-9 items-center justify-center border-2 border-rule bg-surface text-text hover:bg-ink hover:text-bg"
    :aria-label="`Theme: ${now}. ${action}`"
    :title="`Theme: ${now}. ${action}.`"
    @click="toggleTheme"
  >
    <component :is="icon" class="size-4" aria-hidden="true" />
  </button>
</template>
