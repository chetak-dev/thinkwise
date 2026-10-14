import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { WakeRealtime } from '@/components/WakeRealtime';
import './globals.css';

export const metadata: Metadata = {
  title: 'ThinkWise — live quizzes for every room',
  description: 'Host live quiz games that anyone can join from a phone with a PIN.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f6fb' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0a1d' },
  ],
  width: 'device-width',
  initialScale: 1,
};

// Runs before paint so the page never flashes the wrong theme or text size.
const themeScript = `(function(){try{var p=JSON.parse(localStorage.getItem('tw-prefs')||'{}');var t=p.theme||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.classList.toggle('low-data',!!p.lowData);r.classList.toggle('reduce-motion',!!p.reduceMotion);if(p.textScale&&p.textScale!==1)r.style.fontSize=(p.textScale*100)+'%';}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh bg-app text-app">
        <Script id="tw-theme" strategy="beforeInteractive">
          {themeScript}
        </Script>
        <WakeRealtime />
        {children}
      </body>
    </html>
  );
}
