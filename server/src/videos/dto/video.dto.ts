import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { trim, trimToNull } from '../../common/dto';
import { TWITCH_KINDS, VIDEO_FILTERS } from '../video.entity';
import type { TwitchKind, VideoFilter } from '../video.entity';

/** `GET /site/videos` — query strings arrive as text (implicit conversion is off). */
export class VideoListQueryDto {
  @IsOptional()
  @IsIn(VIDEO_FILTERS)
  kind?: VideoFilter;

  @IsOptional()
  @Matches(/^\d{1,6}$/)
  offset?: string;
}

/**
 * `PUT /admin/videos/connection`. Every field is optional: what is left out
 * keeps what is stored.
 *
 * The names avoid CRS trip-wires in argument names (see `ConnectSteamDto`'s
 * note on `.profile`): nothing here contains a dotfile or a shell word.
 */
export class SaveVideoConnectionDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(/^[A-Za-z0-9]{10,64}$/, {
    message:
      'A Twitch Client ID is letters and digits. Copy it again from the Twitch console.',
  })
  twitchClientId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(/^[A-Za-z0-9]{10,64}$/, {
    message:
      'A Twitch Client Secret is letters and digits. Make a new one in the Twitch console and copy it.',
  })
  twitchClientSecret?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{20,64}$/, {
    message:
      'A YouTube API key is about 39 letters, digits, dashes and underscores. Copy it again from Google Cloud.',
  })
  youtubeApiKey?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(TWITCH_KINDS.length)
  @IsIn(TWITCH_KINDS, { each: true })
  twitchKinds?: TwitchKind[];

  @IsOptional()
  @IsBoolean()
  forgetTwitch?: boolean;

  @IsOptional()
  @IsBoolean()
  forgetYoutube?: boolean;
}

/** `POST /admin/videos` — a pasted link. */
export class AddVideoDto {
  @Transform(trim)
  @IsString()
  @MinLength(8, { message: 'Paste the address of the video.' })
  @MaxLength(500)
  url!: string;

  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(300)
  title?: string | null;
}

/** `PUT /admin/videos/:id` — the admin's half of a row. A blank title hands it back to the platform's. */
export class UpdateVideoDto {
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(300)
  title?: string | null;

  @IsOptional()
  @IsBoolean()
  isHidden?: boolean;

  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;
}
