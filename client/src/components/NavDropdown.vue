<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { PAGE_PATHS, type NavNode } from '../api/types';

/**
 * One item in the header nav: a plain link, or a link with a menu under it.
 *
 * ## The parent stays a link
 *
 * A page with sub pages is still a page. Clicking it goes there; the menu is
 * an extra, not a replacement — which rules out the common shortcut of making
 * the parent a `<button>` that only opens the menu and leaves its own page
 * reachable by nothing.
 *
 * ## Three ways in, because hover is only one of them
 *
 * Hover opens it for a mouse. That is all hover can do: there is no hover on a
 * touch screen and no hover from a keyboard, so on its own it would be a menu
 * that a phone and a Tab key cannot reach.
 *
 *  - **Hover** — `mouseenter` opens, `mouseleave` closes after a beat. The
 *    delay is what makes the diagonal trip from the label down to the third
 *    item survivable; without it, clipping a corner of the gap shuts the menu
 *    mid-movement.
 *  - **Focus** — focus entering the group opens it and focus leaving closes
 *    it, so Tab walks parent → children → next item with nothing to learn.
 *  - **The chevron** — a real `<button>` with `aria-expanded`, which is what a
 *    touch device and a screen reader actually operate. It is why the chevron
 *    is a separate control and not decoration on the link.
 *
 * Escape closes and returns focus to the button, the one keyboard convention
 * worth honouring by hand.
 */
const props = defineProps<{ node: NavNode }>();

const route = useRoute();
const open = ref(false);
const root = ref<HTMLElement | null>(null);
const toggleEl = ref<HTMLButtonElement | null>(null);

let closeTimer = 0;

function show() {
  window.clearTimeout(closeTimer);
  open.value = true;
}

/**
 * The gap between the label and the menu is real — the panel hangs below the
 * bar — so a pointer crossing it briefly leaves the group. Closing on
 * that would make the menu unusable with anything but a perfectly vertical
 * mouse movement.
 */
function hide(delay = 140) {
  window.clearTimeout(closeTimer);
  closeTimer = window.setTimeout(() => (open.value = false), delay);
}

/** Focus moving WITHIN the group is not focus leaving it. */
function onFocusOut(event: FocusEvent) {
  const next = event.relatedTarget;
  if (next instanceof Node && root.value?.contains(next)) return;
  hide(0);
}

function onEscape() {
  if (!open.value) return;
  open.value = false;
  toggleEl.value?.focus();
}

// Following any link in here lands on a new page; the menu has done its job.
watch(() => route.fullPath, () => hide(0));

onBeforeUnmount(() => window.clearTimeout(closeTimer));
</script>

<template>
  <!-- No children: a plain link, exactly as it was before sub pages existed. -->
  <RouterLink
    v-if="!node.children.length"
    :to="PAGE_PATHS[node.page.key]"
    class="kicker no-underline hover:text-text"
    active-class="!text-accent-ink"
    >{{ node.page.navLabel }}</RouterLink
  >

  <div
    v-else
    ref="root"
    class="relative flex items-center gap-1"
    @mouseenter="show"
    @mouseleave="hide()"
    @focusin="show"
    @focusout="onFocusOut"
    @keydown.escape="onEscape"
  >
    <RouterLink
      :to="PAGE_PATHS[node.page.key]"
      class="kicker no-underline hover:text-text"
      active-class="!text-accent-ink"
      >{{ node.page.navLabel }}</RouterLink
    >

    <button
      ref="toggleEl"
      type="button"
      class="kicker leading-none hover:text-text"
      :aria-expanded="open"
      :aria-controls="`nav-menu-${node.page.key}`"
      aria-haspopup="true"
      :aria-label="`${node.page.navLabel} sub pages`"
      @click="open ? hide(0) : show()"
    >
      <!-- A chevron drawn rather than typed, so it sits on the capitals'
           baseline at 11px. -->
      <svg
        class="size-2.5 transition-transform duration-200"
        :class="{ 'rotate-180': open }"
        viewBox="0 0 10 6"
        fill="none"
        aria-hidden="true"
      >
        <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" />
      </svg>
    </button>

    <!-- `top-full` plus a little air hangs this just under the masthead's rule. -->
    <ul
      v-show="open"
      :id="`nav-menu-${node.page.key}`"
      class="panel absolute left-0 top-full z-50 mt-4 min-w-[12rem] py-2"
    >
      <li v-for="child in node.children" :key="child.key">
        <RouterLink
          :to="PAGE_PATHS[child.key]"
          class="kicker block whitespace-nowrap px-4 py-2 no-underline hover:bg-surface-alt hover:text-text"
          active-class="!text-accent-ink"
          >{{ child.navLabel }}</RouterLink
        >
      </li>
    </ul>
  </div>
</template>
