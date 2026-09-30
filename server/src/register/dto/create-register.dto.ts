import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * What the signup form sends. Everything but `emailAlerts` goes to MAP, which
 * owns identity.
 *
 * Notably absent: `roles`. MAP forces every new account to a plain user
 * regardless, and accepting the field at all would invite the idea that it
 * meant something.
 */
export class CreateRegisterDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Transform(trim)
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Transform(trim)
  lastName: string;

  @IsEmail({}, { message: 'A valid email address is required' })
  @MaxLength(255)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;

  /**
   * 12 characters minimum — MAP's rule, repeated here so the form gets a
   * field-level error instead of a relayed failure. The signup page enforces
   * the same number client-side; keep the three in step.
   */
  @IsString()
  @MinLength(12, { message: 'Password must be at least 12 characters' })
  @MaxLength(256)
  password: string;

  /**
   * The form's "email me when she streams" checkbox. The only field that
   * stays here: it becomes the person's `subscribers` row. Absent reads as
   * not ticked — consent is never assumed from a missing field.
   */
  @IsOptional()
  @IsBoolean()
  emailAlerts?: boolean;
}
