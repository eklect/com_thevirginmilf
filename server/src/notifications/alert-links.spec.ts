import { alertLinks } from './alert-links';

describe('alertLinks (stream alert footer + List-Unsubscribe)', () => {
  const site = 'https://site.test';
  const subscriber = { unsubscribeToken: 'tok' };

  it('a subscriber with a MAP sub: MAP link in the footer and both headers, the list page as the second link', () => {
    const map = 'https://map.test/unsubscribe/slug/sub/sig';
    expect(alertLinks(site, subscriber, map)).toEqual({
      unsubscribeUrl: map,
      stopAlertsUrl: 'https://site.test/unsubscribe/tok',
      headers: {
        'List-Unsubscribe': `<${map}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
  });

  it('no MAP link: both footer links are the list page, the header the API route as before', () => {
    expect(alertLinks(site, subscriber, null)).toEqual({
      unsubscribeUrl: 'https://site.test/unsubscribe/tok',
      stopAlertsUrl: 'https://site.test/unsubscribe/tok',
      headers: {
        'List-Unsubscribe': '<https://site.test/api/unsubscribe/tok>',
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
  });
});
