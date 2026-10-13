'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { TZ_COOKIE, isTimeZone } from '@/lib/time';

/** Tells the server which time zone this browser is in, so dates render in local time. */
export function TimeZoneSync() {
  const router = useRouter();
  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!isTimeZone(zone)) return;
    const current = document.cookie.match(new RegExp(`(?:^|; )${TZ_COOKIE}=([^;]*)`))?.[1];
    if (current && decodeURIComponent(current) === zone) return;
    document.cookie = `${TZ_COOKIE}=${encodeURIComponent(zone)}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }, [router]);
  return null;
}
