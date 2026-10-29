'use client';

import { createContext, useContext } from 'react';

export interface Access {
  /** May host quizzes and launch events (admins and site admins). */
  canHost: boolean;
  /** May make other admins and see the activity log. */
  siteAdmin: boolean;
}

const AccessContext = createContext<Access>({ canHost: false, siteAdmin: false });

export function AccessProvider({ value, children }: { value: Access; children: React.ReactNode }) {
  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess() {
  return useContext(AccessContext);
}
