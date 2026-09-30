import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { HTTP_URL, trim, trimToNull } from '../../common/dto';

export class StreamChannelDto {
  @IsUUID() channelId!: string;

  /** This stream's own address on that channel; empty uses the channel's URL. */
  @IsOptional() @Transform(trimToNull) @IsString() @MaxLength(500) @Matches(HTTP_URL, {
    message: 'The stream link must start with https:// or http://',
  })
  urlOverride?: string | null;
}

export class CreateStreamDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) title!: string;

  @IsOptional() @Transform(trimToNull) @IsString() @MaxLength(20_000) description?: string | null;

  @IsISO8601() startsAt!: string;

  @IsOptional() @IsISO8601() endsAt?: string | null;

  @IsOptional() @IsUUID() gameId?: string | null;

  @IsOptional() @IsBoolean() isPublished?: boolean;

  @IsOptional() @IsBoolean() notify?: boolean;

  /** In the order they should be listed. Replaces the whole set on an update. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => StreamChannelDto)
  channels?: StreamChannelDto[];
}

export class UpdateStreamDto extends PartialType(CreateStreamDto) {}

/** `GET /site/streams?from=&to=` — the calendar's visible range, in UTC. */
export class StreamRangeQueryDto {
  @IsISO8601() from!: string;

  @IsISO8601() to!: string;
}
