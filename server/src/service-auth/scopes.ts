/**
 * What an API key may be granted. A closed list, the same in every venture, so
 * a key issued anywhere reads the same way in the app that holds it.
 *
 * `email-templates:write` covers the images beside the templates: they are the
 * same editor's assets, and a key that can change a template can change what
 * it shows.
 */
export const SERVICE_SCOPES = ['email-templates:read', 'email-templates:write'] as const;
export type ServiceScope = (typeof SERVICE_SCOPES)[number];

export const isServiceScope = (value: string): value is ServiceScope =>
  (SERVICE_SCOPES as readonly string[]).includes(value);
