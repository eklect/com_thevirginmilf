<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { api, ApiError, errorMessage } from '../api/client';
import type { Category, GameCard } from '../api/types';
import GameTile from '../components/GameTile.vue';
import { useSiteStore } from '../stores/site';

/**
 * The library, and — at `/games/category/:category` — one collection of it.
 *
 * Both are this view. The category chips come from the full list's response,
 * so they are fetched once and kept; choosing one swaps the games for that
 * collection's and leaves the chips where they are.
 */
const route = useRoute();
const site = useSiteStore();

const games = ref<GameCard[]>([]);
const categories = ref<Category[]>([]);
const current = ref<{ slug: string; name: string; description: string | null } | null>(null);
const loading = ref(true);
const error = ref('');
const notFound = ref(false);

const categorySlug = computed(() => (route.params.category as string | undefined) ?? null);

async function loadCategories(): Promise<GameCard[]> {
  const data = await api.get<{ games: GameCard[]; categories: Category[] }>('/api/site/games');
  categories.value = data.categories;
  return data.games;
}

watch(
  categorySlug,
  async (slug) => {
    loading.value = true;
    error.value = '';
    notFound.value = false;
    try {
      if (slug) {
        const [data] = await Promise.all([
          api.get<{ category: NonNullable<typeof current.value>; games: GameCard[] }>(
            `/api/site/categories/${encodeURIComponent(slug)}`,
          ),
          categories.value.length ? Promise.resolve() : loadCategories(),
        ]);
        current.value = data.category;
        games.value = data.games;
      } else {
        current.value = null;
        games.value = await loadCategories();
      }
    } catch (e) {
      games.value = [];
      if (e instanceof ApiError && e.status === 404) notFound.value = true;
      else error.value = errorMessage(e);
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

// ---------- finding one ----------

const search = ref('');
type Sort = 'title' | 'rating' | 'playtime';
const sort = ref<Sort>('title');

const shown = computed(() => {
  const needle = search.value.trim().toLowerCase();
  const list = needle
    ? games.value.filter((game) => game.title.toLowerCase().includes(needle))
    : [...games.value];
  // The server's order is by title; the other two sorts keep it as the tie-break.
  if (sort.value === 'rating') list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  if (sort.value === 'playtime') list.sort((a, b) => (b.playtimeHours ?? 0) - (a.playtimeHours ?? 0));
  return list;
});
</script>

<template>
  <section class="band">
    <div class="band-inner">
      <p class="kicker">
        <RouterLink v-if="current" to="/games" class="no-underline hover:underline">Games</RouterLink>
        <template v-else>The library</template>
      </p>
      <h1 class="display mt-2 text-6xl sm:text-7xl">{{ current ? current.name : 'Games' }}</h1>
      <p v-if="current?.description || (!current && site.settings.games_intro)" class="mt-4 max-w-[60ch] text-lg text-muted">
        {{ current ? current.description : site.settings.games_intro }}
      </p>

      <nav v-if="categories.length" class="mt-7 flex flex-wrap gap-2" aria-label="Collections">
        <RouterLink to="/games" class="chip" :class="!categorySlug ? 'chip-red' : ''">All</RouterLink>
        <RouterLink
          v-for="category in categories"
          :key="category.slug"
          :to="`/games/category/${category.slug}`"
          class="chip"
          :class="categorySlug === category.slug ? 'chip-red' : ''"
        >
          {{ category.name }}
          <span class="opacity-70">{{ category.gameCount }}</span>
        </RouterLink>
      </nav>

      <div class="mt-6 flex flex-wrap items-end gap-4">
        <div class="grow sm:max-w-xs">
          <label for="game-search" class="kicker block">Find a game</label>
          <input id="game-search" v-model="search" type="search" class="field mt-1.5" placeholder="Title…" />
        </div>
        <div>
          <label for="game-sort" class="kicker block">Sort by</label>
          <select id="game-sort" v-model="sort" class="field mt-1.5">
            <option value="title">Title</option>
            <option value="rating">Her rating</option>
            <option value="playtime">Hours played</option>
          </select>
        </div>
      </div>

      <p v-if="error" class="notice-error mt-7">{{ error }}</p>

      <div v-if="notFound" class="panel mt-9 p-8 text-center">
        <p class="display text-3xl">There is no collection by that name</p>
        <RouterLink to="/games" class="btn mt-6">Back to every game</RouterLink>
      </div>

      <div v-else-if="shown.length" class="mt-9 grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
        <GameTile v-for="game in shown" :key="game.id" :game="game" />
      </div>

      <div v-else-if="!loading && !error" class="panel mt-9 p-8 text-center">
        <p class="display text-3xl">
          {{ search ? 'Nothing matches that' : 'Nothing here yet' }}
        </p>
        <p class="mx-auto mt-3 max-w-[44ch] text-muted">
          {{ search ? 'Try fewer letters.' : 'The library fills in once her games are added.' }}
        </p>
      </div>
    </div>
  </section>
</template>
