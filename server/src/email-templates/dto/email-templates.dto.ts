import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { TEMPLATE_NAME } from '../template-name';

/** 512 KB: the ModSecurity non-file body cap, and what main.ts sets the JSON parser to. */
export const TEMPLATE_MAX_CHARS = 512_000;

export class SaveTemplateDto {
  @IsString()
  @MaxLength(TEMPLATE_MAX_CHARS)
  html: string;

  @IsOptional()
  @IsString()
  @MaxLength(TEMPLATE_MAX_CHARS)
  text?: string | null;
}

export class ArchiveTemplatesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @Matches(TEMPLATE_NAME, { each: true })
  names: string[];
}
