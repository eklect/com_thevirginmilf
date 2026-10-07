import { OmitType } from '@nestjs/mapped-types';
import { IsIn } from 'class-validator';

import { CreateRegisterDto } from './create-register.dto';
import { SOCIAL_PROVIDER_KEYS } from '../../auth/social-providers';
import type { SocialProviderKey } from '../../auth/social-providers';

/**
 * The signup form, sent when a provider button is pressed instead of the
 * submit button: everything `CreateRegisterDto` wants except the password,
 * which the provider stands in for, plus which provider.
 *
 * The email is still required and validated — the person typed it — but the
 * account's address will be whatever the provider asserts; see
 * `RegisterService.completeSocial`.
 */
export class SocialRegisterDto extends OmitType(CreateRegisterDto, [
  'password',
] as const) {
  @IsIn(SOCIAL_PROVIDER_KEYS, { message: 'Choose a sign-in provider' })
  provider: SocialProviderKey;
}
