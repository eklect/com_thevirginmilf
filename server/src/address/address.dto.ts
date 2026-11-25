import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * A whole physical address, as the form holds it. The limits are MAP's
 * (`ADDRESS_LIMITS` in com_mucciandco_map), repeated here so a value that
 * cannot be stored is refused before it is sent. A part left out or empty is
 * cleared: a save replaces the address, it does not patch it.
 */
export class AddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(trim)
  line1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(trim)
  line2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(trim)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(trim)
  region?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Transform(trim)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @Matches(/^$|^[A-Za-z]{2}$/, { message: 'The country is a two-letter code, like US' })
  @Transform(trim)
  country?: string;
}
