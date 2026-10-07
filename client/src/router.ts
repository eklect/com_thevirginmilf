import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import type { PageKey } from './api/types';
import { useAuthStore } from './stores/auth';
import { useSiteStore } from './stores/site';

declare module 'vue-router' {
  interface RouteMeta {
    /** The page toggle that governs this route. */
    pageKey?: PageKey;
    /** Renders alone, with no masthead or footer — sign-in and sign-up. */
    bleed?: boolean;
    /** Only for people who are not signed in. */
    anonymousOnly?: boolean;
    /** Any signed-in reader. */
    requiresAuth?: boolean;
    /** The admin dashboard. */
    requiresAdmin?: boolean;
    /**
     * Moving within this one route record leaves the scroll position alone —
     * opening a stream's dialog must not throw the calendar back to the top.
     */
    keepScroll?: boolean;
    title?: string;
  }
}

const routes: RouteRecordRaw[] = [
  { path: '/', component: () => import('./views/Home.vue'), meta: { pageKey: 'home' } },

  /**
   * `/streams/:id` is the SAME view as `/streams` — one record with an
   * optional param, so opening and closing the dialog reuses the mounted
   * calendar instead of rebuilding it — with that stream's dialog open over
   * the calendar. It is what an email or a notification links to,
   * and what a signed-out visitor is returned to after MAP — so the page they
   * come back to is the stream they asked about, with its link now showing.
   */
  {
    path: '/streams/:id?',
    component: () => import('./views/Streams.vue'),
    meta: { pageKey: 'streams', title: 'Streams', keepScroll: true },
  },
  {
    path: '/live',
    component: () => import('./views/Live.vue'),
    meta: { pageKey: 'live', title: 'Live' },
  },

  /** `category/:slug` is declared before `:slug` so the literal wins. */
  {
    path: '/games',
    component: () => import('./views/Games.vue'),
    meta: { pageKey: 'games', title: 'Games' },
  },
  {
    path: '/games/category/:category',
    component: () => import('./views/Games.vue'),
    meta: { pageKey: 'games', title: 'Games' },
  },
  {
    path: '/games/:slug',
    component: () => import('./views/GameDetail.vue'),
    meta: { pageKey: 'games', title: 'Games' },
  },
  {
    path: '/favorites',
    component: () => import('./views/Favorites.vue'),
    meta: { pageKey: 'favorites', title: 'Favorites' },
  },
  {
    path: '/links',
    component: () => import('./views/Links.vue'),
    meta: { pageKey: 'links', title: 'Links' },
  },
  {
    path: '/about',
    component: () => import('./views/About.vue'),
    meta: { pageKey: 'about', title: 'About' },
  },
  {
    path: '/privacy',
    component: () => import('./views/Privacy.vue'),
    meta: { pageKey: 'privacy', title: 'Privacy' },
  },

  {
    path: '/signin',
    component: () => import('./views/SignIn.vue'),
    meta: { bleed: true, anonymousOnly: true, title: 'Sign in' },
  },
  {
    path: '/signup',
    component: () => import('./views/SignUp.vue'),
    meta: { pageKey: 'signup', bleed: true, anonymousOnly: true, title: 'Sign up' },
  },
  {
    path: '/account',
    component: () => import('./views/Account.vue'),
    meta: { pageKey: 'settings', requiresAuth: true, title: 'Account' },
  },
  /**
   * Deliberately NOT behind `requiresAuth`, and deliberately not gated on a
   * page toggle: somebody clicking unsubscribe in an email is very often not
   * signed in, and may not have an account at all. See
   * `server/src/subscribers/unsubscribe.controller.ts`.
   */
  {
    path: '/unsubscribe/:token',
    component: () => import('./views/Unsubscribe.vue'),
    meta: { title: 'Email preferences' },
  },

  {
    path: '/admin',
    component: () => import('./views/admin/AdminLayout.vue'),
    meta: { requiresAdmin: true, title: 'Admin' },
    redirect: '/admin/streams',
    children: [
      { path: 'streams', component: () => import('./views/admin/Streams.vue') },
      { path: 'streams/new', component: () => import('./views/admin/StreamEdit.vue') },
      { path: 'streams/:id', component: () => import('./views/admin/StreamEdit.vue') },
      { path: 'channels', component: () => import('./views/admin/Channels.vue') },
      { path: 'channels/new', component: () => import('./views/admin/ChannelEdit.vue') },
      { path: 'channels/:id', component: () => import('./views/admin/ChannelEdit.vue') },
      { path: 'games', component: () => import('./views/admin/Games.vue') },
      { path: 'games/new', component: () => import('./views/admin/GameEdit.vue') },
      { path: 'games/:id', component: () => import('./views/admin/GameEdit.vue') },
      { path: 'games/:id/reviews/new', component: () => import('./views/admin/ReviewEdit.vue') },
      { path: 'categories', component: () => import('./views/admin/Categories.vue') },
      { path: 'categories/new', component: () => import('./views/admin/CategoryEdit.vue') },
      { path: 'categories/:id', component: () => import('./views/admin/CategoryEdit.vue') },
      { path: 'reviews', component: () => import('./views/admin/Reviews.vue') },
      { path: 'reviews/:reviewId', component: () => import('./views/admin/ReviewEdit.vue') },
      { path: 'steam', component: () => import('./views/admin/Steam.vue') },
      { path: 'images', component: () => import('./views/admin/Images.vue') },
      { path: 'subscribers', component: () => import('./views/admin/Subscribers.vue') },
      { path: 'pages', component: () => import('./views/admin/Pages.vue') },
      { path: 'site', component: () => import('./views/admin/SiteSettings.vue') },
      { path: 'api-access', component: () => import('./views/admin/ApiAccess.vue'), meta: { title: 'API access' } },
    ],
  },

  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('./views/NotFound.vue'),
    meta: { title: 'Not found' },
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, saved) {
    if (saved) return saved;
    if (to.meta.keepScroll && to.matched[0] === from.matched[0]) return false;
    if (to.hash) return { el: to.hash, behavior: 'smooth' };
    return { top: 0 };
  },
});

/**
 * These checks are convenience, not security.
 *
 * Every one of them is re-made on the server — `MapSessionGuard` and
 * `RolesGuard` run on every request and `PageEnabledGuard` 404s a switched-off
 * route. This exists so somebody does not watch an admin screen render and
 * then fill with errors.
 */
router.beforeEach(async (to) => {
  const auth = useAuthStore();
  const site = useSiteStore();
  await Promise.all([auth.ensureResolved(), site.ensureLoaded()]);

  // A switched-off page is a 404 for everyone but an admin, who can still see
  // what they are editing. Rendered in place, so the URL stays what was typed.
  if (to.meta.pageKey && !site.isEnabled(to.meta.pageKey) && !auth.isAdmin) {
    return {
      name: 'not-found',
      params: { pathMatch: to.path.slice(1).split('/') },
      query: to.query,
      hash: to.hash,
      replace: true,
    };
  }

  if (to.meta.anonymousOnly && auth.user) return '/';

  if (to.meta.requiresAuth && !auth.user) {
    auth.startLogin(to.fullPath);
    return false;
  }

  if (to.meta.requiresAdmin) {
    if (!auth.user) {
      auth.startLogin(to.fullPath);
      return false;
    }
    if (!auth.isAdmin) return '/';
  }

  return true;
});

router.afterEach((to) => {
  const site = useSiteStore();
  const name = site.siteName;
  document.title = to.meta.title ? `${to.meta.title} · ${name}` : name;
});
