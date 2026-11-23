import { computed, ref, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue';
import { nextDir, sortRows, type SortDir, type SortValue } from '../lib/table-sort';

/**
 * Sorting for one admin table. Two shapes share the header control
 * (`SortButton.vue`):
 *
 *  - `useSortableTable` sorts rows already in the browser.
 *  - `useServerSort` only holds the choice; the view sends `params` to an API
 *    that pages, so a sort orders every row and then pages.
 *
 * Each table's choice is remembered per viewer in localStorage under
 * `table-sort:1:<scope>`. Storage can be missing or throw (private windows,
 * blocked site data); then the table simply starts unsorted.
 */

export interface SortState {
  sortKey: Ref<string | null>;
  sortDir: Ref<SortDir | null>;
  /** True while a column sort is applied (not the list's own order). */
  isSorted: Ref<boolean>;
  toggle: (key: string) => void;
  clear: () => void;
  /** For `:aria-sort` on the header cell. */
  ariaSort: (key: string) => 'ascending' | 'descending' | 'none';
  dirOf: (key: string) => SortDir | null;
}

const STORAGE_PREFIX = 'table-sort:1:';

function readStored(scope: string | undefined): { key: string; dir: SortDir } | null {
  if (!scope) return null;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + scope);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { key?: unknown; dir?: unknown };
    if (typeof parsed.key === 'string' && (parsed.dir === 'asc' || parsed.dir === 'desc')) {
      return { key: parsed.key, dir: parsed.dir };
    }
  } catch {
    /* unreadable storage: start unsorted */
  }
  return null;
}

function writeStored(scope: string | undefined, key: string | null, dir: SortDir | null) {
  if (!scope) return;
  try {
    if (key && dir) localStorage.setItem(STORAGE_PREFIX + scope, JSON.stringify({ key, dir }));
    else localStorage.removeItem(STORAGE_PREFIX + scope);
  } catch {
    /* storage refused: the sort still works for this visit */
  }
}

function sortState(
  allowed: (key: string) => boolean,
  options: { storageKey?: string; initial?: { key: string; dir: SortDir } | null },
): SortState {
  const stored = readStored(options.storageKey);
  const start = stored && allowed(stored.key) ? stored : (options.initial ?? null);
  const sortKey = ref<string | null>(start?.key ?? null);
  const sortDir = ref<SortDir | null>(start?.dir ?? null);

  function set(key: string | null, dir: SortDir | null) {
    sortKey.value = dir ? key : null;
    sortDir.value = dir ? dir : null;
    writeStored(options.storageKey, sortKey.value, sortDir.value);
  }

  return {
    sortKey,
    sortDir,
    isSorted: computed(() => sortKey.value !== null && sortDir.value !== null),
    toggle(key) {
      set(key, nextDir(sortKey.value === key ? sortDir.value : null));
    },
    clear() {
      set(null, null);
    },
    ariaSort(key) {
      if (sortKey.value !== key || !sortDir.value) return 'none';
      return sortDir.value === 'asc' ? 'ascending' : 'descending';
    },
    dirOf(key) {
      return sortKey.value === key ? sortDir.value : null;
    },
  };
}

/**
 * Sorts `rows` in the browser by the accessor named in `columns`. Unsorted
 * means the order the API returned — for a hand-ordered list, its stored order.
 */
export function useSortableTable<T>(
  rows: MaybeRefOrGetter<readonly T[]>,
  columns: Record<string, (row: T) => SortValue>,
  options: { storageKey?: string } = {},
) {
  const state = sortState((key) => key in columns, options);
  const sorted = computed<T[]>(() => {
    const list = toValue(rows);
    const accessor = state.sortKey.value ? columns[state.sortKey.value] : undefined;
    if (!accessor || !state.sortDir.value) return [...list];
    return sortRows(list, accessor, state.sortDir.value);
  });
  return { ...state, sorted };
}

/**
 * Holds the sort for a list the server pages. `params` is what to add to the
 * request (`{}` when unsorted, so the API keeps its default order); `onChange`
 * runs after every change, typically "go back to page 1 and reload".
 */
export function useServerSort(
  keys: readonly string[],
  options: { storageKey?: string; onChange?: () => void } = {},
) {
  const state = sortState((key) => keys.includes(key), options);
  const params = computed<{ sort?: string; dir?: SortDir }>(() =>
    state.sortKey.value && state.sortDir.value ? { sort: state.sortKey.value, dir: state.sortDir.value } : {},
  );
  /** `&sort=…&dir=…` to append to a query string that already has a `?`, or ''. */
  const query = computed(() => {
    const p = params.value;
    return p.sort && p.dir ? `&sort=${encodeURIComponent(p.sort)}&dir=${p.dir}` : '';
  });
  if (options.onChange) watch(params, options.onChange);
  return { ...state, params, query };
}
