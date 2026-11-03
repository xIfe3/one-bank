'use client';

import { createApi } from '@onebank/ui';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4100/api/v1';

export const api = createApi({
  baseUrl: API_URL,
  refreshPath: '/auth/refresh',
  onUnauthorized: () => {
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/app')) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}&expired=1`;
    }
  },
  onMaintenance: () => {
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/maintenance')) window.location.href = '/maintenance';
  },
});

export interface Me {
  id: string;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  country: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  status: 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED' | 'BLOCKED' | 'CLOSED';
  statusReason: string | null;
  kycLevel: number;
  baseCurrency: string;
  tag: string | null;
  referralCode: string;
  hasPin: boolean;
  twoFactorEnabled: boolean;
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface Account {
  id: string;
  type: 'CUSTOMER_WALLET' | 'SAVINGS' | 'FIXED_DEPOSIT' | 'LOAN' | 'CARD' | 'SYSTEM';
  name: string;
  currency: string;
  accountNumber: string | null;
  balance: string;
  availableBalance: string;
  status: 'ACTIVE' | 'FROZEN' | 'CLOSED';
  isPrimary: boolean;
}

export interface TxRow {
  rowId: string;
  id: string;
  reference: string;
  type: string;
  status: string;
  description: string;
  counterparty: string | null;
  category: string | null;
  amount: string;
  currency: string;
  accountId: string;
  accountName: string;
  accountType: string;
  accountNumber: string | null;
  balanceAfter: string | null;
  valueDate: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
}
