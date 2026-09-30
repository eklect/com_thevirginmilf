import { BadRequestException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DeepPartial, In, Repository } from 'typeorm';

/** What every hand-ordered, publishable content row has in common. */
export interface OrderedRow {
  id: string;
  sortOrder: number;
  isPublished: boolean;
}

/**
 * The CRUD every content collection on this site shares.
 *
 * Businesses, team members, timeline events, investor highlights and investor
 * sections are all the same shape from the admin's point of view: a list the
 * admin orders by hand, with a published flag the public plane filters on.
 * Writing that five times would be five places for the reorder logic to drift.
 */
export abstract class OrderedCrudService<T extends OrderedRow> {
  protected constructor(protected readonly repo: Repository<T>) {}

  /** The ordering the public plane and the admin list both use. */
  protected orderBy(): Record<string, 'ASC' | 'DESC'> {
    return { sortOrder: 'ASC', createdAt: 'ASC' };
  }

  async list(publishedOnly: boolean): Promise<T[]> {
    return this.repo.find({
      where: publishedOnly ? ({ isPublished: true } as never) : {},
      order: this.orderBy() as never,
    });
  }

  async get(id: string): Promise<T> {
    const row = await this.repo.findOne({ where: { id } as never });
    if (!row) throw new NotFoundException('Not found');
    return row;
  }

  async create(input: DeepPartial<T>): Promise<T> {
    const sortOrder =
      input.sortOrder === undefined
        ? await this.nextSortOrder()
        : (input.sortOrder as number);
    const row = this.repo.create({
      ...input,
      id: randomUUID(),
      sortOrder,
    } as DeepPartial<T>);
    return this.repo.save(row);
  }

  async update(id: string, input: DeepPartial<T>): Promise<T> {
    const row = await this.get(id);
    this.repo.merge(row, input);
    return this.repo.save(row);
  }

  async remove(id: string): Promise<void> {
    const row = await this.get(id);
    await this.repo.remove(row);
  }

  /**
   * Rewrites `sort_order` from the position of each id in `ids`.
   *
   * Every existing id must be present — a partial list would leave the rest
   * with stale positions that collide with the new ones.
   */
  async reorder(ids: string[]): Promise<T[]> {
    const rows = await this.repo.find({ where: { id: In(ids) } as never });
    if (rows.length !== ids.length || new Set(ids).size !== ids.length) {
      throw new BadRequestException('The order must list every item exactly once');
    }
    const total = await this.repo.count();
    if (total !== ids.length) {
      throw new BadRequestException('The order must list every item exactly once');
    }
    const position = new Map(ids.map((id, index) => [id, index]));
    for (const row of rows) row.sortOrder = position.get(row.id)!;
    await this.repo.save(rows);
    return this.list(false);
  }

  private async nextSortOrder(): Promise<number> {
    const last = await this.repo.find({
      order: { sortOrder: 'DESC' } as never,
      take: 1,
    });
    return last.length ? last[0].sortOrder + 1 : 0;
  }
}
