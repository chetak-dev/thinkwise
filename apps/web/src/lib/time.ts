export const TZ_COOKIE = 'tw-tz';
// Most hosts are in India; used until the browser reports its own zone.
export const DEFAULT_TIME_ZONE = 'Asia/Kolkata';

export function isTimeZone(value: string) {
  if (!value || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function formatDateTime(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone,
  }).format(date);
}

export function formatDate(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone }).format(date);
}

/** yyyy-mm-dd in the given zone, for file names. */
export function isoDay(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).format(date);
}
