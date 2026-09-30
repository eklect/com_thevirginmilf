<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { api } from '../api/client';
import { isLiveNow, type GameCard, type ReviewSummary, type Stream } from '../api/types';
import GameCover from '../components/GameCover.vue';
import GameTile from '../components/GameTile.vue';
import StarRating from '../components/StarRating.vue';
import StreamTile from '../components/StreamTile.vue';
import { useAuthStore } from '../stores/auth';
import { useSiteStore } from '../stores/site';

interface HomePayload {
  upcoming: Stream[];
  favorites: GameCard[];
  recentlyPlayed: GameCard[];
  latestReviews: (ReviewSummary & { excerpt: string })[];
}

const auth = useAuthStore();
const site = useSiteStore();

const data = ref<HomePayload | null>(null);
const failed = ref(false);

onMounted(async () => {
  try {
    data.value = await api.get<HomePayload>('/api/site/home');
  } catch {
    // The hero still stands on its own; the sections below simply do not render.
    failed.value = true;
  }
});

const liveNow = computed(() => data.value?.upcoming.find((stream) => isLiveNow(stream)) ?? null);
const show = (key: 'streams' | 'games' | 'favorites' | 'live') => site.isEnabled(key);
</script>

<template>
  <!-- On right now: said first, above everything, because it is the one thing
       on this page with a clock on it. -->
  <RouterLink
    v-if="liveNow && show('live')"
    to="/live"
    class="band band-ink flex items-center justify-center gap-3 px-5 py-3 text-center !text-white no-underline"
  >
    <span class="chip chip-red">Live now</span>
    <span class="font-head text-sm font-bold">{{ liveNow.title }} — watch →</span>
  </RouterLink>

  <!-- The cover: red leather, the logo on a white plate. -->
  <section class="band band-brand">
    <div class="band-inner grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
      <div>
        <p class="font-head text-xs font-extrabold uppercase tracking-[0.2em] text-white/80">
          {{ site.streamerName }}
        </p>
        <h1 class="display mt-4 text-[clamp(44px,8vw,104px)]">
          {{ site.settings.tagline || 'New to games. Not new to being fabulous.' }}
        </h1>
        <p v-if="site.settings.home_intro" class="mt-6 max-w-[46ch] text-lg leading-relaxed text-white/90">
          {{ site.settings.home_intro }}
        </p>
        <div class="mt-8 flex flex-wrap gap-4">
          <!-- Black on the red slab in both themes, on a white block: the
               theme's own shadow colour is black or red, and either is lost here. -->
          <RouterLink
            v-if="show('streams')"
            to="/streams"
            class="btn !border-black !bg-black !text-white"
            style="box-shadow: 4px 4px 0 0 #ffffff"
          >
            See the schedule
          </RouterLink>
          <RouterLink v-if="!auth.user && site.isEnabled('signup')" to="/signup" class="btn-outline">
            Get stream alerts
          </RouterLink>
          <RouterLink v-else-if="auth.user && site.isEnabled('settings')" to="/account" class="btn-outline">
            Your stream alerts
          </RouterLink>
        </div>
      </div>

      <!--
        The logo as drawn. It is black type on transparency, so it sits on a
        white plate that does NOT follow the theme — the one place on the site
        that is white in dark mode, on purpose.
      -->
      <div class="mx-auto w-full max-w-md lg:max-w-none">
        <div
          class="border-[3px] border-black bg-white p-7 sm:p-10 lg:rotate-2"
          style="box-shadow: 10px 10px 0 0 #0a0a0a"
        >
          <img
            src="/brand/v1/logo.png"
            :alt="`${site.siteName} logo`"
            class="h-auto w-full"
            width="1299"
            height="961"
          />
        </div>
      </div>
    </div>
  </section>
  <div class="stripes" aria-hidden="true"></div>

  <!-- Next up -->
  <section v-if="show('streams')" class="band">
    <div class="band-inner">
      <div class="section-head">
        <h2 class="section-title">Next up</h2>
        <RouterLink to="/streams" class="kicker">The full calendar →</RouterLink>
      </div>

      <div v-if="data?.upcoming.length" class="mt-8 grid gap-7 md:grid-cols-2 lg:grid-cols-3">
        <StreamTile v-for="stream in data.upcoming" :key="stream.id" :stream="stream" />
      </div>
      <div v-else-if="data" class="panel mt-8 p-8 text-center">
        <p class="display text-3xl">Nothing on the calendar yet</p>
        <p class="mx-auto mt-3 max-w-[44ch] text-muted">
          {{ site.settings.subscribe_intro || 'Sign up and you will hear the moment a stream is scheduled.' }}
        </p>
        <RouterLink v-if="!auth.user && site.isEnabled('signup')" to="/signup" class="btn mt-6">
          Tell me when she streams
        </RouterLink>
      </div>
    </div>
  </section>

  <!-- Playing lately -->
  <section v-if="show('games') && data?.recentlyPlayed.length" class="band band-alt">
    <div class="band-inner">
      <div class="section-head">
        <h2 class="section-title">Playing lately</h2>
        <RouterLink to="/games" class="kicker">The whole library →</RouterLink>
      </div>
      <div class="mt-8 grid gap-7 sm:grid-cols-2 lg:grid-cols-4">
        <GameTile v-for="game in data.recentlyPlayed" :key="game.id" :game="game" />
      </div>
    </div>
  </section>

  <!-- What she thought -->
  <section v-if="show('games') && data?.latestReviews.length" class="band">
    <div class="band-inner">
      <div class="section-head">
        <h2 class="section-title">What she thought</h2>
      </div>
      <div class="mt-8 grid gap-7 lg:grid-cols-3">
        <RouterLink
          v-for="review in data.latestReviews"
          :key="review.id"
          :to="`/games/${review.game.slug}#review-${review.id}`"
          class="panel panel-link flex h-full flex-col"
        >
          <div class="border-b-2 border-rule">
            <GameCover :title="review.game.title" :cover-url="review.game.coverUrl" />
          </div>
          <div class="flex grow flex-col gap-2 p-5">
            <p class="kicker">{{ review.game.title }}</p>
            <h3 class="display text-2xl">{{ review.title }}</h3>
            <StarRating v-if="review.game.rating" :rating="review.game.rating" size="size-3.5" show-number />
            <p class="mt-1 text-sm text-muted">{{ review.excerpt }}</p>
          </div>
        </RouterLink>
      </div>
    </div>
  </section>

  <!-- Favorites -->
  <section v-if="show('favorites') && data?.favorites.length" class="band band-alt">
    <div class="band-inner">
      <div class="section-head">
        <h2 class="section-title">Her favorites</h2>
        <RouterLink to="/favorites" class="kicker">All of them →</RouterLink>
      </div>
      <div class="mt-8 grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
        <GameTile v-for="game in data.favorites" :key="game.id" :game="game" />
      </div>
    </div>
  </section>

  <!-- The ask, for somebody who got this far without an account. -->
  <section v-if="!auth.user && site.isEnabled('signup')" class="band band-ink">
    <div class="band-inner flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 class="display text-4xl sm:text-5xl">Never miss a stream</h2>
        <p class="mt-3 max-w-[48ch] text-white/75">
          {{ site.settings.subscribe_intro || 'Get told when a stream is scheduled, and again just before she goes live.' }}
        </p>
      </div>
      <RouterLink to="/signup" class="btn shrink-0 !border-white" style="box-shadow: 4px 4px 0 0 #ffffff">
        Sign up — it is free
      </RouterLink>
    </div>
  </section>
</template>
