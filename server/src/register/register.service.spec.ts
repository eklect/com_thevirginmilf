import { ConfigService } from '@nestjs/config';
import type { EnqueueRequest } from '../mail/mail-queue.service';
import { RegisterService } from './register.service';

/** The welcome is opt-out-able: it carries MAP's link and both headers when MAP signs one. */
describe('RegisterService welcome', () => {
  const sub = '01890a5d-ac96-774b-bcce-b302099a8057';
  const config = {
    get: (_name: string, fallback?: string) => fallback,
  } as unknown as ConfigService;

  function build(link: string | null) {
    const mapClient = {
      createUser: jest.fn().mockResolvedValue({ id: sub }),
      unsubscribeLink: jest.fn().mockResolvedValue(link),
      emailPreferencesUrl: 'https://map.test/email-preferences',
    };
    const mailQueue = {
      enqueue: jest
        .fn<Promise<number>, [EnqueueRequest]>()
        .mockResolvedValue(1),
    };
    const fileTemplates = {
      render: jest
        .fn<Promise<null>, [string, Record<string, string>]>()
        .mockResolvedValue(null),
    };
    const service = new RegisterService(
      mapClient as never,
      { seedForNewAccount: jest.fn() } as never,
      mailQueue as never,
      fileTemplates as never,
      { all: jest.fn().mockResolvedValue({ site_name: 'Brand' }) } as never,
      config,
    );
    const signup = () =>
      service.create({
        email: 'ann@example.test',
        password: 'pw',
        firstName: 'Ann',
        lastName: 'O',
        termsAccepted: true,
      });
    return { service, mapClient, mailQueue, fileTemplates, signup };
  }

  it('carries the signed link in the footer and both List-Unsubscribe headers', async () => {
    const link = `https://map.test/unsubscribe/slug/${sub}/sig`;
    const { mailQueue, mapClient, fileTemplates, signup } = build(link);
    await signup();

    expect(mapClient.unsubscribeLink).toHaveBeenCalledWith(sub);
    expect(fileTemplates.render.mock.calls[0][1]).toMatchObject({
      unsubscribeUrl: link,
    });
    const request = mailQueue.enqueue.mock.calls[0][0];
    expect(request.kind).toBe('welcome');
    expect(request.headers).toEqual({
      'List-Unsubscribe': `<${link}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
    expect(request.email.html).toContain(`<a href="${link}"`);
    expect(request.email.text).toContain(`Unsubscribe from Brand: ${link}`);
  });

  it('without a link: no headers, and the footer falls back to the preferences page', async () => {
    const { mailQueue, signup } = build(null);
    await signup();

    const request = mailQueue.enqueue.mock.calls[0][0];
    expect(request.headers).toBeNull();
    expect(request.email.text).toContain(
      'Unsubscribe from Brand: https://map.test/email-preferences',
    );
    expect(request.email.html).not.toContain('{{unsubscribeUrl}}');
  });
});
