<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, errorMessage } from '../../api/client';
import { NON_NESTABLE_PAGE_KEYS, type PageKey, type PageSetting } from '../../api/types';
import { useSiteStore } from '../../stores/site';

const site = useSiteStore();
const pages = ref<PageSetting[]>([]);
const busy = ref(false);
const error = ref('');

onMounted(async () => {
  try {
    pages.value = (await api.get<{ pages: PageSetting[] }>('/api/admin/pages')).pages;
  } catch (e) {
    error.value = errorMessage(e);
  }
});

const nestable = (key: PageKey) => !NON_NESTABLE_PAGE_KEYS.includes(key);

/** The pages a given page could be moved under — mirrors the server's rules. */
function parentOptions(page: PageSetting): PageSetting[] {
  if (!nestable(page.key)) return [];
  const hasChildren = pages.value.some((p) => p.parentKey === page.key);
  if (hasChildren) return [];
  return pages.value.filter(
    (p) => p.key !== page.key && nestable(p.key) && !p.parentKey,
  );
}

/**
 * The table is drawn as the nav is drawn: each top-level page, then its sub
 * pages under it. Ordering is per group, so the arrows move a page among its
 * siblings rather than through a single flat list that no longer exists.
 */
const rows = computed(() => {
  const all = [...pages.value].sort((a, b) => a.sortOrder - b.sortOrder);
  const byKey = new Map(all.map((p) => [p.key, p]));
  const out: { page: PageSetting; depth: 0 | 1; siblings: PageSetting[] }[] = [];

  const tops = all.filter((p) => !p.parentKey || !byKey.has(p.parentKey));
  for (const page of tops) {
    out.push({ page, depth: 0, siblings: tops });
    const children = all.filter((p) => p.parentKey === page.key);
    for (const child of children) out.push({ page: child, depth: 1, siblings: children });
  }
  return out;
});

async function put(key: string, patch: Partial<PageSetting>) {
  error.value = '';
  busy.value = true;
  try {
    pages.value = (await api.put<{ pages: PageSetting[] }>(`/api/admin/pages/${key}`, patch)).pages;
    await site.reload();
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}

/** The select hands back a raw string; `''` is the "top level" option. */
function setParent(key: string, value: string) {
  void put(key, { parentKey: (value || null) as PageKey | null });
}

/** Swaps a page with its neighbour INSIDE its own group. */
async function move(page: PageSetting, siblings: PageSetting[], direction: -1 | 1) {
  const index = siblings.findIndex((p) => p.key === page.key);
  const other = siblings[index + direction];
  if (!other) return;
  // Two writes, the second only if the first held.
  await put(page.key, { sortOrder: other.sortOrder });
  if (!error.value) await put(other.key, { sortOrder: page.sortOrder });
}
</script>

<template>
  <h1 class="display text-3xl">Pages</h1>
  <p class="mt-3 max-w-prose text-sm text-muted">
    A page that is switched off vanishes from the navigation and answers “not found” to
    everyone but you. The home page cannot be switched off — and switching off
    <strong>Sign up</strong> closes new accounts entirely.
  </p>
  <p class="mt-3 max-w-prose text-sm text-muted">
    Give a page a <strong>parent</strong> and it becomes a sub page: the parent turns into
    a drop-down in the navigation, still going to its own page when clicked. Nesting is one
    level deep, so a page with sub pages of its own cannot also become one. A sub page
    keeps its own address either way — this only changes the navigation. If you switch a
    parent off, its sub pages come back to the top level rather than disappearing with it.
  </p>

  <p v-if="error" class="mt-5 border border-danger px-4 py-3 text-sm text-danger">{{ error }}</p>

  <table class="mt-7 w-full max-w-4xl text-sm">
    <thead>
      <tr class="border-y border-border text-left">
        <th class="kicker py-2.5">Page</th>
        <th class="kicker w-48 py-2.5">Nav label</th>
        <th class="kicker w-44 py-2.5">Parent</th>
        <th class="kicker w-24 py-2.5">Shown</th>
        <th class="kicker w-24 py-2.5">Order</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="row in rows" :key="row.page.key" class="border-b border-border">
        <td class="py-3 capitalize" :class="{ 'pl-6 text-muted': row.depth === 1 }">
          <span v-if="row.depth === 1" aria-hidden="true" class="mr-1.5">↳</span>{{ row.page.key }}
        </td>
        <td class="py-3">
          <input
            :value="row.page.navLabel"
            class="w-full border border-border bg-surface px-2 py-1 text-sm"
            @change="put(row.page.key, { navLabel: ($event.target as HTMLInputElement).value.trim() })"
          />
        </td>
        <td class="py-3 pr-6">
          <!--
            Empty for a page that cannot be nested, and for one that is already
            a parent — the server refuses both, and a select that offers a
            choice the API will reject is worse than no select.
          -->
          <select
            v-if="parentOptions(row.page).length"
            :value="row.page.parentKey ?? ''"
            :disabled="busy"
            class="w-full border border-border bg-surface px-2 py-1 text-sm capitalize"
            @change="setParent(row.page.key, ($event.target as HTMLSelectElement).value)"
          >
            <option value="">— Top level —</option>
            <option v-for="option in parentOptions(row.page)" :key="option.key" :value="option.key">
              {{ option.navLabel }}
            </option>
          </select>
          <span v-else class="text-xs text-muted">
            {{
              !nestable(row.page.key)
                ? 'Not in the main nav'
                : 'Has sub pages'
            }}
          </span>
        </td>
        <td class="py-3">
          <button
            type="button"
            class="kicker hover:text-text"
            :disabled="row.page.key === 'home' || busy"
            @click="put(row.page.key, { enabled: !row.page.enabled })"
          >
            {{ row.page.enabled ? 'Shown' : 'Hidden' }}
          </button>
        </td>
        <td class="py-3">
          <button
            type="button"
            class="kicker px-1 hover:text-text"
            :disabled="busy || row.siblings[0]?.key === row.page.key"
            @click="move(row.page, row.siblings, -1)"
          >
            ↑
          </button>
          <button
            type="button"
            class="kicker px-1 hover:text-text"
            :disabled="busy || row.siblings[row.siblings.length - 1]?.key === row.page.key"
            @click="move(row.page, row.siblings, 1)"
          >
            ↓
          </button>
        </td>
      </tr>
    </tbody>
  </table>
</template>
