<script setup lang="ts">
import { Heart } from 'lucide-vue-next';
import { RouterLink } from 'vue-router';
import { formatHours, type GameCard } from '../api/types';
import GameCover from './GameCover.vue';
import StarRating from './StarRating.vue';

/** One game in a grid: cover, title, her rating, her hours. */
defineProps<{ game: GameCard }>();
</script>

<template>
  <RouterLink :to="`/games/${game.slug}`" class="panel panel-link flex h-full flex-col">
    <div class="relative border-b-2 border-rule">
      <GameCover :title="game.title" :cover-url="game.coverUrl" />
      <span
        v-if="game.isFavorite"
        class="absolute right-2 top-2 flex size-8 items-center justify-center border-2 border-rule bg-surface"
        title="One of her favorites"
      >
        <Heart class="size-4 fill-accent text-accent" aria-hidden="true" />
        <span class="sr-only">One of her favorites</span>
      </span>
    </div>
    <div class="flex grow flex-col gap-2 p-4">
      <h3 class="display text-xl">{{ game.title }}</h3>
      <StarRating v-if="game.rating" :rating="game.rating" size="size-3.5" show-number />
      <p v-else class="kicker">Not rated yet</p>
      <p class="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-xs text-muted">
        <span v-if="game.platform" class="chip">{{ game.platform }}</span>
        <span v-if="game.playtimeHours !== null">{{ formatHours(game.playtimeHours) }} played</span>
      </p>
    </div>
  </RouterLink>
</template>
