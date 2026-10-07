import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * RFC 6749 §4.4, as a body. Every field but `grant_type` is optional because a
 * caller using HTTP Basic sends only the grant type in the body, and the global
 * pipe forbids unknown fields rather than missing ones.
 */
export class OauthTokenDto {
  @IsString()
  @MaxLength(40)
  grant_type: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  client_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  client_secret?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  scope?: string;
}
