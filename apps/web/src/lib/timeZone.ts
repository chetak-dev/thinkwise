import 'server-only';

import { cookies } from 'next/headers';
import { DEFAULT_TIME_ZONE, TZ_COOKIE, isTimeZone } from './time';

/** The viewer's time zone as reported by their browser, or the default. */
export async function getTimeZone() {
  const value = (await cookies()).get(TZ_COOKIE)?.value ?? '';
  return isTimeZone(value) ? value : DEFAULT_TIME_ZONE;
}
