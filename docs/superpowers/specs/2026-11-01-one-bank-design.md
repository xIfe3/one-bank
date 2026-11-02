# One Bank — Design Spec

**Date:** 2026-11-01
**Status:** Approved (sections 1–6 approved in conversation)

## 0. Purpose & constraints

- Portfolio/demo digital bank: production-quality, fully working, **no real money**. All money movement is simulated through an internal **double-entry ledger**.
- Multi-currency: **USD, EUR, GBP, NGN** wallets with simulated FX.
- Brand: **premium dark navy + gold**, serif headings (Playfair Display / Inter body).
- Success: every customer flow (signup → verify → KYC → transfer/bill/card/savings/loan → statement → support) and every admin control (suspend/block, credit/debit/custom transactions, reversals, maintenance, flags, analytics, sessions) works end to end locally with `docker compose up` + `pnpm dev`.

## 1. Architecture

```
one-bank/
├─ apps/
│  ├─ web/      Next.js 15 (App Router) — marketing + customer banking app   :3000
│  ├─ admin/    Next.js 15 — superadmin console                             :3001
│  └─ api/      NestJS 11 — REST /api/v1, Prisma, BullMQ workers            :4000
├─ packages/
│  ├─ shared/   zod schemas, types, enums, money utils
│  ├─ ui/       Tailwind preset (navy/gold) + shared components
│  └─ emails/   email templates rendered by the API
├─ docker-compose.yml  postgres:17, redis:7, mailpit (SMTP :1025, UI :8025)
└─ pnpm-workspace.yaml, turbo.json, .env.example
```

- Frontends call the API via REST with **httpOnly cookies**. Customer and admin cookies/secrets/endpoints are separate.
- Access JWT 15 min; opaque refresh token (hashed) with rotation + reuse detection. Each refresh token belongs to a `Session` row.
- Modular monolith modules: auth, users, sessions, kyc, accounts, ledger, transfers, fx, bills, cards, savings, loans, beneficiaries, statements, support, notifications, admin, audit, settings, analytics.
- **Only `ledger` mutates balances.**
- BullMQ queues: `email`, `transfer-settlement`, `scheduled-transfers` (repeatable), `interest`, `loan-repayments`.
- SSE stream for live notifications/balance updates.
- Maintenance mode: `SystemSetting` cached in Redis; guard returns 503 `MAINTENANCE` on customer routes; admin unaffected.
- Security: argon2, rate limits (auth + money), helmet, CORS allowlist, CSRF double-submit token, idempotency keys + transaction PIN on money actions, 2FA step-up above threshold, audit log for all admin actions.
- Tooling: Turborepo, ESLint/Prettier, Vitest (unit), Jest + Supertest (API integration vs real Postgres), Playwright (E2E).

## 2. Data model (Prisma/Postgres)

Identity: `User` (status PENDING_VERIFICATION|ACTIVE|SUSPENDED|BLOCKED|CLOSED, kycLevel 0–3, transactionPinHash, twoFactorSecret enc, tag, referralCode), `AdminUser` (role SUPERADMIN|ADMIN|SUPPORT|COMPLIANCE, 2FA required), `Session` (userId|adminId, refreshTokenHash, familyId, UA/device/browser/os, ip, location, lastSeenAt, expiresAt, revokedAt, revokedReason), `VerificationToken` (EMAIL_VERIFY|PASSWORD_RESET|EMAIL_CHANGE|PIN_RESET), `LoginEvent`, `KycSubmission`.

Ledger: `LedgerAccount` (CUSTOMER_WALLET|SAVINGS|FIXED_DEPOSIT|LOAN|CARD|SYSTEM; currency; 10-digit accountNumber for wallets; `balance`, `availableBalance` Decimal(19,4); status ACTIVE|FROZEN|CLOSED; systemCode for system accounts). System accounts per currency: BANK_EQUITY, FEES, FX_POOL, INTERBANK_SETTLEMENT, BILLS_SETTLEMENT, CARD_SETTLEMENT, INTEREST_EXPENSE, LOAN_PORTFOLIO.
`JournalEntry` (reference unique, idempotencyKey unique, type, status PENDING|COMPLETED|FAILED|REVERSED, description, metadata JSON, counterparty, initiatorType/Id, valueDate, reversalOfId). `Posting` (entryId, accountId, amount signed, currency). Invariant: postings sum to 0 per currency per entry. Pending outbound = hold on availableBalance; postings applied on settlement; release on failure.

Payments: `Transfer`, `Beneficiary`, `ScheduledTransfer`, `Bank`, `BillProvider`, `BillPayment`, `FxRate`.
Cards: `VirtualCard` (own CARD ledger account, encrypted PAN/CVV, status, spendLimit), `CardTransaction`.
Savings/Loans: `SavingsGoal`, `FixedDeposit`, `LoanProduct`, `Loan`, `LoanRepayment`.
Platform: `SupportTicket`, `TicketMessage` (internal flag), `Notification`, `NotificationPreference`, `Announcement`, `SystemSetting`, `AuditLog`, `AdminNote`, `FraudFlag`, `EmailLog`, `Faq`, `ContactMessage`, `NewsletterSubscriber`, `Referral`.

Money: Prisma `Decimal` + decimal.js only; never JS floats.

## 3. Auth, sessions & security

- Signup 3-step wizard → PENDING_VERIFICATION → verify email (24h link, resend throttled 60s) → ACTIVE, base-currency wallet created, welcome email.
- Login: lockout 5 fails / 15 min (email sent); TOTP 2FA or backup code; new device/IP → "New sign-in" email with "This wasn't me" link (revokes all + forces reset). Suspended/blocked → explicit error.
- Refresh rotation + reuse detection (revoke family + email). Session validity cached in Redis (60s) so revocations apply within a minute.
- Forgot/reset: no enumeration, 30-min single-use token, revoke all sessions, confirmation email.
- Settings → Security: active devices (revoke one / all others), login history, change password, change email (dual notification), 2FA enable/disable with backup codes, transaction PIN set/change/reset.
- Money actions require PIN (5 wrong → 30-min lock); 2FA step-up above threshold (default $1,000 equiv); KYC-tier limits.
- Admin: separate endpoints & cookie, mandatory 2FA, 8h sessions, optional IP allowlist, role guards.
- Status enforcement: SUSPENDED = read-only; BLOCKED = no login + sessions revoked; FROZEN wallet/card = no debits.

## 4. Banking flows

Customer pages: Dashboard, Accounts, Transfer, Pay Bills, Cards, Savings, Loans, Transactions, Statements, Beneficiaries, Analytics, Support, Notifications, Settings (Profile, Security, KYC, Notifications, Limits, Referrals).

| Flow | Ledger behaviour |
|---|---|
| Add money (simulated) | BANK_EQUITY → wallet, daily cap, flag-controlled |
| Internal transfer | by account number or @tag, name confirm, instant, free, auto-FX via FX_POOL |
| Interbank | seeded banks, name lookup sim, flat fee, hold → worker settles ~30s → INTERBANK_SETTLEMENT; above review threshold → admin queue |
| Wire | SWIFT/IBAN/address/purpose, % fee w/ min, KYC ≥2, settles in minutes with timeline |
| FX exchange | quote with spread, 30s lock, via FX_POOL |
| Bills | category → provider → validate customer → amount → PIN → BILLS_SETTLEMENT; electricity token |
| Virtual cards | issue (fee → FEES), fund/withdraw, freeze, limit, terminate (refund), reveal with PIN, simulate purchase → CARD_SETTLEMENT |
| Savings goals | deposit/withdraw/auto-save; monthly interest from INTEREST_EXPENSE |
| Fixed deposits | 30/90/180/365d tiers, payout at maturity, early-break penalty |
| Loans | apply → admin approve → disburse from LOAN_PORTFOLIO → schedule → auto-debit, late fee |
| Scheduled/recurring | worker executes; fails + notifies on insufficient funds |

Every transaction: detail page + status timeline, PDF receipt, "Report issue" → ticket. Transactions list with filters + CSV. Statements PDF (period, opening/closing, running balance) + email. Analytics: by category, in vs out, top recipients. KYC tiers: L0 receive only; L1 $500/day; L2 (ID+selfie) $10k/day, wire & loans; L3 (proof of address) $50k/day. All fees configurable; each fee is a separate posting to FEES.

## 5. Superadmin console

- Overview KPIs + charts + live activity feed.
- Users list + detail tabs (profile, wallets, transactions, cards, loans/savings, sessions, login history, KYC, tickets, notes, audit). Actions (reason required, audited, user emailed where relevant): suspend/unsuspend, block/unblock, close, freeze wallet/card, force logout, credit/debit wallet (BANK_EQUITY, optional value date), **custom transaction** (type, counterparty, description, reference, amount, date, status), reverse transaction, reset 2FA, resend verification, set KYC level, override limits, send notification/email, read-only impersonation (SUPERADMIN), edit profile.
- Transactions explorer with postings; review queue (held/flagged) approve/reject; fraud rules (new-device large outbound, velocity, first-time large beneficiary, drain-after-credit).
- Ledger & treasury: system balances, trial balance, reconciliation, equity top-up.
- KYC queue, Support inbox (assign, reply, internal notes, canned replies, SLA), Cards, Loans (queue, book, products), Bills/Banks/FX management, Sessions (all platform sessions), Notifications broadcast (segments, email/in-app), Announcements, System settings (maintenance + message + ETA, feature flags, fees, limits, thresholds), Admin team (invite, roles), Audit log, CMS-lite (FAQs, contact messages, subscribers), Email outbox.
- RBAC: SUPERADMIN all; ADMIN all except team/settings/impersonation; SUPPORT tickets + users read + notifications; COMPLIANCE KYC, review queue, freeze, fraud flags, audit.

## 6. Notifications, marketing, support, errors, testing

- `NotificationService.notify(user, event, data)` → in-app (SSE push) + email queue per preferences. Security emails mandatory. Templates: verify, welcome, new login, reset/changed password, email change, 2FA, money in/out receipts, transfer status, bill paid, card events, low balance, KYC result, savings maturity, loan events, ticket reply/resolved, suspended/reinstated, broadcast, statement ready. Retries ×5 backoff, logged in EmailLog.
- Marketing pages: Home, Personal, Business, Cards, Savings, Loans, International & FX (live calculator), Pricing, About, Careers, Press, Security, Help/FAQ, Contact, Blog (3 posts), Legal (Terms, Privacy, Cookies, Compliance, Complaints), Status, cookie banner, 404, maintenance.
- Support: tickets with category, priority, attachments (≤5MB img/pdf), linked transaction, thread, close/reopen, FAQ deflection.
- Errors: `{ error: { code, message, details, requestId } }`; stable codes (INSUFFICIENT_FUNDS, LIMIT_EXCEEDED, ACCOUNT_SUSPENDED, INVALID_PIN, FEATURE_DISABLED, MAINTENANCE, …); zod validation shared with frontend; ledger posting in serializable tx with row locks + retry ×3; idempotency; no negative balances except LOAN/SYSTEM; pino logs with requestId.
- Testing: unit (money, fees, limits, FX, fraud), API integration (auth flows, ledger invariants, concurrency, idempotency, reversals, transfers, enforcement, RBAC, maintenance), Playwright E2E (signup+verify via Mailpit, transfer, suspend, maintenance).
- Seed: superadmin `admin@onebank.test`, 2 demo customers with 6 months of history, banks, bill providers, FX rates, loan products, FAQs.

## 7. Build phases

1. Monorepo scaffold, docker-compose, shared packages, Prisma schema + seed.
2. API: auth, sessions, settings/maintenance, audit, notifications/email.
3. API: ledger, accounts, transfers, FX, bills, cards, savings, loans, statements, support, KYC.
4. API: admin module, analytics, fraud.
5. Web: marketing site + auth pages + customer app.
6. Admin app.
7. Tests + E2E + README.
