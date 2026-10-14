'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Building2,
  House,
  Library,
  LogOut,
  Menu,
  MessageSquareHeart,
  Plus,
  SlidersHorizontal,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Logo } from '@/components/Logo';
import { DisplaySettings } from '@/components/DisplaySettings';
import { logoutAction } from '@/app/(auth)/actions';
import { createQuizAction } from '@/app/(app)/quiz-actions';
import { SampleHostLink } from '@/components/SampleHostLink';

interface NavItem {
  href: string;
  label: string;
  Icon: LucideIcon;
  ready: boolean;
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Home', Icon: House, ready: true },
  { href: '/library', label: 'Library', Icon: Library, ready: true },
  { href: '/feedback', label: 'Feedback + Quiz', Icon: MessageSquareHeart, ready: true },
  { href: '/reports', label: 'Reports', Icon: BarChart3, ready: true },
  { href: '/org', label: 'Organisation', Icon: Building2, ready: false },
];

export interface ShellUser {
  name: string;
  email: string;
}

function SidebarContent({ user, onNavigate, onOpenSettings }: { user: ShellUser; onNavigate?: () => void; onOpenSettings: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col gap-6 p-4 text-white">
      <Link href="/dashboard" onClick={onNavigate} className="px-2">
        <Logo className="text-white" />
        <span className="mt-1 block text-[10px] font-bold uppercase tracking-[.24em] text-nova-200/70">Live quiz studio</span>
      </Link>

      <div className="space-y-2">
        <form action={createQuizAction} onSubmit={onNavigate}>
          <button
            type="submit"
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(100deg,#6d4aff,#ff5d73)] font-semibold text-white shadow-lift transition hover:brightness-110"
          >
            <Plus className="size-4" aria-hidden="true" />
            New quiz
          </button>
        </form>
        <SampleHostLink
          onNavigate={onNavigate}
          className="flex h-9 items-center justify-center gap-2 rounded-xl border border-white/15 text-sm font-semibold text-white/75 transition hover:bg-white/10 hover:text-white"
        />
      </div>

      <nav aria-label="Main" className="space-y-1">
        {NAV.map(({ href, label, Icon, ready }) => {
          const active =
            pathname === href ||
            (href === '/library' && pathname.startsWith('/quiz/')) ||
            (href === '/reports' && pathname.startsWith('/reports/'));
          if (!ready) {
            return (
              <span
                key={href}
                aria-disabled="true"
                className="flex cursor-default items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/35"
              >
                <Icon className="size-5" aria-hidden="true" />
                {label}
                <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/50">
                  Soon
                </span>
              </span>
            );
          }
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                active
                  ? 'bg-white/15 text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/.12)]'
                  : 'text-white/60 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon className="size-5" aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-2">
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-white/60 transition hover:bg-white/10 hover:text-white"
        >
          <SlidersHorizontal className="size-5" aria-hidden="true" />
          Display & accessibility
        </button>
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 p-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-nova-600 font-bold text-white" aria-hidden="true">
            {user.name.trim().charAt(0).toUpperCase() || '?'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-xs text-white/60">{user.email}</p>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              aria-label="Sign out"
              title="Sign out"
              className="rounded-lg p-1.5 text-white/70 hover:bg-white/15 hover:text-white"
            >
              <LogOut className="size-4" aria-hidden="true" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

const SIDEBAR_BG = {
  background: 'radial-gradient(circle at 20% 0%, rgba(143,109,255,.32), transparent 34%), linear-gradient(180deg, #160b40, #0c0a1d 72%)',
};

export function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only-focusable fixed left-3 top-3 z-[100] rounded-lg bg-nova-600 px-4 py-2 font-semibold text-white"
      >
        Skip to content
      </a>

      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-app bg-surface/90 px-4 py-3 backdrop-blur lg:hidden print:hidden">
        <Link href="/dashboard" aria-label="ThinkWise home">
          <Logo />
        </Link>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          aria-expanded={drawerOpen}
          className="rounded-lg p-2 hover:bg-surface-2"
        >
          <Menu className="size-5" aria-hidden="true" />
        </button>
      </div>

      <aside
        className="fixed inset-y-0 left-0 z-30 hidden w-64 overflow-hidden border-r border-white/10 lg:block print:hidden"
        style={SIDEBAR_BG}
      >
        <SidebarContent user={user} onOpenSettings={() => setSettingsOpen(true)} />
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm"
          />
          <div className="relative h-full w-72 max-w-[85vw] animate-rise shadow-lift" style={SIDEBAR_BG}>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
              className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-white/70 hover:bg-white/10"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
            <SidebarContent
              user={user}
              onNavigate={() => setDrawerOpen(false)}
              onOpenSettings={() => {
                setDrawerOpen(false);
                setSettingsOpen(true);
              }}
            />
          </div>
        </div>
      )}

      <div className="lg:pl-64 print:pl-0">
        <main id="main" className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10 print:max-w-none print:p-0">
          {children}
        </main>
      </div>

      <DisplaySettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
