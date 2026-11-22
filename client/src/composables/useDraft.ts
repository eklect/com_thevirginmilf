import {
  getCurrentScope,
  isRef,
  onScopeDispose,
  reactive,
  ref,
  toValue,
  watch,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue';
import { hashFields, readDraft, removeDraft, writeDraft } from '../lib/drafts';

/**
 * Keeps what somebody is writing in this browser until it is saved.
 *
 * The same file in every Mucci & Co client; `lib/drafts.ts` is the storage
 * half. A view adopts it in three lines:
 *
 * ```ts
 * const draft = useDraft(() => `post:${id.value ?? 'new'}`, form, ['excerpt', 'body'], { ready: loaded });
 * // after the save succeeds, before any redirect:
 * draft.clear();
 * // in the template, above the form:
 * // <DraftNotice :draft="draft" />
 * ```
 *
 * ## Why the view and not the editor
 *
 * Only the view knows when the record has loaded and when the save went
 * through, and those two moments are the whole design. It also means a rich
 * editor and a plain text box are covered by the same call.
 *
 * ## The baseline
 *
 * When `ready` turns true the listed fields are snapshotted. That snapshot is
 * what "nothing to save" means: text equal to it, or empty, removes the stored
 * draft instead of writing one, so opening an edit form and leaving never
 * leaves a draft behind.
 *
 * ## Coming back
 *
 * Decided once, at that same moment:
 *
 * - a draft started from this same saved text is put back at once, and the
 *   notice says so and offers Discard;
 * - a draft started from an older version of the record is NOT put back. The
 *   notice offers it (`stale`), and the person chooses.
 *
 * ## `clear()` is not optional
 *
 * Call it after every successful save. A create form that skips it shows the
 * draft again the next time somebody opens "New".
 */
export interface DraftOptions<Field extends string = string> {
  /** False until the record has loaded. Default: ready at once. */
  ready?: MaybeRefOrGetter<boolean>;
  /** True switches drafts off, e.g. while viewing somebody else's account read-only. */
  disabled?: MaybeRefOrGetter<boolean>;
  /** Fields whose value is not a string (an editor's JSON document). */
  json?: Field[];
  debounceMs?: number;
}

export interface DraftHandle {
  /** Set when a stored draft was found. `stale`: it was written against an older version and has not been applied. */
  notice: { at: number; stale: boolean } | null;
  /** Put a stale draft into the form. */
  apply(): void;
  /** Throw the draft away, and take a restored one back out of the form. */
  discard(): void;
  /** Keep what is in the form and stop mentioning it. */
  dismiss(): void;
  /** The save went through: forget the draft and treat the form as the new saved text. */
  clear(): void;
}

interface FieldAccess {
  read(): Record<string, string>;
  /** Puts draft text into the form. */
  write(fields: Record<string, string>): void;
  /** Remembers the form as it stands, and returns how to put it back. */
  capture(): () => void;
}

function createDraft(
  scope: MaybeRefOrGetter<string | null | undefined>,
  access: FieldAccess,
  options: DraftOptions,
): DraftHandle {
  const notice = ref<DraftHandle['notice']>(null);
  const delay = options.debounceMs ?? 500;

  /** The scope the running draft is stored under; null while not running. */
  let active: string | null = null;
  let baseline: Record<string, string> = {};
  let restoreBaseline: () => void = () => {};
  let pending: Record<string, string> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** Text this code just put into the form. Seeing it there is not somebody typing. */
  let placed: Record<string, string> | null = null;

  const same = (a: Record<string, string>, b: Record<string, string>): boolean =>
    Object.keys(a).every((name) => a[name] === b[name]);
  const blank = (fields: Record<string, string>): boolean =>
    Object.values(fields).every((text) => text.trim() === '' || text === 'null');

  function cancelTimer(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  function rebase(): void {
    baseline = access.read();
    restoreBaseline = access.capture();
  }

  function store(): void {
    cancelTimer();
    if (active === null) return;
    const current = access.read();
    if (same(current, baseline) || blank(current)) removeDraft(active);
    else writeDraft(active, current, hashFields(baseline));
  }

  function start(name: string, restore: boolean): void {
    cancelTimer();
    active = name;
    pending = null;
    notice.value = null;
    rebase();
    if (!restore) return;

    const found = readDraft(name);
    if (!found) return;
    // Only the fields this form still has; a renamed field is not resurrected.
    const fields: Record<string, string> = { ...baseline };
    for (const field of Object.keys(baseline)) {
      if (typeof found.fields[field] === 'string') fields[field] = found.fields[field];
    }
    if (same(fields, baseline) || blank(fields)) {
      removeDraft(name);
      return;
    }
    if (found.base === hashFields(baseline)) {
      placed = fields;
      access.write(fields);
      notice.value = { at: found.at, stale: false };
    } else {
      pending = fields;
      notice.value = { at: found.at, stale: true };
    }
  }

  function stop(): void {
    if (timer !== null) store();
    active = null;
    pending = null;
    notice.value = null;
  }

  const wanted = (): string | null => {
    if (toValue(options.disabled) === true) return null;
    if (options.ready !== undefined && toValue(options.ready) !== true) return null;
    return toValue(scope) || null;
  };

  // A restore is offered when the form becomes ready, not when the scope
  // merely changes under a mounted form: that is a create turning into an
  // edit after its save, and the text in the form is already the saved text.
  watch(
    wanted,
    (next, previous) => {
      if (next === null) stop();
      else if (previous === null || previous === undefined) start(next, true);
      else {
        if (timer !== null) store();
        start(next, false);
      }
    },
    { immediate: true, flush: 'sync' },
  );

  watch(
    () => access.read(),
    (current) => {
      if (active === null) return;
      // Putting a draft back must not rewrite it with a fresh timestamp.
      if (placed && same(current, placed)) return;
      placed = null;
      cancelTimer();
      timer = setTimeout(store, delay);
    },
    { deep: true },
  );

  const flush = (): void => {
    if (timer !== null) store();
  };
  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden') flush();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', flush);
  if (getCurrentScope()) {
    onScopeDispose(() => {
      flush();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
    });
  }

  const handle = reactive({
    notice,
    apply(): void {
      if (!pending) return;
      const at = notice.value?.at ?? Date.now();
      placed = pending;
      access.write(pending);
      pending = null;
      notice.value = { at, stale: false };
    },
    discard(): void {
      cancelTimer();
      if (active !== null) removeDraft(active);
      // A stale draft was never in the form, so there is nothing to take out.
      if (notice.value && !notice.value.stale) restoreBaseline();
      pending = null;
      notice.value = null;
    },
    dismiss(): void {
      // A stale draft that was not wanted is gone for good, or it would be
      // offered again on every visit.
      if (pending && active !== null) removeDraft(active);
      pending = null;
      notice.value = null;
    },
    clear(): void {
      cancelTimer();
      if (active !== null) removeDraft(active);
      pending = null;
      notice.value = null;
      rebase();
    },
  });
  // `reactive` unwraps the ref, which is the shape `DraftHandle` describes.
  return handle as DraftHandle;
}

/**
 * Drafts for the long-text fields of one form.
 *
 * @param scope What is being written, unique within the site for this person:
 *   `post:<id>`, `post:new`, `settings`. Null or empty switches it off.
 * @param form The form object, a `ref` or a `reactive`.
 * @param fields The long-text fields to keep. Leave short fields out.
 */
export function useDraft<F extends object>(
  scope: MaybeRefOrGetter<string | null | undefined>,
  form: Ref<F> | F,
  fields: (keyof F & string)[],
  options: DraftOptions<keyof F & string> = {},
): DraftHandle {
  const target = (): Record<string, unknown> =>
    (isRef(form) ? form.value : form) as Record<string, unknown>;
  const json = new Set<string>(options.json ?? []);

  return createDraft(
    scope,
    {
      read() {
        const source = target();
        const out: Record<string, string> = {};
        for (const field of fields) {
          const value = source[field];
          out[field] = json.has(field)
            ? JSON.stringify(value ?? null)
            : value === null || value === undefined
              ? ''
              : String(value);
        }
        return out;
      },
      write(values) {
        const source = target();
        for (const field of fields) {
          if (!(field in values)) continue;
          if (!json.has(field)) {
            source[field] = values[field];
            continue;
          }
          try {
            source[field] = JSON.parse(values[field]);
          } catch {
            // A document that no longer parses is left out; the rest still applies.
          }
        }
      },
      capture() {
        const source = target();
        const kept = new Map<string, unknown>();
        for (const field of fields) {
          const value = source[field];
          kept.set(field, json.has(field) ? JSON.stringify(value ?? null) : value);
        }
        return () => {
          const current = target();
          for (const field of fields) {
            const value = kept.get(field);
            current[field] = json.has(field) ? JSON.parse(value as string) : value;
          }
        };
      },
    },
    options,
  );
}

/** Drafts for a single text ref: a comment box, a message composer, an inline edit. */
export function useDraftText(
  scope: MaybeRefOrGetter<string | null | undefined>,
  model: Ref<string>,
  options: Omit<DraftOptions, 'json'> = {},
): DraftHandle {
  return createDraft(
    scope,
    {
      read: () => ({ text: model.value ?? '' }),
      write: (values) => {
        model.value = values.text ?? '';
      },
      capture: () => {
        const kept = model.value;
        return () => {
          model.value = kept;
        };
      },
    },
    options,
  );
}
