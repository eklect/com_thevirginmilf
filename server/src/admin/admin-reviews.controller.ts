import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import { AdminOnly } from '../common/auth/auth.decorators';
import { GamesService } from '../games/games.service';
import { gameTitle } from '../games/games.serializer';
import { UpdateReviewDto } from '../reviews/dto/review.dto';
import { ReviewsService } from '../reviews/reviews.service';

/**
 * Reviews across the whole library — the list, and one review's edit screen.
 * Creating one happens under its game: `POST /admin/games/:id/reviews`.
 */
@AdminOnly()
@Controller('admin/reviews')
export class AdminReviewsController {
  constructor(
    private readonly reviews: ReviewsService,
    private readonly games: GamesService,
  ) {}

  @Get()
  async list() {
    return { reviews: await this.reviews.adminList() };
  }

  @Get(':id')
  async get(@Param('id', new ParseUUIDPipe()) id: string) {
    const review = await this.reviews.get(id);
    const game = await this.games.get(review.gameId);
    return { review, game: { id: game.id, slug: game.slug, title: gameTitle(game) } };
  }

  @Put(':id')
  async update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateReviewDto) {
    return { review: await this.reviews.update(id, dto) };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.reviews.remove(id);
  }
}
