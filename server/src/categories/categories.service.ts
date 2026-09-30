import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { OrderedCrudService } from '../common/ordered-crud.service';
import { slugify } from '../common/slug';
import { CategoryEntity } from './category.entity';

@Injectable()
export class CategoriesService extends OrderedCrudService<CategoryEntity> {
  constructor(@InjectRepository(CategoryEntity) repo: Repository<CategoryEntity>) {
    super(repo);
  }

  async create(input: DeepPartial<CategoryEntity>): Promise<CategoryEntity> {
    const slug = input.slug?.trim() || slugify(String(input.name ?? ''), 'category');
    return super.create({ ...input, slug });
  }

  async findBySlug(slug: string, publishedOnly: boolean): Promise<CategoryEntity> {
    const row = await this.repo.findOne({ where: { slug } });
    if (!row || (publishedOnly && !row.isPublished)) {
      throw new NotFoundException('Not found');
    }
    return row;
  }
}
