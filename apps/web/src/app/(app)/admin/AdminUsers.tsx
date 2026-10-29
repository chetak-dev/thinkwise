'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldCheck, ShieldOff } from 'lucide-react';
import type { AdminUserRow } from '@thinkwise/db';
import { setAdminAction } from './actions';

export function AdminUsers({ users, dates }: { users: AdminUserRow[]; dates: Record<string, string> }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const change = (u: AdminUserRow) =>
    startTransition(async () => {
      const r = await setAdminAction(u.id, !u.canHost);
      setProblem(r.ok ? null : r.error);
      setConfirming(null);
      router.refresh();
    });

  return (
    <div className="space-y-3">
      {problem && (
        <p role="alert" className="text-sm font-semibold text-rose-600 dark:text-rose-300">
          {problem}
        </p>
      )}
      <div className="overflow-x-auto rounded-2xl border border-app bg-surface shadow-soft">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs uppercase tracking-wider text-muted">
            <tr>
              <th scope="col" className="px-5 py-3">User</th>
              <th scope="col" className="hidden px-5 py-3 sm:table-cell">Joined</th>
              <th scope="col" className="px-5 py-3">Role</th>
              <th scope="col" className="px-5 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-muted">
                  No matching accounts.
                </td>
              </tr>
            )}
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-5 py-3.5">
                  <p className="font-semibold">{u.name}</p>
                  <p className="text-xs text-muted">{u.email}</p>
                </td>
                <td className="hidden px-5 py-3.5 text-muted sm:table-cell">{dates[u.id]}</td>
                <td className="px-5 py-3.5">
                  {u.siteAdmin ? (
                    <span className="rounded-full bg-nova-500/15 px-2.5 py-0.5 text-xs font-bold text-nova-800 dark:text-nova-200">Site admin</span>
                  ) : u.canHost ? (
                    <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-800 dark:text-emerald-200">Admin</span>
                  ) : (
                    <span className="text-muted">User</span>
                  )}
                </td>
                <td className="px-5 py-3.5 text-right">
                  {u.siteAdmin ? (
                    <span className="text-xs text-muted">Always admin</span>
                  ) : confirming === u.id ? (
                    <span className="inline-flex flex-wrap items-center justify-end gap-2">
                      <span className="text-xs font-semibold">{u.canHost ? `Remove admin from ${u.name}?` : `Make ${u.name} an admin?`}</span>
                      <button
                        type="button"
                        onClick={() => change(u)}
                        disabled={pending}
                        className={`inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs font-semibold text-white ${u.canHost ? 'bg-rose-600' : 'bg-nova-600'}`}
                      >
                        {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
                        Yes
                      </button>
                      <button type="button" onClick={() => setConfirming(null)} className="h-8 rounded-lg px-2 text-xs font-semibold text-muted">
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirming(u.id)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-app px-3 text-xs font-semibold transition hover:border-nova-400"
                    >
                      {u.canHost ? <ShieldOff className="size-3.5" aria-hidden="true" /> : <ShieldCheck className="size-3.5" aria-hidden="true" />}
                      {u.canHost ? 'Remove admin' : 'Make admin'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
