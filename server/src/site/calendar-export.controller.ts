import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { Request, Response } from 'express';
import { DETAIL_LEVELS, type DetailLevel } from '../calendar-export/detail-level';
import { ICS_CONTENT_TYPE } from '../calendar-export/feed-token';
import { AdminOnly, Public } from '../common/auth/auth.decorators';
import { CurrentPrincipal, type RequestUser } from '../common/auth/principal';
import { StreamExportService } from '../streams/export.service';
import { PageEnabledGuard } from './page-enabled.guard';

class ExportQueryDto {
  @IsOptional()
  @IsIn(DETAIL_LEVELS)
  level?: DetailLevel;
}

class SetExportCapDto {
  @IsIn(DETAIL_LEVELS)
  cap!: DetailLevel;
}

class CreateFeedDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || null : value))
  name?: string | null;

  @IsIn(DETAIL_LEVELS)
  level!: DetailLevel;
}

const viewerOf = (request: Request) => ({ signedIn: Boolean(request.user), isAdmin: Boolean(request.user?.isAdmin) });

/**
 * One stream to Google, Outlook or a file. Public like the stream itself;
 * the watch links follow the same sign-in rule as the calendar page.
 */
@Public()
@Controller('site/streams')
export class StreamExportController {
  constructor(private readonly exporter: StreamExportService) {}

  @Get(':id/export')
  @UseGuards(PageEnabledGuard('streams'))
  @Header('Cache-Control', 'private, no-store')
  async links(@Param('id', new ParseUUIDPipe()) id: string, @Query() query: ExportQueryDto, @Req() request: Request) {
    return this.exporter.streamLinks(id, viewerOf(request), query.level);
  }

  /** No extension in the URL — see calendar-export/README.md. */
  @Get(':id/ics')
  @UseGuards(PageEnabledGuard('streams'))
  async ics(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: ExportQueryDto,
    @Req() request: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { filename, body } = await this.exporter.streamIcs(id, viewerOf(request), query.level);
    res.setHeader('Content-Type', ICS_CONTENT_TYPE);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    return body;
  }

  /** What the menu may offer. Public: the cap is no secret, and anonymous visitors export too. */
  @Get('export-settings')
  async settings() {
    return this.exporter.exportSettings();
  }
}

/** A signed-in visitor's private subscription, and the admin's cap. */
@Controller('calendar/export')
export class CalendarExportController {
  constructor(private readonly exporter: StreamExportService) {}

  @Get('settings')
  async settings() {
    return this.exporter.exportSettings();
  }

  @AdminOnly()
  @Patch('settings')
  async setCap(@Body() dto: SetExportCapDto) {
    return this.exporter.setCap(dto.cap);
  }

  @Get('subscription')
  async subscription(@CurrentPrincipal() user: RequestUser) {
    return this.exporter.feedState(user.id);
  }

  @Post('subscription')
  @HttpCode(HttpStatus.CREATED)
  async subscribe(@Body() dto: CreateFeedDto, @CurrentPrincipal() user: RequestUser) {
    return this.exporter.createFeed(user.id, { name: dto.name, level: dto.level });
  }

  @Delete('subscription')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unsubscribe(@CurrentPrincipal() user: RequestUser) {
    await this.exporter.revokeFeed(user.id);
  }
}

/** The feed itself, fetched by Google, Outlook or Apple: the secret in the path is the whole credential. */
@Public()
@Controller('calendar-feed')
export class CalendarFeedPublicController {
  constructor(private readonly exporter: StreamExportService) {}

  @Get(':token')
  async feed(@Param('token') token: string, @Res({ passthrough: true }) res: Response) {
    const body = await this.exporter.publicFeed(token);
    if (body === null) throw new NotFoundException('No such calendar');
    res.setHeader('Content-Type', ICS_CONTENT_TYPE);
    res.setHeader('Content-Disposition', 'inline; filename="calendar.ics"');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Robots-Tag', 'noindex');
    return body;
  }
}
