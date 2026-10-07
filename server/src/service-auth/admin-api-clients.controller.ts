import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { AdminOnly } from '../common/auth/auth.decorators';
import { CurrentPrincipal } from '../common/auth/principal';
import type { RequestUser } from '../common/auth/principal';
import { ApiClientsService } from './api-clients.service';
import { CreateApiClientDto } from './dto/api-client.dto';
import { SERVICE_SCOPES } from './scopes';

/**
 * `/admin/api-clients` — the keys this venture has issued, for admins.
 *
 * Create answers with the secret exactly once; nothing stored can reproduce
 * it. `DELETE` revokes rather than deletes: the row is the record of what was
 * issued and by whom, and the guard refuses every token minted from it the
 * moment `revoked_at` is set.
 */
@AdminOnly()
@Controller('admin/api-clients')
export class AdminApiClientsController {
  constructor(private readonly clients: ApiClientsService) {}

  @Get()
  async list() {
    return { items: await this.clients.list(), scopes: SERVICE_SCOPES };
  }

  @Post()
  create(@Body() dto: CreateApiClientDto, @CurrentPrincipal() user: RequestUser) {
    return this.clients.create(dto.name, dto.scopes, user.id);
  }

  @Delete(':id')
  async revoke(@Param('id', new ParseUUIDPipe()) id: string, @CurrentPrincipal() user: RequestUser) {
    return { item: await this.clients.revoke(id, user.id) };
  }
}
