import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { trim, trimToNull } from '../../common/dto';

/**
 * A game entered by hand — a console title, or anything Steam does not know
 * she owns. Only the title is required; everything else can be filled in on
 * the edit screen afterwards.
 */
export class CreateGameDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) title!: string;

  @IsOptional() @Transform(trimToNull) @IsString() @MaxLength(60) platformLabel?: string | null;

  @IsOptional() @Transform(trimToNull) @IsString() @MaxLength(600) summary?: string | null;

  @IsOptional() @Transform(trimToNull) @IsString() @MaxLength(60_000) description?: string | null;

  @IsOptional() @Transform(trimToNull) @IsString() @MaxLength(200) developer?: string | null;

  @IsOptional() @Transform(trimToNull) @IsString() @MaxLength(200) publisher?: string | null;

  @IsOptional() @Transform(trimToNull) @IsString() @MaxLength(60) releaseText?: string | null;

  @IsOptional() @IsUUID() coverUploadId?: string | null;

  @IsOptional() @IsBoolean() isHidden?: boolean;

  @IsOptional() @IsBoolean() isFavorite?: boolean;

  @IsOptional() @IsBoolean() favoritesExcluded?: boolean;

  @IsOptional() @IsInt() @Min(1) @Max(10) rating?: number | null;

  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsUUID('4', { each: true }) categoryIds?: string[];
}

/**
 * Every field optional, and `null` means "clear it" — which for a Steam game
 * is how an override is lifted and Steam's own value shows again.
 *
 * Not `PartialType(CreateGameDto)`: the title there is required and non-null,
 * and here a Steam game's title override may be cleared.
 */
export class UpdateGameDto {
  @IsOptional() @Transform(trimToNull) @IsString() @MaxLength(200) title?: string | null;

  @IsOptional() @Transform(trimToNull) @IsString() @MaxLength(60) platformLabel?: string | null;

  @IsOptional() @Transform(trimToNull) @IsString() @MaxLength(600) summary?: string | null;

  @IsOptional() @Transform(trimToNull) @IsString() @MaxLength(60_000) description?: string | null;

  @IsOptional() @Transform(trimToNull) @IsString() @MaxLength(200) developer?: string | null;

  @IsOptional() @Transform(trimToNull) @IsString() @MaxLength(200) publisher?: string | null;

  @IsOptional() @Transform(trimToNull) @IsString() @MaxLength(60) releaseText?: string | null;

  @IsOptional() @IsUUID() coverUploadId?: string | null;

  @IsOptional() @IsBoolean() isHidden?: boolean;

  @IsOptional() @IsBoolean() isFavorite?: boolean;

  @IsOptional() @IsBoolean() favoritesExcluded?: boolean;

  @IsOptional() @IsInt() @Min(1) @Max(10) rating?: number | null;

  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsUUID('4', { each: true }) categoryIds?: string[];
}

export class AddScreenshotDto {
  @IsUUID() uploadId!: string;
}

export class UpdateScreenshotDto {
  @IsBoolean() isHidden!: boolean;
}
