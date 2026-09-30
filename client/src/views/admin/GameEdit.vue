<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { api, errorMessage } from '../../api/client';
import {
  formatDate,
  formatHours,
  type AdminCategory,
  type AdminGame,
  type AdminScreenshot,
  type Review,
  type Upload,
} from '../../api/types';
import GameCover from '../../components/GameCover.vue';
import ImagePicker from '../../components/ImagePicker.vue';
import MarkdownEditor from '../../components/MarkdownEditor.vue';
import StarRating from '../../components/StarRating.vue';
import ConfirmButton from './ConfirmButton.vue';
import { useSaveNotice } from './useSaveNotice';

/**
 * One game: what the site says about it, its gallery and its reviews.
 *
 * ## A Steam game's fields are overrides
 *
 * For a game that came from Steam, every text field here starts empty and
 * shows Steam's value as its placeholder. Typing replaces it on the site;
 * clearing the field hands it back to Steam. The sync never touches what is
 * typed here (`server/src/games/game.entity.ts`), so a correction is
 * permanent until she removes it.
 *
 * For a game added by hand there is nothing underneath, so the title is
 * required and the rest is simply what she enters.
 */
const route = useRoute();
const router = useRouter();
const id = route.params.id as string | undefined;

const game = ref<AdminGame | null>(null);
const screenshots = ref<AdminScreenshot[]>([]);
const reviews = ref<Review[]>([]);
const categories = ref<AdminCategory[]>([]);

const form = ref({
  title: '',
  platformLabel: '',
  summary: '',
  description: '',
  developer: '',
  publisher: '',
  releaseText: '',
  coverUploadId: '',
  rating: null as number | null,
  isFavorite: false,
  isHidden: false,
  favoritesExcluded: false,
  categoryIds: [] as string[],
});

const error = ref('');
const busy = ref(false);
const isSteam = computed(() => game.value?.source === 'steam');

// Stays on the page after saving — the gallery and the reviews are below the
// form — so the confirmation is pinned to the form as it stood when saved.
const { notice, alertEl, revealAlert, flagSaved, flashSaved, clearNotice } = useSaveNotice(form);

function fill(loaded: AdminGame): void {
  game.value = loaded;
  form.value = {
    title: loaded.overrides.title ?? '',
    platformLabel: loaded.overrides.platformLabel ?? '',
    summary: loaded.overrides.summary ?? '',
    description: loaded.description ?? '',
    developer: loaded.overrides.developer ?? '',
    publisher: loaded.overrides.publisher ?? '',
    releaseText: loaded.overrides.releaseText ?? '',
    coverUploadId: loaded.overrides.coverUploadId ?? '',
    rating: loaded.rating,
    isFavorite: loaded.isFavorite,
    isHidden: loaded.isHidden,
    favoritesExcluded: loaded.favoritesExcluded,
    categoryIds: [...loaded.categoryIds],
  };
}

onMounted(async () => {
  try {
    const [categoryData, gameData] = await Promise.all([
      api.get<{ categories: AdminCategory[] }>('/api/admin/categories'),
      id
        ? api.get<{ game: AdminGame; screenshots: AdminScreenshot[]; reviews: Review[] }>(
            `/api/admin/games/${id}`,
          )
        : Promise.resolve(null),
    ]);
    categories.value = categoryData.categories;
    if (gameData) {
      fill(gameData.game);
      screenshots.value = gameData.screenshots;
      reviews.value = gameData.reviews;
    }
  } catch (e) {
    error.value = errorMessage(e);
  }
});

async function save() {
  error.value = '';
  clearNotice();
  busy.value = true;
  // Exactly the fields the DTO declares — the API refuses unknown keys. An
  // empty text field is sent as null, which for a Steam game lifts the
  // override and lets Steam's value show again.
  const body = {
    title: form.value.title.trim() || null,
    platformLabel: form.value.platformLabel.trim() || null,
    summary: form.value.summary.trim() || null,
    description: form.value.description.trim() || null,
    developer: form.value.developer.trim() || null,
    publisher: form.value.publisher.trim() || null,
    releaseText: form.value.releaseText.trim() || null,
    coverUploadId: form.value.coverUploadId || null,
    rating: form.value.rating,
    isFavorite: form.value.isFavorite,
    isHidden: form.value.isHidden,
    favoritesExcluded: form.value.favoritesExcluded,
    categoryIds: form.value.categoryIds,
  };
  try {
    if (id) {
      fill((await api.put<{ game: AdminGame }>(`/api/admin/games/${id}`, body)).game);
      await flagSaved('Saved.');
    } else {
      const { game: created } = await api.post<{ game: AdminGame }>('/api/admin/games', body);
      // Onward to the new game's own page, where screenshots and reviews are.
      flashSaved('Game added. Add screenshots and a review below.', `/admin/games/${created.id}`);
      void router.push(`/admin/games/${created.id}`);
    }
  } catch (e) {
    error.value = errorMessage(e);
    await revealAlert();
  } finally {
    busy.value = false;
  }
}

async function refreshFromSteam() {
  if (!id) return;
  error.value = '';
  busy.value = true;
  try {
    const data = await api.post<{ game: AdminGame; screenshots: AdminScreenshot[] }>(
      `/api/admin/steam/games/${id}/refresh`,
    );
    // Only the Steam half changed. The form holds her half and may have
    // unsaved edits in it, so it is left exactly as it is.
    game.value = data.game;
    screenshots.value = data.screenshots;
  } catch (e) {
    error.value = errorMessage(e);
    await revealAlert();
  } finally {
    busy.value = false;
  }
}

async function remove() {
  if (!id) return;
  error.value = '';
  busy.value = true;
  try {
    await api.delete(`/api/admin/games/${id}`);
    flashSaved('Game deleted.', '/admin/games');
    void router.push('/admin/games');
  } catch (e) {
    error.value = errorMessage(e);
    await revealAlert();
  } finally {
    busy.value = false;
  }
}

// ---------- screenshots ----------

const shotBusy = ref(false);
const shotError = ref('');

async function shotRequest(work: () => Promise<{ screenshots: AdminScreenshot[] }>) {
  shotError.value = '';
  shotBusy.value = true;
  try {
    screenshots.value = (await work()).screenshots;
  } catch (e) {
    shotError.value = errorMessage(e);
  } finally {
    shotBusy.value = false;
  }
}

/** Uploads each chosen file, then attaches it — two calls a file, in order. */
async function addScreenshots(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  for (const file of files) {
    await shotRequest(async () => {
      const body = new FormData();
      body.append('file', file);
      const { upload } = await api.post<{ upload: Upload }>('/api/admin/uploads', body);
      return api.post(`/api/admin/games/${id}/screenshots`, { uploadId: upload.id });
    });
    if (shotError.value) break;
  }
  input.value = '';
}

const setShotHidden = (shot: AdminScreenshot) =>
  shotRequest(() => api.put(`/api/admin/games/${id}/screenshots/${shot.id}`, { isHidden: !shot.isHidden }));

const removeShot = (shot: AdminScreenshot) =>
  shotRequest(() => api.delete(`/api/admin/games/${id}/screenshots/${shot.id}`));

function moveShot(index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= screenshots.value.length) return;
  const ids = screenshots.value.map((shot) => shot.id);
  [ids[index], ids[target]] = [ids[target]!, ids[index]!];
  void shotRequest(() => api.put(`/api/admin/games/${id}/screenshots/order`, { ids }));
}
</script>

<template>
  <header class="flex flex-wrap items-start justify-between gap-4">
    <div>
      <p class="kicker"><RouterLink to="/admin/games" class="no-underline hover:underline">Games</RouterLink></p>
      <h1 class="display mt-1 text-4xl">{{ game ? game.title : id ? 'Game' : 'Add a game by hand' }}</h1>
      <p v-if="game" class="mt-1 text-sm text-muted">
        {{ isSteam ? 'From Steam' : 'Added by hand' }}
        <template v-if="game.playtimeHours !== null"> · {{ formatHours(game.playtimeHours) }} played</template>
        <template v-if="isSteam && !game.steamOwned"> · no longer in her library</template>
      </p>
    </div>
    <div v-if="game" class="flex flex-wrap items-center gap-4">
      <button v-if="isSteam" type="button" class="kicker hover:text-text" :disabled="busy" @click="refreshFromSteam">
        Refresh from Steam
      </button>
      <RouterLink :to="`/games/${game.slug}`" class="kicker">View on the site →</RouterLink>
    </div>
  </header>

  <p v-if="error" ref="alertEl" role="alert" class="notice-error mt-5">{{ error }}</p>
  <p v-else-if="notice" ref="alertEl" role="status" class="notice mt-5">{{ notice }}</p>

  <p v-if="!id" class="mt-4 max-w-prose text-sm text-muted">
    For a console game, or anything Steam does not know she owns. Steam games arrive on their own
    from the sync — there is no need to add those here.
  </p>
  <p v-else-if="isSteam" class="mt-4 max-w-prose text-sm text-muted">
    The fields below start empty and show what Steam says. Type in one to replace it on the site;
    clear it to go back to Steam's. A sync never changes what you type here.
  </p>

  <form class="mt-7 grid max-w-5xl gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_300px]" @submit.prevent="save">
    <div class="space-y-5">
      <div>
        <label for="title" class="kicker block">Title</label>
        <input
          id="title"
          v-model="form.title"
          type="text"
          maxlength="200"
          :required="!isSteam"
          :placeholder="game?.steam.name ?? ''"
          class="input mt-1.5"
        />
      </div>

      <div v-if="!isSteam">
        <label for="platform" class="kicker block">Platform</label>
        <input id="platform" v-model="form.platformLabel" type="text" maxlength="60" placeholder="Nintendo Switch" class="input mt-1.5" />
      </div>

      <div>
        <label for="summary" class="kicker block">Summary</label>
        <textarea
          id="summary"
          v-model="form.summary"
          rows="3"
          maxlength="600"
          :placeholder="game?.steam.summary ?? ''"
          class="input mt-1.5"
        ></textarea>
        <p class="mt-1.5 text-xs text-muted">A sentence or two about what the game is. Shown under the title.</p>
      </div>

      <div class="grid gap-5 sm:grid-cols-3">
        <div>
          <label for="developer" class="kicker block">Developer</label>
          <input id="developer" v-model="form.developer" type="text" maxlength="200" :placeholder="game?.steam.developers ?? ''" class="input mt-1.5" />
        </div>
        <div>
          <label for="publisher" class="kicker block">Publisher</label>
          <input id="publisher" v-model="form.publisher" type="text" maxlength="200" :placeholder="game?.steam.publishers ?? ''" class="input mt-1.5" />
        </div>
        <div>
          <label for="release" class="kicker block">Released</label>
          <input id="release" v-model="form.releaseText" type="text" maxlength="60" :placeholder="game?.steam.releaseText ?? 'Mar 3, 2017'" class="input mt-1.5" />
        </div>
      </div>

      <div>
        <label class="kicker block">Her notes (optional)</label>
        <MarkdownEditor v-model="form.description" class="mt-1.5" />
        <p class="mt-1.5 text-xs text-muted">
          Anything she wants to say about the game that is not a review — shown above the reviews.
        </p>
      </div>
    </div>

    <aside class="space-y-6">
      <div v-if="game" class="border border-border">
        <GameCover :title="game.title" :cover-url="game.coverUrl" />
      </div>

      <ImagePicker
        v-model="form.coverUploadId"
        label="Cover art"
        :hint="isSteam ? 'Empty uses Steam’s artwork. Wide images work best — Steam’s are 460 × 215.' : 'Wide images work best — about 920 × 430. Empty shows the title on red.'"
      />

      <div>
        <p class="kicker">Her rating</p>
        <div class="mt-2">
          <StarRating v-model:rating="form.rating" editable size="size-6" show-number />
        </div>
        <p class="mt-1.5 text-xs text-muted">Click a star. Click the same star again to clear it.</p>
      </div>

      <div class="space-y-2.5">
        <label class="flex cursor-pointer items-start gap-2.5 text-sm">
          <input v-model="form.isFavorite" type="checkbox" class="mt-0.5 size-4 accent-[var(--accent)]" />
          <span>A favorite <span class="block text-xs text-muted">Puts it on the favorites list, whatever its playtime.</span></span>
        </label>
        <label class="flex cursor-pointer items-start gap-2.5 text-sm">
          <input v-model="form.favoritesExcluded" type="checkbox" class="mt-0.5 size-4 accent-[var(--accent)]" />
          <span>
            Keep it off “most played”
            <span class="block text-xs text-muted">For a game with a lot of hours that she would not call a favorite.</span>
          </span>
        </label>
        <label class="flex cursor-pointer items-start gap-2.5 text-sm">
          <input v-model="form.isHidden" type="checkbox" class="mt-0.5 size-4 accent-[var(--accent)]" />
          <span>Hidden <span class="block text-xs text-muted">Off the site entirely: the lists, favorites, and its own page.</span></span>
        </label>
      </div>

      <fieldset>
        <legend class="kicker">Categories</legend>
        <p v-if="!categories.length" class="mt-2 text-xs text-muted">
          None yet. <RouterLink to="/admin/categories/new">Make one</RouterLink>.
        </p>
        <label v-for="category in categories" :key="category.id" class="mt-2 flex cursor-pointer items-center gap-2.5 text-sm">
          <input v-model="form.categoryIds" type="checkbox" :value="category.id" class="size-4 accent-[var(--accent)]" />
          {{ category.name }}
          <span v-if="!category.isPublished" class="text-xs text-muted">(hidden)</span>
        </label>
      </fieldset>
    </aside>

    <div class="flex items-center gap-5 lg:col-span-2">
      <button type="submit" :disabled="busy" class="btn">{{ busy ? 'Saving…' : id ? 'Save' : 'Add the game' }}</button>
      <RouterLink to="/admin/games" class="kicker no-underline hover:text-text">Back to the list</RouterLink>
      <ConfirmButton
        v-if="game && !isSteam"
        class="ml-auto"
        label="Delete this game"
        confirm-label="Delete it and its reviews?"
        :disabled="busy"
        @confirm="remove"
      />
    </div>
  </form>

  <template v-if="game">
    <!-- Reviews -->
    <section class="mt-14 max-w-5xl">
      <div class="masthead-rule flex items-center justify-between gap-4 pt-4">
        <h2 class="display text-2xl">Reviews</h2>
        <RouterLink :to="`/admin/games/${game.id}/reviews/new`" class="btn btn-sm">Write a review</RouterLink>
      </div>
      <p v-if="!reviews.length" class="mt-4 text-sm text-muted">Nothing written about this one yet.</p>
      <ul v-else class="mt-2">
        <li v-for="review in reviews" :key="review.id" class="flex items-center justify-between gap-4 border-b border-border py-3 text-sm">
          <RouterLink :to="`/admin/reviews/${review.id}`" class="font-semibold no-underline hover:underline">
            {{ review.title }}
          </RouterLink>
          <span class="kicker shrink-0">
            {{ review.isPublished ? `Published ${formatDate(review.publishedAt)}` : 'Draft' }}
          </span>
        </li>
      </ul>
    </section>

    <!-- Screenshots -->
    <section class="mt-14 max-w-5xl">
      <div class="masthead-rule flex flex-wrap items-center justify-between gap-4 pt-4">
        <h2 class="display text-2xl">Screenshots</h2>
        <label class="kicker cursor-pointer border border-border px-3 py-1.5 hover:border-rule">
          {{ shotBusy ? 'Working…' : 'Upload screenshots' }}
          <input
            type="file"
            multiple
            accept="image/png,image/jpeg,image/gif,image/webp"
            class="sr-only"
            :disabled="shotBusy"
            @change="addScreenshots"
          />
        </label>
      </div>
      <p class="mt-3 max-w-prose text-xs text-muted">
        <template v-if="isSteam">
          Steam's come in with the sync and can be hidden but not deleted — a refresh would bring
          them back. Her own uploads can be deleted.
        </template>
        <template v-else>PNG, JPEG, GIF or WebP, up to 5 MB each.</template>
        The first visible one leads the gallery.
      </p>
      <p v-if="shotError" class="notice-error mt-4">{{ shotError }}</p>

      <p v-if="!screenshots.length" class="mt-4 text-sm text-muted">No screenshots yet.</p>
      <ul v-else class="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <li v-for="(shot, index) in screenshots" :key="shot.id" class="border border-border">
          <img
            :src="shot.thumbUrl"
            alt=""
            loading="lazy"
            class="aspect-video w-full bg-surface-alt object-cover"
            :class="shot.isHidden ? 'opacity-35' : ''"
          />
          <div class="flex items-center justify-between gap-2 px-2 py-1.5">
            <span>
              <button type="button" class="kicker px-1 hover:text-text" :disabled="shotBusy || index === 0" aria-label="Move earlier" @click="moveShot(index, -1)">←</button>
              <button type="button" class="kicker px-1 hover:text-text" :disabled="shotBusy || index === screenshots.length - 1" aria-label="Move later" @click="moveShot(index, 1)">→</button>
            </span>
            <span class="flex items-center gap-3">
              <button type="button" class="kicker hover:text-text" :disabled="shotBusy" @click="setShotHidden(shot)">
                {{ shot.isHidden ? 'Show' : 'Hide' }}
              </button>
              <ConfirmButton
                v-if="shot.source === 'upload'"
                confirm-label="Sure?"
                :disabled="shotBusy"
                @confirm="removeShot(shot)"
              />
            </span>
          </div>
        </li>
      </ul>
    </section>
  </template>
</template>
