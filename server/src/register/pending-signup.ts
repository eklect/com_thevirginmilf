import type { SocialProviderKey } from '../auth/social-providers';

/**
 * A signup started with a provider button instead of a password.
 *
 * The form's fields minus the password, sealed into the OAuth transaction
 * cookie by `POST /api/register/social` and read back by the callback once MAP
 * has created the identity. The stream-alerts preference and the welcome —
 * what the password path does after `users:provision` — happen then, in
 * `RegisterService.completeSocial`.
 */
export interface PendingSignup {
  provider: SocialProviderKey;
  firstName: string;
  lastName: string;
  /** The form's "email me when there is a stream" box. Absent reads as not ticked. */
  emailAlerts?: boolean;
}
