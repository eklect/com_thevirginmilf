/**
 * `<input type="datetime-local">` carries no zone: it reads and writes wall
 * time where the admin is sitting. These convert on both edges, so the API
 * only ever sees an ISO instant.
 */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** The admin's own zone, named — "America/New_York" — for the hint beside a time field. */
export const localZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;
