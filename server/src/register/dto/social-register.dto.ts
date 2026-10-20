import { OmitType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { CreateRegisterDto } from './create-register.dto';
import { SOCIAL_PROVIDER_KEYS } from '../../auth/social-providers';
import type { SocialProviderKey } from '../../auth/social-providers';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * The signup form, sent when a provider button is pressed instead of the
 * submit button: everything `CreateRegisterDto` wants except the password,
 * which the provider stands in for, plus which provider.
 *
 * The names and email are optional here. A provider button works on an empty
 * form — the provider is the one asserting who the person is — so the callback
 * takes the email from MAP's claims and the names from the form when typed,
 * falling back to the provider's (`given_name`, `family_name`). Anything else
 * the venture's form insists on (the Terms box, a plan, a company name) stays
 * required, because no provider can supply it.
 */
export class SocialRegisterDto extends OmitType(CreateRegisterDto, [
  'password',
  'firstName',
  'lastName',
  'email',
] as const) {
  @IsIn(SOCIAL_PROVIDER_KEYS, { message: 'Choose a sign-in provider' })
  provider: SocialProviderKey;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(trim)
  firstName: string = '';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(trim)
  lastName: string = '';

  /** Accepted so a half-filled form posts cleanly; never used — MAP's claims decide the address. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  email: string = '';
}
