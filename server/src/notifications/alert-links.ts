import { listUnsubscribeHeaders } from '../map-client/unsubscribe-link';
import type { SubscriberEntity } from '../subscribers/subscriber.entity';

/**
 * The two footer links and the `List-Unsubscribe` headers for one subscriber.
 *
 * - `unsubscribeUrl` ("Unsubscribe from <Brand>") is MAP's signed link, which
 *   stops every opt-out-able email from the brand — or, for a subscriber with
 *   no MAP `sub` (or when MAP could not sign one), this list's own page, so
 *   the placeholder is always filled.
 * - `stopAlertsUrl` ("Stop these alerts") is always this list's own page.
 * - The one-click header (RFC 8058) is MAP's link when there is one, and
 *   otherwise the API's POST route, which performs it; the link a person
 *   clicks in the body goes to the page, which asks first. See
 *   `unsubscribe.controller.ts` for why a GET never unsubscribes.
 */
export function alertLinks(
  siteUrl: string,
  subscriber: Pick<SubscriberEntity, 'unsubscribeToken'>,
  mapLink: string | null,
): {
  unsubscribeUrl: string;
  stopAlertsUrl: string;
  headers: Record<string, string>;
} {
  const stopAlertsUrl = `${siteUrl}/unsubscribe/${subscriber.unsubscribeToken}`;
  return {
    unsubscribeUrl: mapLink ?? stopAlertsUrl,
    stopAlertsUrl,
    headers: listUnsubscribeHeaders(
      mapLink ?? `${siteUrl}/api/unsubscribe/${subscriber.unsubscribeToken}`,
    ),
  };
}
