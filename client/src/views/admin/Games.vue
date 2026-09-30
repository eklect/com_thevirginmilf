<script setup lang="ts">
import { Eye, EyeOff, Heart } from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { api, errorMessage } from '../../api/client';
import { formatHours, type AdminGame } from '../../api/types';
import StarRating from '../../components/StarRating.vue';
import { useSaveNotice } from './useSaveNotice';

/**
 * The library, with the three things she does most to a game right on the
 * row: rate it, heart it, hide it. Each is one click and one small request —
 * `PUT /admin/games/:id` with only the field that changed.
 *
 * The list is every game at once rather than paged. A Steam library is a few
 * hundred rows, the filter box narrows it as fast as it can be typed into,
 * and paging would put "the game I am looking for" on a page she has to guess.
 */
const games = ref<AdminGame[]>([]);
const loading = ref(true);
const error = ref('');
/** The ids with a request in flight, so one slow save does not freeze the table. */
const saving = ref(new Set<string>());

async function load() {
  error.value = '';
  try {
    games.value = (await api.get<{ games: AdminGame[] }>('/api/admin/games')).games;
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}

async function patch(game: AdminGame, body: Record<string, unknown>) {
  error.value = '';
  saving.value = new Set(saving.value).add(game.id);
  try {
    const { game: updated } = await api.put<{ game: AdminGame }>(`/api/admin/games/${game.id}`, body);
    games.value = games.value.map((row) => (row.id === game.id ? updated : row));
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    const next = new Set(saving.value);
    next.delete(game.id);
    saving.value = next;
  }
}

// ---------- narrowing the list ----------

const search = ref('');
type Filter = 'all' | 'visible' | 'hidden' | 'favorites' | 'unrated' | 'manual';
const filter = ref<Filter>('all');

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'visible', label: 'On the site' },
  { key: 'hidden', label: 'Hidden' },
  { key: 'favorites', label: 'Hearted' },
  { key: 'unrated', label: 'Not rated' },
  { key: 'manual', label: 'Added by hand' },
];

const matches: Record<Filter, (game: AdminGame) => boolean> = {
  all: () => true,
  visible: (game) => !game.isHidden,
  hidden: (game) => game.isHidden,
  favorites: (game) => game.isFavorite,
  unrated: (game) => game.rating === null && !game.isHidden,
  manual: (game) => game.source === 'manual',
};

const counts = computed(() =>
  Object.fromEntries(FILTERS.map(({ key }) => [key, games.value.filter(matches[key]).length])),
);

const shown = computed(() => {
  const needle = search.value.trim().toLowerCase();
  return games.value.filter(
    (game) => matches[filter.value](game) && (!needle || game.title.toLowerCase().includes(needle)),
  );
});

onMounted(load);

// Shows the confirmation the editor left behind on its way here.
const { notice } = useSaveNotice();
</script>

<template>
  <header class="flex flex-wrap items-center justify-between gap-4">
    <h1 class="display text-4xl">Games</h1>
    <div class="flex flex-wrap items-center gap-4">
      <RouterLink to="/admin/steam" class="kicker">Sync from Steam →</RouterLink>
      <RouterLink to="/admin/games/new" class="btn btn-sm">Add a game by hand</RouterLink>
    </div>
  </header>

  <p v-if="error" class="notice-error mt-5">{{ error }}</p>
  <p v-if="notice" role="status" class="notice mt-5">{{ notice }}</p>

  <div class="mt-6 flex flex-wrap items-end gap-x-6 gap-y-4">
    <div class="grow sm:max-w-xs">
      <label for="admin-game-search" class="kicker block">Find a game</label>
      <input id="admin-game-search" v-model="search" type="search" class="input mt-1.5" placeholder="Title…" />
    </div>
    <div class="flex flex-wrap gap-2" role="group" aria-label="Filter">
      <button
        v-for="option in FILTERS"
        :key="option.key"
        type="button"
        class="chip"
        :class="filter === option.key ? 'chip-red' : ''"
        :aria-pressed="filter === option.key"
        @click="filter = option.key"
      >
        {{ option.label }} <span class="opacity-70">{{ counts[option.key] }}</span>
      </button>
    </div>
  </div>

  <div class="overflow-x-auto">
    <table v-if="shown.length" class="mt-6 w-full min-w-[820px] text-sm">
      <thead>
        <tr class="border-y border-border text-left">
          <th class="kicker py-2.5">Game</th>
          <th class="kicker w-28 py-2.5">Played</th>
          <th class="kicker w-56 py-2.5">Her rating</th>
          <th class="kicker w-20 py-2.5 text-center">Heart</th>
          <th class="kicker w-24 py-2.5 text-center">On site</th>
          <th class="kicker w-24 py-2.5 text-right">Reviews</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="game in shown"
          :key="game.id"
          class="border-b border-border align-middle"
          :class="game.isHidden ? 'bg-surface-alt text-muted' : ''"
        >
          <td class="py-2.5 pr-4">
            <div class="flex items-center gap-3">
              <img
                v-if="game.coverUrl"
                :src="game.coverUrl"
                alt=""
                loading="lazy"
                class="h-9 w-[77px] shrink-0 border border-border object-cover"
              />
              <span v-else class="h-9 w-[77px] shrink-0 border border-border bg-accent" aria-hidden="true"></span>
              <span class="min-w-0">
                <RouterLink :to="`/admin/games/${game.id}`" class="font-semibold no-underline hover:underline">
                  {{ game.title }}
                </RouterLink>
                <span class="block text-xs text-muted">
                  {{ game.source === 'steam' ? 'Steam' : (game.platform ?? 'Added by hand') }}
                  <template v-if="game.source === 'steam' && !game.steamOwned"> · no longer in her library</template>
                  <template v-if="game.steamType && game.steamType !== 'game'"> · {{ game.steamType }}</template>
                </span>
              </span>
            </div>
          </td>
          <td class="py-2.5 tabular-nums">{{ game.playtimeHours !== null ? formatHours(game.playtimeHours) : '—' }}</td>
          <td class="py-2.5">
            <StarRating
              :rating="game.rating"
              editable
              :disabled="saving.has(game.id)"
              @update:rating="(value) => patch(game, { rating: value })"
            />
          </td>
          <td class="py-2.5 text-center">
            <button
              type="button"
              class="inline-flex size-8 items-center justify-center border border-border hover:border-rule"
              :disabled="saving.has(game.id)"
              :aria-pressed="game.isFavorite"
              :aria-label="game.isFavorite ? `Remove ${game.title} from her favorites` : `Add ${game.title} to her favorites`"
              :title="game.isFavorite ? 'A favorite — click to remove' : 'Add to favorites'"
              @click="patch(game, { isFavorite: !game.isFavorite })"
            >
              <Heart class="size-4" :class="game.isFavorite ? 'fill-accent text-accent' : 'text-muted'" aria-hidden="true" />
            </button>
          </td>
          <td class="py-2.5 text-center">
            <button
              type="button"
              class="inline-flex size-8 items-center justify-center border border-border hover:border-rule"
              :disabled="saving.has(game.id)"
              :aria-pressed="!game.isHidden"
              :aria-label="game.isHidden ? `Show ${game.title} on the site` : `Hide ${game.title} from the site`"
              :title="game.isHidden ? 'Hidden — click to show' : 'On the site — click to hide'"
              @click="patch(game, { isHidden: !game.isHidden })"
            >
              <EyeOff v-if="game.isHidden" class="size-4 text-muted" aria-hidden="true" />
              <Eye v-else class="size-4" aria-hidden="true" />
            </button>
          </td>
          <td class="py-2.5 text-right">
            <RouterLink :to="`/admin/games/${game.id}`" class="kicker no-underline hover:text-text">
              {{ game.reviewCount || 'Write one' }}
            </RouterLink>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <p v-if="!loading && !games.length" class="py-10 text-sm text-muted">
    No games yet. <RouterLink to="/admin/steam">Connect Steam</RouterLink> to bring in her library, or
    add one by hand.
  </p>
  <p v-else-if="!loading && !shown.length" class="py-10 text-sm text-muted">Nothing matches.</p>
</template>
