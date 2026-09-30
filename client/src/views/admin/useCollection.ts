import { ref, shallowRef } from 'vue';
import { api, errorMessage } from '../../api/client';

/**
 * The admin side of one hand-ordered collection — the client half of the
 * server's `adminCollectionController`. Load, reorder by moving a row up or
 * down, toggle published, delete.
 */
export function useCollection<T extends { id: string; isPublished: boolean }>(
  path: string,
  key: string,
) {
  const items = shallowRef<T[]>([]);
  const loading = ref(true);
  const error = ref('');
  const busy = ref(false);

  async function load() {
    error.value = '';
    try {
      items.value = (await api.get<Record<string, T[]>>(`/api/admin/${path}`))[key] ?? [];
    } catch (e) {
      error.value = errorMessage(e);
    } finally {
      loading.value = false;
    }
  }

  async function move(id: string, direction: -1 | 1) {
    const index = items.value.findIndex((item) => item.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= items.value.length) return;
    const ids = items.value.map((item) => item.id);
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    await reorder(ids);
  }

  /** Writes a whole new order — every id, as the server's reorder route requires. */
  async function reorder(ids: string[]) {
    await run(async () => {
      items.value = (
        await api.put<Record<string, T[]>>(`/api/admin/${path}/order`, { ids })
      )[key] ?? [];
    });
  }

  async function setPublished(id: string, isPublished: boolean) {
    await run(async () => {
      const { item } = await api.put<{ item: T }>(`/api/admin/${path}/${id}`, { isPublished });
      items.value = items.value.map((row) => (row.id === id ? item : row));
    });
  }

  async function remove(id: string) {
    await run(async () => {
      await api.delete(`/api/admin/${path}/${id}`);
      items.value = items.value.filter((row) => row.id !== id);
    });
  }

  async function create(body: Partial<T>): Promise<T | null> {
    let created: T | null = null;
    await run(async () => {
      created = (await api.post<{ item: T }>(`/api/admin/${path}`, body)).item;
      items.value = [...items.value, created];
    });
    return created;
  }

  async function update(id: string, body: Partial<T>): Promise<T | null> {
    let updated: T | null = null;
    await run(async () => {
      updated = (await api.put<{ item: T }>(`/api/admin/${path}/${id}`, body)).item;
      items.value = items.value.map((row) => (row.id === id ? updated! : row));
    });
    return updated;
  }

  async function run(work: () => Promise<void>) {
    error.value = '';
    busy.value = true;
    try {
      await work();
    } catch (e) {
      error.value = errorMessage(e);
    } finally {
      busy.value = false;
    }
  }

  return { items, loading, error, busy, load, move, reorder, setPublished, remove, create, update };
}
