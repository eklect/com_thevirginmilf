import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { trim } from '../../common/dto';

export class ConnectSteamDto {
  /** From https://steamcommunity.com/dev/apikey — 32 hex characters. */
  @Transform(trim)
  @IsString()
  @Matches(/^[0-9A-Fa-f]{32}$/, {
    message: 'A Steam Web API key is 32 letters and digits. Copy it again from the Steam key page.',
  })
  apiKey!: string;

  /**
   * A profile URL, a custom URL name, or the 17-digit SteamID.
   *
   * `steamProfile`, not `profile`, and the name is load-bearing. The dev box
   * and production both sit behind the OWASP Core Rule Set, and rule 930120
   * ("OS File Access Attempt") matches `.profile` — the shell dotfile — in
   * argument NAMES. A JSON body `{ "profile": … }` is flattened to the
   * argument `json.profile`, which contains it, and the request is refused
   * with a bare nginx 403 before this process sees it.
   */
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Enter the address of the Steam profile.' })
  @MaxLength(200)
  steamProfile!: string;
}
