<script setup lang="ts">
import { Moon, Sun } from 'lucide-vue-next';
import { theme, toggleTheme } from '../theme';
</script>

<template>
  <button
    type="button"
    class="inline-flex size-9 items-center justify-center border-2 border-rule bg-surface text-text hover:bg-ink hover:text-bg"
    :aria-label="theme === 'dark' ? 'Switch to light' : 'Switch to dark'"
    :title="theme === 'dark' ? 'Switch to light' : 'Switch to dark'"
    @click="toggleTheme"
  >
    <Sun v-if="theme === 'dark'" class="size-4" aria-hidden="true" />
    <Moon v-else class="size-4" aria-hidden="true" />
  </button>
</template>
