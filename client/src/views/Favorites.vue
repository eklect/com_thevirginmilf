<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, errorMessage } from '../api/client';
import type { GameCard } from '../api/types';
import GameTile from '../components/GameTile.vue';
import { useSiteStore } from '../stores/site';

/**
 * Two lists that are one answer to "what does she love?": the games she
 * hearted herself, and the ones her Steam hours give away. The server decides
 * both — see `GamesService.favorites`.
 */
const site = useSiteStore();

const hearted = ref<GameCard[]>([]);
const mostPlayed = ref<GameCard[]>([]);
const loading = ref(true);
const error = ref('');

onMounted(async () => {
  try {
    const data = await api.get<{ hearted: GameCard[]; mostPlayed: GameCard[] }>('/api/site/favorites');
    hearted.value = data.hearted;
    mostPlayed.value = data.mostPlayed;
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <section class="band band-brand">
    <div class="band-inner !py-12">
      <p class="font-head text-xs font-extrabold uppercase tracking-[0.2em] text-white/80">The shortlist</p>
      <h1 class="display mt-2 text-6xl sm:text-8xl">Favorites</h1>
      <p v-if="site.settings.favorites_intro" class="mt-4 max-w-[56ch] text-lg text-white/90">
        {{ site.settings.favorites_intro }}
      </p>
    </div>
  </section>
  <div class="stripes" aria-hidden="true"></div>

  <section class="band">
    <div class="band-inner">
      <p v-if="error" class="notice-error">{{ error }}</p>

      <template v-if="hearted.length">
        <div class="section-head">
          <h2 class="section-title">Her picks</h2>
          <p class="kicker">The ones she put a heart on</p>
        </div>
        <div class="mt-8 grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
          <GameTile v-for="game in hearted" :key="game.id" :game="game" />
        </div>
      </template>

      <template v-if="mostPlayed.length">
        <div class="section-head" :class="hearted.length ? 'mt-16' : ''">
          <h2 class="section-title">Can't put down</h2>
          <p class="kicker">By hours played on Steam</p>
        </div>
        <ol class="mt-8 grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
          <li v-for="(game, index) in mostPlayed" :key="game.id" class="relative">
            <span
              class="display absolute -left-2 -top-3 z-10 flex size-10 items-center justify-center border-2 border-rule bg-ink text-xl text-bg"
              aria-hidden="true"
            >
              {{ index + 1 }}
            </span>
            <GameTile :game="game" />
          </li>
        </ol>
      </template>

      <div v-if="!loading && !error && !hearted.length && !mostPlayed.length" class="panel p-8 text-center">
        <p class="display text-3xl">No favorites yet</p>
        <p class="mx-auto mt-3 max-w-[44ch] text-muted">
          They show up here as she plays and as she picks.
        </p>
      </div>
    </div>
  </section>
</template>
