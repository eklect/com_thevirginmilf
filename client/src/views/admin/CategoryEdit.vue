<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { api, errorMessage } from '../../api/client';
import type { AdminCategory } from '../../api/types';
import { useSaveNotice } from './useSaveNotice';

const route = useRoute();
const router = useRouter();
const id = route.params.id as string | undefined;

const form = ref({ name: '', slug: '', description: '', isPublished: true });
const error = ref('');
const busy = ref(false);

// This view returns to /admin/categories on success, so the confirmation has
// to be said there rather than on a form that is already unmounting.
const { flashSaved, clearNotice } = useSaveNotice();

onMounted(async () => {
  if (!id) return;
  try {
    const { item } = await api.get<{ item: AdminCategory }>(`/api/admin/categories/${id}`);
    form.value = {
      name: item.name,
      slug: item.slug,
      description: item.description ?? '',
      isPublished: item.isPublished,
    };
  } catch (e) {
    error.value = errorMessage(e);
  }
});

async function save() {
  error.value = '';
  clearNotice();
  busy.value = true;
  try {
    // Exactly the fields the DTO declares. A blank slug on a new category is
    // left out, and the server makes one from the name.
    const body = {
      name: form.value.name,
      ...(form.value.slug.trim() ? { slug: form.value.slug.trim() } : {}),
      description: form.value.description || null,
      isPublished: form.value.isPublished,
    };
    if (id) await api.put(`/api/admin/categories/${id}`, body);
    else await api.post('/api/admin/categories', body);
    flashSaved(id ? 'Category saved.' : 'Category created.', '/admin/categories');
    void router.push('/admin/categories');
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <h1 class="display text-4xl">{{ id ? 'Edit category' : 'New category' }}</h1>
  <p v-if="error" class="notice-error mt-5">{{ error }}</p>

  <form class="mt-7 max-w-md space-y-5" @submit.prevent="save">
    <div>
      <label for="name" class="kicker block">Name</label>
      <input id="name" v-model="form.name" type="text" required maxlength="80" class="input mt-1.5" />
    </div>
    <div>
      <label for="slug" class="kicker block">Address{{ id ? '' : ' (optional)' }}</label>
      <input
        id="slug"
        v-model="form.slug"
        type="text"
        :required="Boolean(id)"
        pattern="[a-z0-9]+(-[a-z0-9]+)*"
        maxlength="96"
        class="input mt-1.5"
      />
      <p class="mt-1.5 text-xs text-muted">
        The end of its URL: /games/category/<strong>{{ form.slug || 'made-from-the-name' }}</strong>.
        Lowercase letters, digits and hyphens.
      </p>
    </div>
    <div>
      <label for="description" class="kicker block">Description (optional)</label>
      <textarea id="description" v-model="form.description" rows="3" maxlength="500" class="input mt-1.5"></textarea>
    </div>
    <label class="flex cursor-pointer items-center gap-2.5 text-sm">
      <input v-model="form.isPublished" type="checkbox" class="size-4 accent-[var(--accent)]" /> Published
    </label>

    <div class="flex items-center gap-5">
      <button type="submit" :disabled="busy" class="btn">{{ busy ? 'Saving…' : 'Save' }}</button>
      <RouterLink to="/admin/categories" class="kicker no-underline hover:text-text">Cancel</RouterLink>
    </div>
  </form>
</template>
