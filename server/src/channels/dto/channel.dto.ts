import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { trim, trimToNull } from '../../common/dto';
import { SLUG_PATTERN } from '../../common/slug';
import { CHANNEL_PLATFORMS } from '../channel.entity';
import type { ChannelPlatform } from '../channel.entity';

/** `http(s)://` or `mailto:` — a pasted link cannot be `javascript:`. */
const LINK_URL = /^(https?:\/\/\S+|mailto:\S+@\S+)$/i;

export class CreateChannelDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(80) name!: string;

  /** Left out, the service derives one from the name. */
  @IsOptional() @Transform(trim) @IsString() @MaxLength(64) @Matches(SLUG_PATTERN, {
    message: 'The slug may only hold lowercase letters, digits and hyphens',
  })
  slug?: string;

  @IsIn(CHANNEL_PLATFORMS) platform!: ChannelPlatform;

  @Transform(trim) @IsString() @MaxLength(500) @Matches(LINK_URL, {
    message: 'The link must start with https://, http:// or mailto:',
  })
  url!: string;

  @IsOptional() @Transform(trimToNull) @IsString() @MaxLength(120) handle?: string | null;

  @IsOptional() @Transform(trimToNull) @IsString() @MaxLength(200) description?: string | null;

  @IsOptional() @IsBoolean() isStreamChannel?: boolean;

  @IsOptional() @IsBoolean() showOnLinks?: boolean;

  @IsOptional() @IsBoolean() isPublished?: boolean;

  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class UpdateChannelDto extends PartialType(CreateChannelDto) {}
