<script setup lang="ts">
import { ChevronLeft, ChevronRight, Heart } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { api, ApiError, errorMessage } from '../api/client';
import {
  formatDate,
  formatHours,
  type GameDetail,
  type Review,
  type Screenshot,
} from '../api/types';
import GameCover from '../components/GameCover.vue';
import MarkdownBody from '../components/MarkdownBody.vue';
import StarRating from '../components/StarRating.vue';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog';
import { useAuthStore } from '../stores/auth';
import { useSiteStore } from '../stores/site';

interface Payload {
  game: GameDetail & { isHidden: boolean };
  screenshots: Screenshot[];
  categories: { slug: string; name: string }[];
  reviews: Review[];
}

const route = useRoute();
const auth = useAuthStore();
const site = useSiteStore();

const data = ref<Payload | null>(null);
const error = ref('');
const notFound = ref(false);

watch(
  () => route.params.slug as string,
  async (slug) => {
    data.value = null;
    error.value = '';
    notFound.value = false;
    try {
      data.value = await api.get<Payload>(`/api/site/games/${encodeURIComponent(slug)}`);
      // The router titles this route "Games"; the game's own name is better.
      document.title = `${data.value.game.title} · ${site.siteName}`;
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) notFound.value = true;
      else error.value = errorMessage(e);
    }
  },
  { immediate: true },
);

const game = computed(() => data.value?.game ?? null);

/** The facts line under the title, skipping whatever is unknown. */
const facts = computed(() => {
  const g = game.value;
  if (!g) return [];
  return [
    g.developer ? { label: 'Developer', value: g.developer } : null,
    g.publisher && g.publisher !== g.developer ? { label: 'Publisher', value: g.publisher } : null,
    g.releaseText ? { label: 'Released', value: g.releaseText } : null,
    g.playtimeHours !== null ? { label: 'She has played', value: formatHours(g.playtimeHours) } : null,
    g.lastPlayedAt ? { label: 'Last played', value: formatDate(g.lastPlayedAt) } : null,
  ].filter((fact) => fact !== null);
});

// ---------- the screenshot viewer ----------

const viewing = ref<number | null>(null);
const shots = computed(() => data.value?.screenshots ?? []);

function step(delta: number): void {
  if (viewing.value === null || !shots.value.length) return;
  viewing.value = (viewing.value + delta + shots.value.length) % shots.value.length;
}
</script>

<template>
  <section v-if="notFound" class="band">
    <div class="band-inner text-center">
      <h1 class="display text-5xl">That game is not in the library</h1>
      <RouterLink to="/games" class="btn mt-8">Every game</RouterLink>
    </div>
  </section>

  <section v-else-if="error" class="band">
    <div class="band-inner"><p class="notice-error">{{ error }}</p></div>
  </section>

  <template v-else-if="game && data">
    <p v-if="game.isHidden" class="band band-ink px-5 py-2.5 text-center font-head text-xs font-bold uppercase tracking-[0.14em]">
      Hidden — only admins can see this page
    </p>

    <!-- The cover spread. -->
    <section class="band band-alt">
      <div class="band-inner grid items-start gap-9 !py-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <div class="panel">
          <GameCover :title="game.title" :cover-url="game.coverUrl" />
        </div>

        <div>
          <p class="kicker">
            <RouterLink to="/games" class="no-underline hover:underline">Games</RouterLink>
          </p>
          <h1 class="display mt-2 text-5xl sm:text-6xl">{{ game.title }}</h1>

          <div class="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
            <StarRating v-if="game.rating" :rating="game.rating" size="size-6" show-number />
            <span v-else class="kicker">Not rated yet</span>
            <span v-if="game.isFavorite" class="chip chip-red">
              <Heart class="size-3 fill-current" aria-hidden="true" /> A favorite
            </span>
          </div>

          <p v-if="game.summary" class="mt-5 max-w-[60ch] text-[15.5px] leading-relaxed">{{ game.summary }}</p>

          <p class="mt-5 flex flex-wrap gap-2">
            <span v-if="game.platform" class="chip chip-ink">{{ game.platform }}</span>
            <RouterLink
              v-for="category in data.categories"
              :key="category.slug"
              :to="`/games/category/${category.slug}`"
              class="chip"
            >
              {{ category.name }}
            </RouterLink>
            <span v-for="genre in game.genres" :key="genre" class="chip !border-border !text-muted">{{ genre }}</span>
          </p>

          <dl v-if="facts.length" class="mt-6 grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-sm">
            <template v-for="fact in facts" :key="fact.label">
              <dt class="kicker pt-0.5">{{ fact.label }}</dt>
              <dd>{{ fact.value }}</dd>
            </template>
          </dl>

          <div class="mt-7 flex flex-wrap items-center gap-4">
            <a v-if="game.storeUrl" :href="game.storeUrl" target="_blank" rel="noopener noreferrer" class="btn btn-ink btn-sm">
              See it on Steam
            </a>
            <RouterLink v-if="auth.isAdmin" :to="`/admin/games/${game.id}`" class="kicker">Edit this game →</RouterLink>
          </div>
        </div>
      </div>
    </section>

    <!-- Her own notes on it. -->
    <section v-if="game.description" class="band">
      <div class="band-inner !pb-0">
        <div class="section-head"><h2 class="section-title">Her notes</h2></div>
        <div class="mt-7"><MarkdownBody :source="game.description" /></div>
      </div>
    </section>

    <!-- Reviews -->
    <section class="band">
      <div class="band-inner">
        <div class="section-head">
          <h2 class="section-title">{{ data.reviews.length === 1 ? 'Her review' : 'Her reviews' }}</h2>
        </div>

        <p v-if="!data.reviews.length" class="mt-7 text-muted">She has not written about this one yet.</p>

        <article
          v-for="(review, index) in data.reviews"
          :id="`review-${review.id}`"
          :key="review.id"
          class="scroll-mt-24"
          :class="index ? 'rule-thin mt-12 pt-10' : 'mt-8'"
        >
          <p class="kicker">
            <span v-if="!review.isPublished" class="chip chip-ink mr-2">Draft</span>
            {{ formatDate(review.publishedAt) }}
          </p>
          <h3 class="display mt-2 text-4xl">{{ review.title }}</h3>
          <div class="mt-5"><MarkdownBody :source="review.body" /></div>
        </article>
      </div>
    </section>

    <!-- Screenshots -->
    <section v-if="shots.length" class="band band-alt">
      <div class="band-inner">
        <div class="section-head"><h2 class="section-title">Screenshots</h2></div>
        <ul class="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          <li v-for="(shot, index) in shots" :key="shot.id">
            <button
              type="button"
              class="block w-full border-2 border-rule transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5"
              :aria-label="`Open screenshot ${index + 1} of ${shots.length}`"
              @click="viewing = index"
            >
              <img :src="shot.thumbUrl" alt="" loading="lazy" class="aspect-video w-full bg-surface object-cover" />
            </button>
          </li>
        </ul>
      </div>
    </section>

    <Dialog :open="viewing !== null" @update:open="(value) => !value && (viewing = null)">
      <DialogContent class="border-[3px] border-rule bg-black p-0 sm:max-w-5xl">
        <DialogTitle class="sr-only">{{ game.title }} screenshots</DialogTitle>
        <DialogDescription class="sr-only">
          Screenshot {{ (viewing ?? 0) + 1 }} of {{ shots.length }}
        </DialogDescription>
        <img
          v-if="viewing !== null && shots[viewing]"
          :src="shots[viewing]!.fullUrl"
          :alt="`${game.title} screenshot ${viewing + 1}`"
          class="max-h-[80vh] w-full object-contain"
        />
        <div v-if="shots.length > 1" class="flex items-center justify-between bg-black px-3 pb-3 text-white">
          <button type="button" class="btn-outline !px-3 !py-1.5" aria-label="Previous screenshot" @click="step(-1)">
            <ChevronLeft class="size-4" aria-hidden="true" />
          </button>
          <span class="font-head text-xs font-bold tabular-nums">{{ (viewing ?? 0) + 1 }} / {{ shots.length }}</span>
          <button type="button" class="btn-outline !px-3 !py-1.5" aria-label="Next screenshot" @click="step(1)">
            <ChevronRight class="size-4" aria-hidden="true" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  </template>
</template>
