import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { AdminOnly } from '../common/auth/auth.decorators';
import { SettingsService } from '../settings/settings.service';

export class UpdatePageDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  navLabel?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  /**
   * The page this one hangs under, or `null` to lift it back to the top level.
   *
   * `@ValidateIf` rather than `@IsOptional`, because the two differ on exactly
   * the value that matters here: `@IsOptional` skips `null` as well as
   * `undefined`, which is fine, but it would also let a `null` through with no
   * type check at all. This says "absent is fine, otherwise it must be a
   * string or null" — and the service does the real work of deciding whether
   * that key is a legal parent.
   */
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(32)
  parentKey?: string | null;
}

/** Site-wide settings and the page toggles. */
@AdminOnly()
@Controller('admin')
export class AdminSettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('settings')
  async getSettings() {
    return { settings: await this.settings.all() };
  }

  /**
   * A partial map of key → value. Validated by the service against the closed
   * key list rather than a DTO, because the DTO would be the key list written
   * out a second time.
   */
  @Put('settings')
  async putSettings(@Body() body: Record<string, unknown>) {
    const patch: Record<string, string> = {};
    for (const [key, value] of Object.entries(body ?? {})) {
      patch[key] = value === null || value === undefined ? '' : String(value);
    }
    return { settings: await this.settings.update(patch) };
  }

  @Get('pages')
  async getPages() {
    return { pages: await this.settings.pageSettings() };
  }

  @Put('pages/:key')
  async putPage(@Param('key') key: string, @Body() dto: UpdatePageDto) {
    return { pages: await this.settings.setPage(key, dto) };
  }
}
