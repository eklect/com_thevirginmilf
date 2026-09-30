import { ValueTransformer } from 'typeorm';

/**
 * Stores an ISO-8601 datetime as a `varchar(30)` rather than a `datetime`.
 *
 * Used only by `auth_sessions`, which is a verbatim port from
 * `com_simplicourt_app` and keeps that repo's storage convention so the two
 * stay diffable. The content tables use ordinary `datetime(3)` columns.
 *
 * The stored form is canonical UTC of fixed width, so it sorts
 * lexicographically in chronological order — which only holds if EVERY value
 * is canonical, hence `to` normalises on write.
 */
export const IsoDateTransformer: ValueTransformer = {
  to(value?: string | Date | null): string | null {
    if (value === null || value === undefined || value === '') return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new TypeError(
        `Expected an ISO-8601 datetime, received '${String(value)}'`,
      );
    }
    return date.toISOString();
  },
  from(value?: string | null): string | null {
    return value ?? null;
  },
};
