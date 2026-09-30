import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { trim, trimToNull } from '../../common/dto';
import { SLUG_PATTERN } from '../../common/slug';

export class CreateCategoryDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(80) name!: string;

  /** Left out, the service derives one from the name. */
  @IsOptional() @Transform(trim) @IsString() @MaxLength(96) @Matches(SLUG_PATTERN, {
    message: 'The slug may only hold lowercase letters, digits and hyphens',
  })
  slug?: string;

  @IsOptional() @Transform(trimToNull) @IsString() @MaxLength(500) description?: string | null;

  @IsOptional() @IsBoolean() isPublished?: boolean;

  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}
