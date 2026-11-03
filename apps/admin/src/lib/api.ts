'use client';

import { createApi } from '@onebank/ui';
import { createContext, useContext } from 'react';

export const api = createApi({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4100/api/v1',
  refreshPath: '/admin/auth/refresh',
  onUnauthorized: () => {
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    }
  },
});

export type Role = 'SUPERADMIN' | 'ADMIN' | 'SUPPORT' | 'COMPLIANCE';

export interface Admin {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  status: string;
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
}

export const AdminContext = createContext<Admin | null>(null);

export function useAdmin(): Admin {
  const a = useContext(AdminContext);
  if (!a) throw new Error('useAdmin outside console');
  return a;
}

/** Mirrors the API's role guards so the UI hides actions the admin cannot perform. */
export function can(admin: Admin, ...roles: Role[]) {
  return admin.role === 'SUPERADMIN' || roles.includes(admin.role);
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}
