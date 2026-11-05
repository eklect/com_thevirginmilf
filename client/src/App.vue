<script setup lang="ts">
import { Menu, X } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { RouterLink, RouterView, useRoute } from "vue-router";
import { PAGE_PATHS } from "./api/types";
import BrandMark from "./components/BrandMark.vue";
import NavDropdown from "./components/NavDropdown.vue";
import SiteFooter from "./components/SiteFooter.vue";
import ThemeToggle from "./components/ThemeToggle.vue";
import { useAuthStore } from "./stores/auth";
import { useSiteStore } from "./stores/site";

const route = useRoute();
const auth = useAuthStore();
const site = useSiteStore();

/** Sign-in and sign-up render alone. */
const bare = computed(() => route.meta.bleed === true);
const inAdmin = computed(() => route.path.startsWith("/admin"));

/**
 * The nav collapses into a drawer below `lg`.
 *
 * Six items and the account cluster sit inline on a laptop. On a phone they
 * would either wrap the bar into a second row or shrink past reading size, so
 * below `lg` the bar is the lockup and one button.
 */
const menuOpen = ref(false);
watch(
  () => route.fullPath,
  () => (menuOpen.value = false),
);
</script>

<template>
  <RouterView v-if="bare" />

  <template v-else>
    <header class="masthead-bar">
      <div class="container-page flex h-16 items-center justify-between gap-4">
        <RouterLink to="/" class="text-text no-underline hover:text-text" :aria-label="`${site.siteName} — home`">
          <BrandMark />
        </RouterLink>

        <nav class="hidden items-center gap-x-6 lg:flex" aria-label="Main">
          <NavDropdown v-for="node in site.navTree" :key="node.page.key" :node="node" />
        </nav>

        <!-- Right: the account cluster, then the theme. On a phone only the
             drawer button survives; everything else moves into the drawer. -->
        <div class="flex items-center gap-3">
          <div class="hidden items-center gap-4 lg:flex">
            <template v-if="auth.user">
              <RouterLink v-if="auth.isAdmin" to="/admin" class="kicker no-underline hover:text-text">
                Admin
              </RouterLink>
              <RouterLink
                v-if="site.isEnabled('settings')"
                to="/account"
                class="kicker max-w-[14ch] truncate no-underline hover:text-text"
              >
                {{ auth.displayName }}
              </RouterLink>
              <button type="button" class="kicker hover:text-text" @click="auth.logout(false)">
                Sign out
              </button>
            </template>
            <template v-else>
              <RouterLink to="/signin" class="kicker no-underline hover:text-text">Sign in</RouterLink>
              <RouterLink v-if="site.isEnabled('signup')" to="/signup" class="btn btn-sm">
                Sign up
              </RouterLink>
            </template>
          </div>
          <ThemeToggle class="hidden sm:inline-flex" />
          <button
            type="button"
            class="inline-flex size-9 items-center justify-center border-2 border-rule lg:hidden"
            :aria-expanded="menuOpen"
            aria-controls="site-menu"
            :aria-label="menuOpen ? 'Close the menu' : 'Open the menu'"
            @click="menuOpen = !menuOpen"
          >
            <X v-if="menuOpen" class="size-5" aria-hidden="true" />
            <Menu v-else class="size-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <!--
        The phone drawer, where sub pages are simply indented under their
        parent rather than hidden behind a second tap. There is no hover here
        to open anything with, and the drawer is already a vertical list with
        room to spare, so the whole hierarchy is just shown.
      -->
      <nav
        v-if="menuOpen"
        id="site-menu"
        class="container-page flex flex-col gap-4 border-t-2 border-rule py-6 lg:hidden"
        aria-label="Main"
      >
        <template v-for="node in site.navTree" :key="node.page.key">
          <RouterLink :to="PAGE_PATHS[node.page.key]" class="display text-3xl no-underline">
            {{ node.page.navLabel }}
          </RouterLink>
          <div v-if="node.children.length" class="-mt-2 ml-1 flex flex-col gap-3 border-l-[3px] border-accent pl-4">
            <RouterLink
              v-for="child in node.children"
              :key="child.key"
              :to="PAGE_PATHS[child.key]"
              class="display text-xl no-underline"
            >
              {{ child.navLabel }}
            </RouterLink>
          </div>
        </template>

        <div class="masthead-rule mt-2 flex flex-wrap items-center gap-4 pt-5">
          <template v-if="auth.user">
            <RouterLink v-if="auth.isAdmin" to="/admin" class="kicker no-underline">Admin</RouterLink>
            <RouterLink v-if="site.isEnabled('settings')" to="/account" class="kicker no-underline">
              Account
            </RouterLink>
            <button type="button" class="kicker" @click="auth.logout(false)">Sign out</button>
          </template>
          <template v-else>
            <RouterLink v-if="site.isEnabled('signup')" to="/signup" class="btn btn-sm">Sign up</RouterLink>
            <RouterLink to="/signin" class="kicker no-underline">Sign in</RouterLink>
          </template>
          <ThemeToggle class="ml-auto sm:hidden" />
        </div>
      </nav>
    </header>

    <!--
      No container here, deliberately. Each view composes its own full-width
      bands and holds its contents to the measure with `.band-inner`, which is
      what lets the red slab and the stripes reach the edge of the window.
      Admin is the exception and keeps a plain contained page.
    -->
    <main>
      <RouterView />
    </main>

    <SiteFooter v-if="!inAdmin" />
  </template>
</template>
