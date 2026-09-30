import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api } from '../api/client';
import type { Bootstrap, Channel, NavNode, PageKey, PageSetting, SiteSettings } from '../api/types';
import { NON_NESTABLE_PAGE_KEYS, SITE_SETTING_KEYS } from '../api/types';

const EMPTY_SETTINGS = Object.fromEntries(
  SITE_SETTING_KEYS.map((key) => [key, '']),
) as SiteSettings;

/**
 * Site-wide state: the settings every page reads, the page toggles the router
 * and the nav consult, the channels the footer and two pages draw, and where
 * MAP's portal is. One request on first load.
 */
export const useSiteStore = defineStore('site', () => {
  const settings = ref<SiteSettings>(EMPTY_SETTINGS);
  const pages = ref<PageSetting[]>([]);
  const channels = ref<Channel[]>([]);
  const mapPortalUrl = ref('');
  const pushPublicKey = ref('');
  const loaded = ref(false);
  const failed = ref(false);

  async function reload(): Promise<void> {
    try {
      const data = await api.get<Bootstrap>('/api/site/bootstrap');
      settings.value = { ...EMPTY_SETTINGS, ...data.settings };
      pages.value = data.pages;
      channels.value = data.channels;
      mapPortalUrl.value = data.mapPortalUrl;
      pushPublicKey.value = data.pushPublicKey;
      failed.value = false;
    } catch {
      // The site still renders with empty settings; pages default to enabled
      // so a hiccup in the API does not 404 the whole site.
      failed.value = true;
    } finally {
      loaded.value = true;
    }
  }

  async function ensureLoaded(): Promise<void> {
    if (!loaded.value) await reload();
  }

  function isEnabled(key: PageKey): boolean {
    const page = pages.value.find((p) => p.key === key);
    return page ? page.enabled : true;
  }

  /**
   * The navigation, as a one-level tree. The header and footer both draw this.
   *
   * `home` is the wordmark, `privacy` is a footer link and `signup`/`settings`
   * sit in the account cluster, so none of the four is ever in here. A node
   * with children becomes a dropdown; one without stays a plain link.
   *
   * ## A sub page whose parent is switched off stands where the group stood
   *
   * That is the one judgement call in here and it is deliberate. The
   * alternative is that switching off *Games* silently takes *Favorites* out
   * of the navigation too, even though *Favorites* is still enabled, still
   * reachable at its own URL, and still reads "Shown" on the admin screen —
   * a page vanishing because of a toggle on a different row, with nothing
   * anywhere to explain it. So `enabled` means one thing and means it
   * everywhere: this page is in the navigation.
   *
   * Which is why the walk below is over SLOTS rather than over enabled pages.
   * A slot is a declared top-level page, switched on or off, and the orphans
   * of a switched-off one are emitted at its slot. Sorting the promoted
   * children in with everything else instead would scatter them: their
   * `sort_order` counts from zero within their parent, so a first child lands
   * at the very front of the nav and its sibling ties with whatever else
   * holds that number.
   */
  const navTree = computed<NavNode[]>(() => {
    const inNav = pages.value.filter((p) => !NON_NESTABLE_PAGE_KEYS.includes(p.key));
    const byKey = new Map(inNav.map((p) => [p.key, p]));
    const ordered = [...inNav].sort((a, b) => a.sortOrder - b.sortOrder);
    const childrenOf = (key: PageKey) =>
      ordered.filter((p) => p.parentKey === key && p.enabled);

    const nodes: NavNode[] = [];
    for (const slot of ordered.filter((p) => !p.parentKey || !byKey.has(p.parentKey))) {
      if (slot.enabled) {
        nodes.push({ page: slot, children: childrenOf(slot.key) });
      } else {
        for (const child of childrenOf(slot.key)) nodes.push({ page: child, children: [] });
      }
    }
    return nodes;
  });

  const siteName = computed(() => settings.value.site_name || 'The Virgin MILF');
  const streamerName = computed(() => settings.value.streamer_name || 'TheVirginMILF');

  /** What the Links page and the footer list. */
  const linkChannels = computed(() => channels.value.filter((channel) => channel.showOnLinks));

  /** Where she broadcasts — what the Live page embeds or links to. */
  const streamChannels = computed(() =>
    channels.value.filter((channel) => channel.isStreamChannel),
  );

  /**
   * Mucci & Co's own site — what the footer's "A Mucci & Co venture" line
   * links to.
   *
   * Derived from MAP's issuer rather than hardcoded, so the dev box links to
   * `mucciandco.test` and production links to `mucciandco.com` without this
   * client needing config of its own. MAP is canonically `map.` + the
   * corporate domain in both environments, so dropping that one label is the
   * whole derivation.
   *
   * Falls back to production when the bootstrap has not landed yet or the
   * issuer is not that shape: a footer link that goes somewhere real beats
   * one that goes nowhere.
   */
  const orgSiteUrl = computed(() => {
    try {
      const url = new URL(mapPortalUrl.value);
      if (url.hostname.startsWith('map.')) {
        url.hostname = url.hostname.slice('map.'.length);
        return url.origin;
      }
    } catch {
      // Empty before the first bootstrap, and `new URL('')` throws.
    }
    return 'https://mucciandco.com';
  });

  return {
    settings,
    pages,
    channels,
    mapPortalUrl,
    pushPublicKey,
    orgSiteUrl,
    loaded,
    failed,
    navTree,
    siteName,
    streamerName,
    linkChannels,
    streamChannels,
    reload,
    ensureLoaded,
    isEnabled,
  };
});
