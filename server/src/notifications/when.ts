const DEFAULT_ZONE = 'America/New_York';

/** A usable IANA zone name, falling back to the default on anything Intl rejects. */
export function resolveZone(candidate: string | undefined | null): string {
  const zone = candidate?.trim();
  if (!zone) return DEFAULT_ZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    return DEFAULT_ZONE;
  }
}

/** "Friday, October 3 at 7:00 PM EDT" — the zone is always named. */
export function formatWhen(date: Date, zone: string): string {
  const day = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(date);
  return `${day} at ${formatTime(date, zone)}`;
}

/** "7:00 PM EDT". */
export function formatTime(date: Date, zone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

/** "in 30 minutes", "in an hour", "in 2 hours" — rounded, because it is a heads-up. */
export function formatLead(start: Date, now: Date): string {
  const minutes = Math.max(1, Math.round((start.getTime() - now.getTime()) / 60_000));
  if (minutes < 55) {
    const rounded = minutes <= 10 ? minutes : Math.round(minutes / 5) * 5;
    return `in ${rounded} minute${rounded === 1 ? '' : 's'}`;
  }
  const hours = Math.round(minutes / 60);
  return hours <= 1 ? 'in an hour' : `in ${hours} hours`;
}
