import { Controller, Inject } from '@nestjs/common';
import { CategoriesService } from '../categories/categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from '../categories/dto/category.dto';
import { ChannelsService } from '../channels/channels.service';
import { CreateChannelDto, UpdateChannelDto } from '../channels/dto/channel.dto';
import { AdminOnly } from '../common/auth/auth.decorators';
import { adminCollectionController } from './admin-collection.controller';

/**
 * One concrete class per hand-ordered collection, each binding the generic
 * controller to its service. The subclass exists so Nest's injector has a
 * distinct token to resolve per route family, and so `@AdminOnly()` sits on
 * every one of them.
 *
 * Streams, games and reviews are NOT here. Streams order themselves by date,
 * games are sorted by title and mostly arrive from Steam, reviews hang off a
 * game — none fits the reorder-everything contract this factory implies. Each
 * has a hand-written controller instead.
 */

@AdminOnly()
@Controller('admin/channels')
export class AdminChannelsController extends adminCollectionController(
  'channels',
  CreateChannelDto,
  UpdateChannelDto,
) {
  constructor(@Inject(ChannelsService) service: ChannelsService) {
    super(service);
  }
}

@AdminOnly()
@Controller('admin/categories')
export class AdminCategoriesController extends adminCollectionController(
  'categories',
  CreateCategoryDto,
  UpdateCategoryDto,
) {
  constructor(@Inject(CategoriesService) service: CategoriesService) {
    super(service);
  }
}
