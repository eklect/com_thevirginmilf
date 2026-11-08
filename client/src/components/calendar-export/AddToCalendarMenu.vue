<script setup lang="ts">
import { CalendarPlus, Download, ExternalLink } from '@lucide/vue';
import { ref, watch } from 'vue';
import { api, download, errorMessage, query } from '@/api/client';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LEVEL_INFO, rememberedLevel, rememberLevel, sortLevels, type AddLinks, type DetailLevel } from './levels';

/**
 * "Add to calendar" for one item: Google Calendar, Outlook, or a file.
 *
 * `exportPath` is the item's API path; the server answers `<path>/export`
 * with the add links and `<path>/ics` with the file, both built at the
 * level picked here and cut to the cap. The links are fetched when the menu
 * opens, so each entry is a real link and no pop-up blocker gets in the way.
 */
const props = withDefaults(
  defineProps<{
    exportPath: string;
    levels: DetailLevel[];
    storageKey?: string;
    size?: 'default' | 'sm';
    /** A small calendar icon instead of the labelled button, for tight rows. `label` names it for screen readers. */
    iconOnly?: boolean;
    label?: string;
  }>(),
  { storageKey: 'calendar-export-level', size: 'sm', iconOnly: false, label: 'Add to calendar' },
);

const open = ref(false);
const level = ref<DetailLevel>(rememberedLevel(props.storageKey, props.levels));
const links = ref<AddLinks | null>(null);
const loading = ref(false);
const error = ref('');

watch(
  () => props.levels,
  (levels) => {
    if (!levels.includes(level.value)) level.value = rememberedLevel(props.storageKey, levels);
  },
);

watch([open, level, () => props.exportPath], async ([isOpen]) => {
  if (!isOpen) return;
  rememberLevel(props.storageKey, level.value);
  loading.value = true;
  links.value = null;
  error.value = '';
  try {
    links.value = await api.get<AddLinks>(`${props.exportPath}/export${query({ level: level.value })}`);
  } catch (caught) {
    error.value = errorMessage(caught);
  } finally {
    loading.value = false;
  }
});

async function saveFile(event: Event): Promise<void> {
  event.preventDefault();
  error.value = '';
  try {
    await download(`${props.exportPath}/ics${query({ level: level.value })}`, 'event.ics');
    open.value = false;
  } catch (caught) {
    error.value = errorMessage(caught);
  }
}
</script>

<template>
  <DropdownMenu v-model:open="open">
    <DropdownMenuTrigger as-child>
      <Button v-if="iconOnly" type="button" variant="ghost" size="icon" class="size-7" :aria-label="label" :title="label">
        <CalendarPlus class="size-4" />
      </Button>
      <Button v-else type="button" variant="outline" :size="size"><CalendarPlus class="size-4" /> Add to calendar</Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="w-72">
      <template v-if="levels.length > 1">
        <DropdownMenuLabel>What to share</DropdownMenuLabel>
        <DropdownMenuRadioGroup v-model="level">
          <DropdownMenuRadioItem v-for="l in sortLevels(levels)" :key="l" :value="l" @select.prevent>
            <span class="flex flex-col">
              <span>{{ LEVEL_INFO[l].label }}</span>
              <span class="text-xs text-muted">{{ LEVEL_INFO[l].description }}</span>
            </span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
      </template>
      <DropdownMenuLabel v-else class="font-normal text-xs text-muted">
        Sharing: {{ LEVEL_INFO[level].label }}. {{ LEVEL_INFO[level].description }}
      </DropdownMenuLabel>
      <DropdownMenuItem as-child :disabled="!links">
        <a :href="links?.google" target="_blank" rel="noopener noreferrer"><ExternalLink class="size-4" /> Google Calendar</a>
      </DropdownMenuItem>
      <DropdownMenuItem as-child :disabled="!links">
        <a :href="links?.outlook" target="_blank" rel="noopener noreferrer"><ExternalLink class="size-4" /> Outlook.com</a>
      </DropdownMenuItem>
      <DropdownMenuItem as-child :disabled="!links">
        <a :href="links?.office365" target="_blank" rel="noopener noreferrer"><ExternalLink class="size-4" /> Outlook (work or school)</a>
      </DropdownMenuItem>
      <DropdownMenuItem @select="saveFile"><Download class="size-4" /> Download .ics file</DropdownMenuItem>
      <p v-if="loading" class="px-2 pb-1 text-xs text-muted">Preparing links…</p>
      <p v-if="error" class="px-2 pb-1 text-xs text-danger" role="alert">{{ error }}</p>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
