<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { api, errorMessage } from '../../api/client';
import type { AdminGame, Review } from '../../api/types';
import MarkdownEditor from '../../components/MarkdownEditor.vue';
import StarRating from '../../components/StarRating.vue';
import ConfirmButton from './ConfirmButton.vue';
import { fromLocalInput, toLocalInput } from './datetime';
import { useSaveNotice } from './useSaveNotice';

/**
 * Writes or edits one review.
 *
 * Two routes lead here: `/admin/games/:id/reviews/new` to start one under a
 * game, and `/admin/reviews/:reviewId` to edit one. Either way the game is
 * known, and the rating — which lives on the GAME, not the review — sits
 * beside the text so both can be given in one sitting.
 */
const route = useRoute();
const router = useRouter();
const reviewId = route.params.reviewId as string | undefined;
const newForGameId = route.params.id as string | undefined;

const game = ref<{ id: string; slug: string; title: string } | null>(null);
const rating = ref<number | null>(null);
const form = ref({ title: '', body: '', isPublished: false, publishedAt: '' });
const error = ref('');
const busy = ref(false);

// Stays on the page after saving: a review is long, and "save and keep
// writing" is the ordinary way to write one.
const { notice, alertEl, revealAlert, flagSaved, flashSaved, clearNotice } = useSaveNotice(form);

onMounted(async () => {
  try {
    if (reviewId) {
      const data = await api.get<{ review: Review; game: { id: string; slug: string; title: string } }>(
        `/api/admin/reviews/${reviewId}`,
      );
      game.value = data.game;
      form.value = {
        title: data.review.title,
        body: data.review.body,
        isPublished: data.review.isPublished,
        publishedAt: toLocalInput(data.review.publishedAt),
      };
    }
    const gameId = game.value?.id ?? newForGameId;
    if (gameId) {
      const { game: loaded } = await api.get<{ game: AdminGame }>(`/api/admin/games/${gameId}`);
      game.value = { id: loaded.id, slug: loaded.slug, title: loaded.title };
      rating.value = loaded.rating;
    }
  } catch (e) {
    error.value = errorMessage(e);
  }
});

/** The rating saves on its own, at once — it is the game's, not this form's. */
async function setRating(value: number | null) {
  if (!game.value) return;
  const previous = rating.value;
  rating.value = value;
  try {
    await api.put(`/api/admin/games/${game.value.id}`, { rating: value });
  } catch (e) {
    rating.value = previous;
    error.value = errorMessage(e);
  }
}

async function save() {
  if (!game.value) return;
  error.value = '';
  clearNotice();
  busy.value = true;
  // Exactly the fields the DTO declares — the API refuses unknown keys.
  const body = {
    title: form.value.title,
    body: form.value.body,
    isPublished: form.value.isPublished,
    publishedAt: fromLocalInput(form.value.publishedAt),
  };
  try {
    if (reviewId) {
      const { review } = await api.put<{ review: Review }>(`/api/admin/reviews/${reviewId}`, body);
      form.value.publishedAt = toLocalInput(review.publishedAt);
      await flagSaved(review.isPublished ? 'Saved. It is live on the game’s page.' : 'Draft saved.');
    } else {
      const { review } = await api.post<{ review: Review }>(`/api/admin/games/${game.value.id}/reviews`, body);
      flashSaved(
        review.isPublished ? 'Review published.' : 'Draft saved. Tick “Published” when it is ready.',
        `/admin/reviews/${review.id}`,
      );
      void router.push(`/admin/reviews/${review.id}`);
    }
  } catch (e) {
    error.value = errorMessage(e);
    await revealAlert();
  } finally {
    busy.value = false;
  }
}

async function remove() {
  if (!reviewId || !game.value) return;
  busy.value = true;
  try {
    await api.delete(`/api/admin/reviews/${reviewId}`);
    flashSaved('Review deleted.', `/admin/games/${game.value.id}`);
    void router.push(`/admin/games/${game.value.id}`);
  } catch (e) {
    error.value = errorMessage(e);
    await revealAlert();
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <p class="kicker">
    <RouterLink v-if="game" :to="`/admin/games/${game.id}`" class="no-underline hover:underline">
      {{ game.title }}
    </RouterLink>
  </p>
  <h1 class="display mt-1 text-4xl">{{ reviewId ? 'Edit review' : 'Write a review' }}</h1>

  <p v-if="error" ref="alertEl" role="alert" class="notice-error mt-5">{{ error }}</p>
  <p v-else-if="notice" ref="alertEl" role="status" class="notice mt-5">{{ notice }}</p>

  <div v-if="game" class="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-2 border-rule bg-surface-alt p-4">
    <p class="font-head text-sm font-bold">Her rating for {{ game.title }}</p>
    <StarRating :rating="rating" editable size="size-6" show-number @update:rating="setRating" />
    <p class="basis-full text-xs text-muted">
      Saves as soon as a star is clicked. It belongs to the game, so it is the same on every review.
    </p>
  </div>

  <form class="mt-7 max-w-3xl space-y-5" @submit.prevent="save">
    <div>
      <label for="title" class="kicker block">Headline</label>
      <input id="title" v-model="form.title" type="text" required maxlength="200" class="input mt-1.5" />
    </div>

    <div>
      <label class="kicker block">Review</label>
      <MarkdownEditor v-model="form.body" class="mt-1.5" />
    </div>

    <div class="grid gap-5 sm:grid-cols-2">
      <label class="flex cursor-pointer items-start gap-2.5 text-sm">
        <input v-model="form.isPublished" type="checkbox" class="mt-0.5 size-4 accent-[var(--accent)]" />
        <span>
          <span class="font-head font-bold">Published</span>
          <span class="block text-xs text-muted">On the game's page for everyone. Unticked, it is a draft only admins see.</span>
        </span>
      </label>
      <div>
        <label for="publishedAt" class="kicker block">Dated (optional)</label>
        <input id="publishedAt" v-model="form.publishedAt" type="datetime-local" class="input mt-1.5" />
        <p class="mt-1.5 text-xs text-muted">Empty is stamped the first time it is published.</p>
      </div>
    </div>

    <div class="flex items-center gap-5">
      <button type="submit" :disabled="busy || !game" class="btn">{{ busy ? 'Saving…' : 'Save' }}</button>
      <RouterLink v-if="game" :to="`/admin/games/${game.id}`" class="kicker no-underline hover:text-text">
        Back to the game
      </RouterLink>
      <RouterLink v-if="game && reviewId" :to="`/games/${game.slug}`" class="kicker">View on the site →</RouterLink>
      <ConfirmButton v-if="reviewId" class="ml-auto" label="Delete this review" :disabled="busy" @confirm="remove" />
    </div>
  </form>
</template>
