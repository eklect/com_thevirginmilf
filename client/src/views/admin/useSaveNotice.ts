import { computed, nextTick, ref, watch, type ComputedRef, type Ref } from 'vue';
import { useRoute } from 'vue-router';

/**
 * The admin's "it saved" message, for both shapes of save the admin has.
 *
 * ## Two shapes, because the views end up in two different places
 *
 * `GameEdit.vue`, `ReviewEdit.vue` and `SiteSettings.vue` stay on the form
 * after saving, so their confirmation belongs on that form. `StreamEdit`,
 * `ChannelEdit` and `CategoryEdit` all `router.push` back to their list, so a
 * banner rendered on THEM is painted into a component that is unmounting and
 * nobody ever sees it. Their confirmation has to survive one navigation and appear
 * on the list.
 *
 * Hence `flagSaved` (stay here) and `flashSaved` (say it over there). Both
 * surface through the same `notice`, so every template renders it the same
 * way and a view that changes its mind about navigating does not change how
 * it reports success.
 *
 * ## Why the inline message is pinned to a revision
 *
 * A plain `saved` boolean — which is what `Account.vue` uses for each of its
 * switches — is fine on a control that saves the moment it is flipped and
 * wrong on a long form. A banner still reading "Saved." over a body that has
 * been rewritten since is the failure to avoid: somebody reads the
 * confirmation they expected and leaves with the change unsaved. `Account.vue`
 * keeps the boolean honestly: a switch that saves on toggle cannot go stale
 * under its own message.
 *
 * So the inline message is not a flag, it is an assertion about a specific
 * version of the form. `revision` counts mutations, `savedRevision` records
 * the one that was written, and they stop matching the moment anything is
 * edited. The message retires itself with no timer and no separate dirty flag
 * to keep in step.
 */

/**
 * The pending cross-navigation message.
 *
 * Module scope is the point: it has to outlive the view that set it. It
 * carries the path it was meant for so that a navigation which never lands —
 * a cancelled guard, somebody hitting back mid-save — cannot leave it to
 * ambush an unrelated page later.
 */
const flash = ref<{ message: string; path: string } | null>(null);

export interface SaveNotice {
  /** The message to render, inline or flashed. Empty when there is none. */
  notice: ComputedRef<string>;
  /**
   * Bind to the alert element at the top of the view, on BOTH the error and
   * the notice — they are a `v-if`/`v-else-if` pair, so only one exists at a
   * time and whichever renders claims the ref.
   */
  alertEl: Ref<HTMLElement | null>;
  /**
   * Scroll the page back to the alert. `flagSaved` already calls it; call it
   * yourself after setting an error, which appears in the same place and is
   * just as easy to miss.
   */
  revealAlert: () => Promise<void>;
  /** Confirm on THIS page. Pinned to the form as it stands once it resolves. */
  flagSaved: (message: string) => Promise<void>;
  /** Confirm on the page about to be pushed to. Call it before navigating. */
  flashSaved: (message: string, path: string) => void;
  /** Drop any current message. Call at the top of `save()`. */
  clearNotice: () => void;
}

/**
 * @param form The form to pin an inline message to. Omit it on a view that
 *   only ever flashes or only ever receives — a list, or an editor that
 *   navigates away — and `flagSaved` then has nothing to go stale against.
 */
export function useSaveNotice(form?: Ref<unknown>): SaveNotice {
  const route = useRoute();

  // Claim any flash addressed to where we just landed, and clear it either
  // way: it is a one-shot, so it must not survive into the next view.
  const arrived = ref(flash.value?.path === route.path ? flash.value.message : '');
  flash.value = null;

  const revision = ref(0);
  const savedRevision = ref<number | null>(null);
  const savedMessage = ref('');

  if (form) watch(form, () => revision.value++, { deep: true });

  const notice = computed(() =>
    savedRevision.value !== null && savedRevision.value === revision.value
      ? savedMessage.value
      : arrived.value,
  );

  const alertEl = ref<HTMLElement | null>(null);

  /**
   * Bring the alert to where somebody is actually looking.
   *
   * These forms are taller than a screen. Save from the bottom of `GameEdit`
   * or `SiteSettings` and the banner appears above the fold, so the page looks
   * like it did nothing — worse on the error path than the success one,
   * because there the change really did not save.
   *
   * ## Why the window, and not `scrollIntoView` on the banner
   *
   * Because the obvious version is subtly broken here. `.masthead-bar` is
   * `position: sticky; top: 0` and 67px tall, so aligning the banner's top
   * edge with the viewport's top edge — which is exactly what
   * `scrollIntoView({ block: 'start' })` does — parks it UNDERNEATH the
   * masthead, where it cannot be read. The page visibly moves and the message
   * still is not there.
   *
   * Going to the top of the document sidesteps the overlap entirely, and it
   * is honest for these two views: the alert sits in the first screenful,
   * directly under the page heading, so the top of the document is where it
   * is. Put an alert somewhere else and this needs revisiting.
   *
   * ## `instant`, not `auto`
   *
   * `styles.css` sets `html { scroll-behavior: smooth }`. A programmatic
   * scroll with `behavior: 'auto'` resolves to that CSS value and animates
   * anyway, so `'auto'` would silently ignore `prefers-reduced-motion`.
   * `'instant'` is the one that actually overrides it.
   */
  async function revealAlert(): Promise<void> {
    // The banner renders on the flush after the state that shows it changes.
    await nextTick();
    // Nothing rendered means nothing to reveal — an empty error, say.
    if (!alertEl.value || typeof window === 'undefined') return;
    if (window.scrollY === 0) return;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'instant' : 'smooth' });
  }

  /**
   * `await nextTick()` is load-bearing, not defensive.
   *
   * Saving mutates the form itself — `GameEdit` refills its fields from the
   * server's answer, and `ReviewEdit` writes the stamped date back. The deep
   * watch above runs on the next flush, so capturing `revision` synchronously
   * pins the message to a count those pending mutations are about to
   * increment past, and it never appears at all. Waiting pins it to the
   * revision that INCLUDES them.
   */
  async function flagSaved(message: string): Promise<void> {
    arrived.value = '';
    savedMessage.value = message;
    await nextTick();
    savedRevision.value = revision.value;
    await revealAlert();
  }

  function flashSaved(message: string, path: string): void {
    flash.value = { message, path };
  }

  function clearNotice(): void {
    arrived.value = '';
    savedRevision.value = null;
  }

  return { notice, alertEl, revealAlert, flagSaved, flashSaved, clearNotice };
}
