import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { trim } from '../../common/dto';

export class CreateReviewDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) title!: string;

  /** Markdown source. */
  @IsString() @MaxLength(200_000) body!: string;

  @IsOptional() @IsBoolean() isPublished?: boolean;

  /** Left out, it is stamped the first time the review is published. */
  @IsOptional() @IsISO8601() publishedAt?: string | null;
}

export class UpdateReviewDto extends PartialType(CreateReviewDto) {}
