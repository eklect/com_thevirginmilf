import { api } from '../api/client';

/**
 * Browser notifications — everything the account page needs, in one place.
 *
 * ## The one rule: nothing here runs until somebody clicks
 *
 * `enablePush` is the only function that asks for permission or registers the
 * service worker, and it is only ever called from a click handler. A
 * permission prompt on page load is refused by Safari outright and is how a
 * site gets "Block" for good from everybody else — and a denied permission
 * cannot be asked for again, only changed in browser settings.
 *
 * The service worker it registers is push-only: see `public/sw.js`.
 */

export type PushSupport =
  /** The server has no VAPID key — hide the control entirely. */
  | 'unavailable'
  | 'supported'
  /** An iPhone or iPad in a browser tab. Push works once the site is on the Home Screen. */
  | 'ios-needs-install'
  | 'unsupported';

export class PushError extends Error {
  constructor(
    readonly reason: 'denied' | 'dismissed' | 'failed',
    message: string,
  ) {
    super(message);
  }
}

const WORKER_URL = '/sw.js';

export function pushSupport(publicKey: string): PushSupport {
  if (!publicKey) return 'unavailable';
  if (typeof window === 'undefined') return 'unsupported';
  if ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) {
    return 'supported';
  }
  // iOS only exposes the Push API to a site opened from the Home Screen. In a
  // Safari tab the three checks above simply fail, which would read as "your
  // phone cannot do this" when the truth is "install it first".
  const ua = navigator.userAgent;
  const isIos =
    /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  return isIos ? 'ios-needs-install' : 'unsupported';
}

export function pushPermission(): NotificationPermission {
  return typeof Notification === 'undefined' ? 'default' : Notification.permission;
}

/** This browser's subscription, if it has one. Never prompts, never registers. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration('/');
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/**
 * Turns notifications on for this browser. Call it from a click.
 *
 * `Notification.requestPermission()` is the FIRST await, deliberately: Safari
 * only honours it inside the user gesture, and anything awaited before it —
 * registering the worker, say — ends the gesture.
 */
export async function enablePush(publicKey: string): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission === 'denied') {
    throw new PushError(
      'denied',
      'Notifications are blocked for this site. Allow them in your browser’s site settings, then try again.',
    );
  }
  if (permission !== 'granted') {
    throw new PushError('dismissed', 'Notifications were not allowed, so nothing was switched on.');
  }

  try {
    // `updateViaCache: 'none'` so an update check always goes to the network.
    await navigator.serviceWorker.register(WORKER_URL, { scope: '/', updateViaCache: 'none' });
    const registration = await navigator.serviceWorker.ready;

    const key = decodeKey(publicKey);
    let subscription = await registration.pushManager.getSubscription();
    // A subscription made under a different server key can never be delivered
    // to — that is what rotating the VAPID pair leaves behind. Replace it.
    if (subscription && !sameKey(subscription.options.applicationServerKey, key)) {
      await subscription.unsubscribe();
      subscription = null;
    }
    subscription ??= await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    });
    await save(subscription);
  } catch (error) {
    if (error instanceof PushError) throw error;
    throw new PushError(
      'failed',
      error instanceof Error && error.message
        ? `Notifications could not be switched on: ${error.message}`
        : 'Notifications could not be switched on. Try again.',
    );
  }
}

/** Turns notifications off for this browser, here and on the server. */
export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await api.post('/api/account/push-subscriptions/remove', { endpoint: subscription.endpoint });
  await subscription.unsubscribe();
}

/**
 * Re-sends an existing subscription, quietly. Heals a row the server lost, and
 * moves the subscription to whoever is signed in now on a shared browser.
 * Does nothing — and asks for nothing — if this browser has no subscription.
 */
export async function resyncPush(): Promise<boolean> {
  if (pushPermission() !== 'granted') return false;
  const subscription = await currentSubscription();
  if (!subscription) return false;
  await save(subscription);
  return true;
}

/** Only the two fields the server's DTO declares; it refuses unknown keys. */
async function save(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON();
  await api.post('/api/account/push-subscriptions', {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
  });
}

/** A VAPID public key is URL-safe base64; `subscribe` wants the raw bytes. */
function decodeKey(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function sameKey(existing: ArrayBuffer | null, wanted: Uint8Array): boolean {
  if (!existing) return false;
  const current = new Uint8Array(existing);
  return current.length === wanted.length && current.every((byte, i) => byte === wanted[i]);
}
