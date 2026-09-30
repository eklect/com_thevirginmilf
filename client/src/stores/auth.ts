import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api } from '../api/client';
import type { Me } from '../api/types';

/**
 * Who is signed in, as far as the browser knows.
 *
 * This is a MAP relying party, so there is no password form here and no token
 * in the browser. Signing in is a full-page trip: `/api/auth/login` sends the
 * browser to MAP, MAP sends it back to `/api/auth/callback`, and the server
 * sets an httpOnly cookie. All this store does is ask the server who that
 * cookie belongs to.
 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<Me | null>(null);
  /** Distinguishes "not signed in" from "have not asked yet" for route guards. */
  const resolved = ref(false);

  const isAdmin = computed(() => user.value?.isAdmin === true);
  const displayName = computed(() => {
    const me = user.value;
    if (!me) return '';
    return me.displayName || [me.firstName, me.lastName].filter(Boolean).join(' ') || me.email;
  });

  async function refresh(): Promise<Me | null> {
    try {
      user.value = (await api.get<{ user: Me | null }>('/api/auth/me')).user;
    } catch {
      user.value = null;
    } finally {
      resolved.value = true;
    }
    return user.value;
  }

  /** Resolves the session once per page load, not once per guarded navigation. */
  async function ensureResolved(): Promise<Me | null> {
    if (!resolved.value) await refresh();
    return user.value;
  }

  /**
   * A full page navigation, not a router push: MAP must read its own SSO cookie,
   * which only happens on a top-level navigation. Only same-origin paths are
   * passed along, and the server checks that again.
   */
  function startLogin(returnTo = '/'): void {
    const safe = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/';
    window.location.assign(`/api/auth/login?return_to=${encodeURIComponent(safe)}`);
  }

  /**
   * Ends the session here, then sends the browser to MAP to end it there too.
   * The server answers a POST with the URL rather than redirecting a GET — see
   * `AuthController.logout` for why.
   */
  async function logout(allDevices = false): Promise<void> {
    const { redirectTo } = await api.post<{ redirectTo: string }>('/api/auth/logout', {
      allDevices,
    });
    user.value = null;
    window.location.assign(redirectTo);
  }

  return { user, resolved, isAdmin, displayName, refresh, ensureResolved, startLogin, logout };
});
