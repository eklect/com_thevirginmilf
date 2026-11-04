import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Req, Res } from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import type { Request, Response } from 'express';
import { Public } from '../common/auth/auth.decorators';
import { CurrentPrincipal } from '../common/auth/principal';
import type { RequestUser } from '../common/auth/principal';
import { HELP_VENTURE, HelpClientService, type HelpResponse } from './help-client.service';

export class PostHelpCommentDto {
  @IsString() @MaxLength(80) category!: string;
  @IsString() @MaxLength(80) slug!: string;
  @IsString() @MaxLength(4200) body!: string;
  /** Sent by the shared UI. Ignored: this server's venture is the only one it can reach. */
  @IsString() @MaxLength(40) venture!: string;
}

export class EditHelpCommentDto {
  @IsString() @MaxLength(4200) body!: string;
}

const SEGMENT = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function send(response: Response, upstream: HelpResponse): void {
  response.status(upstream.status);
  response.setHeader('Content-Type', upstream.contentType);
  if (upstream.cacheControl) response.setHeader('Cache-Control', upstream.cacheControl);
  response.send(upstream.body);
}

/**
 * `/help/*`: the help center's reads, passed through. Open to everyone; a
 * restricted article is refused by the help center, on what this server tells it
 * about who is asking. Every segment is checked, so a request can only ever name
 * something under this venture.
 */
@Public()
@Controller('help')
export class HelpController {
  constructor(private readonly help: HelpClientService) {}

  /** Served at `/help/sitemap.xml` on the main domain, through `root_proxy_paths`. */
  @Get('sitemap.xml')
  async sitemap(@Res() response: Response) {
    send(response, await this.help.read('/sitemap.xml', undefined));
  }

  @Get(['', ':a', ':a/:b', ':a/:b/:c'])
  async read(@Req() request: Request, @Res() response: Response) {
    const segments = Object.values(request.params as Record<string, string>);
    if (!segments.every((segment) => SEGMENT.test(segment))) throw new NotFoundException('Not found');
    const q = typeof request.query.q === 'string' ? `?q=${encodeURIComponent(request.query.q.slice(0, 200))}` : '';
    const suffix = segments.map((segment) => `/${segment}`).join('') + q;
    send(response, await this.help.read(suffix, request.user));
  }
}

/** Comment writes need a session here: the guard refuses without one. */
@Controller('help/comments')
export class HelpCommentsController {
  constructor(private readonly help: HelpClientService) {}

  @Post()
  async create(@Body() dto: PostHelpCommentDto, @CurrentPrincipal() user: RequestUser, @Res() response: Response) {
    send(response, await this.help.write('POST', '', { ...dto, venture: HELP_VENTURE }, user));
  }

  @Patch(':id')
  async edit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditHelpCommentDto,
    @CurrentPrincipal() user: RequestUser,
    @Res() response: Response,
  ) {
    send(response, await this.help.write('PATCH', `/${id}`, { body: dto.body }, user));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentPrincipal() user: RequestUser, @Res() response: Response) {
    const upstream = await this.help.write('DELETE', `/${id}`, undefined, user);
    if (upstream.status === 204) response.status(204).end();
    else send(response, upstream);
  }
}
