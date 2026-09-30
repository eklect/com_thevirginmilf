import {
  Body,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Type,
  ValidationPipe,
} from '@nestjs/common';
import { ReorderDto } from '../common/dto';
import { OrderedCrudService, OrderedRow } from '../common/ordered-crud.service';

/**
 * Builds the handler set for one hand-ordered collection.
 *
 * Five collections share exactly these routes:
 *
 *   GET    /admin/<path>            every row, unpublished included
 *   POST   /admin/<path>            create
 *   PUT    /admin/<path>/order      { ids } — the whole collection, reordered
 *   GET    /admin/<path>/:id
 *   PUT    /admin/<path>/:id        full or partial update
 *   DELETE /admin/<path>/:id
 *
 * The returned class carries the route decorators but not `@Controller` —
 * each concrete subclass in `admin-collections.controllers.ts` adds that with
 * its own path, plus `@AdminOnly()`. Nest reads handler metadata up the
 * prototype chain, so the inherited routes register under the subclass.
 *
 * The DTO classes are passed in because `@Body()` validates by the
 * parameter's design-time type, which for a generic `C` is `Object`; naming
 * the class in a per-route pipe is what makes the validation real. `order` is
 * declared before `:id` so the literal wins.
 */
export function adminCollectionController<
  T extends OrderedRow,
  C extends object,
  U extends object,
>(key: string, createDto: Type<C>, updateDto: Type<U>): Type<AdminCollection<T, C, U>> {
  class AdminCollectionHandlers {
    constructor(readonly service: OrderedCrudService<T>) {}

    @Get()
    async list(): Promise<Record<string, T[]>> {
      return { [key]: await this.service.list(false) };
    }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    async create(@Body(bodyPipe(createDto)) body: C): Promise<{ item: T }> {
      return { item: await this.service.create(body as never) };
    }

    @Put('order')
    async reorder(@Body() dto: ReorderDto): Promise<Record<string, T[]>> {
      return { [key]: await this.service.reorder(dto.ids) };
    }

    @Get(':id')
    async get(@Param('id', new ParseUUIDPipe()) id: string): Promise<{ item: T }> {
      return { item: await this.service.get(id) };
    }

    @Put(':id')
    async update(
      @Param('id', new ParseUUIDPipe()) id: string,
      @Body(bodyPipe(updateDto)) body: U,
    ): Promise<{ item: T }> {
      return { item: await this.service.update(id, body as never) };
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
      await this.service.remove(id);
    }
  }
  return AdminCollectionHandlers;
}

export interface AdminCollection<T, C, U> {
  list(): Promise<Record<string, T[]>>;
  create(body: C): Promise<{ item: T }>;
  reorder(dto: ReorderDto): Promise<Record<string, T[]>>;
  get(id: string): Promise<{ item: T }>;
  update(id: string, body: U): Promise<{ item: T }>;
  remove(id: string): Promise<void>;
}

function bodyPipe<D extends object>(dto: Type<D>): ValidationPipe {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    expectedType: dto,
    transformOptions: { enableImplicitConversion: false },
  });
}
