import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { AdminOnly } from '../common/auth/auth.decorators';
import { ReorderDto } from '../common/dto';
import {
  AddScreenshotDto,
  CreateGameDto,
  UpdateGameDto,
  UpdateScreenshotDto,
} from '../games/dto/game.dto';
import { GamesService } from '../games/games.service';
import { CreateReviewDto } from '../reviews/dto/review.dto';
import { ReviewsService } from '../reviews/reviews.service';

/**
 * The library's write plane.
 *
 * `PUT :id` is the one route behind every control on the games list — the
 * heart, the stars, the hide switch — as well as the full edit form. Each
 * sends only the field it changes, which is what `UpdateGameDto` being
 * entirely optional is for.
 *
 * `POST` creates a game by hand. Steam games are never created here; they
 * arrive through the sync (`AdminSteamController`).
 */
@AdminOnly()
@Controller('admin/games')
export class AdminGamesController {
  constructor(
    private readonly games: GamesService,
    private readonly reviews: ReviewsService,
  ) {}

  @Get()
  async list() {
    return { games: await this.games.adminList() };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateGameDto) {
    return { game: await this.games.createManual(dto) };
  }

  @Get(':id')
  async get(@Param('id', new ParseUUIDPipe()) id: string) {
    const [detail, reviews] = await Promise.all([
      this.games.adminGet(id),
      this.reviews.forGame(id, false),
    ]);
    return { ...detail, reviews };
  }

  @Put(':id')
  async update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateGameDto) {
    return { game: await this.games.update(id, dto) };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.games.remove(id);
  }

  // ---------- screenshots ----------

  @Post(':id/screenshots')
  @HttpCode(HttpStatus.CREATED)
  async addScreenshot(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AddScreenshotDto,
  ) {
    return { screenshots: await this.games.addScreenshot(id, dto.uploadId) };
  }

  /** `order` is declared before `:shotId` so the literal wins. */
  @Put(':id/screenshots/order')
  async reorderScreenshots(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReorderDto,
  ) {
    return { screenshots: await this.games.reorderScreenshots(id, dto.ids) };
  }

  @Put(':id/screenshots/:shotId')
  async updateScreenshot(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('shotId', new ParseUUIDPipe()) shotId: string,
    @Body() dto: UpdateScreenshotDto,
  ) {
    return { screenshots: await this.games.setScreenshotHidden(id, shotId, dto.isHidden) };
  }

  @Delete(':id/screenshots/:shotId')
  async removeScreenshot(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('shotId', new ParseUUIDPipe()) shotId: string,
  ) {
    return { screenshots: await this.games.removeScreenshot(id, shotId) };
  }

  // ---------- reviews ----------

  /** A review is created under its game and edited at `/admin/reviews/:id`. */
  @Post(':id/reviews')
  @HttpCode(HttpStatus.CREATED)
  async createReview(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: CreateReviewDto) {
    return { review: await this.reviews.create(id, dto) };
  }
}
