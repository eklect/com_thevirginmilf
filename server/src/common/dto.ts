import { Transform } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

/** Trims a string; leaves anything else alone for the validator to reject. */
export const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Trims, and turns an empty string into `null` — how a cleared field arrives. */
export const trimToNull = ({ value }: { value: unknown }) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

/** `PUT .../order` — every id in the collection, in the order wanted. */
export class ReorderDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  ids!: string[];
}

/** `http(s)://` and nothing else, so a pasted URL cannot be `javascript:`. */
export const HTTP_URL = /^https?:\/\/\S+$/i;

/** `YYYY-MM-DD` as the timeline stores it. */
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
