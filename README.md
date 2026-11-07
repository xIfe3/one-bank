# One Bank

A full-stack, multi-currency digital bank: marketing site, customer banking app, and a superadmin console, backed by a double-entry ledger.

> **Before going live:** the ledger, accounts and product logic are production-grade, but the external rails are still stubs.
> - Card/bank top-ups are funded from bank equity.
> - Bank-name lookup, bill tokens and card numbers are generated locally.
> - Interbank transfers and wires settle on a timer.
>
> Connect licensed providers (partner bank or banking licence, payments/ACH/SWIFT, card issuing, KYC) and fill in every `[Company legal name]`, `[Regulator]` and `[Partner Bank]` placeholder in the legal pages, footer, FAQ and PDFs before taking real customers.

| App | Path | URL |
|---|---|---|
| Customer site + banking app | `apps/web` (Next.js 15) | http://localhost:3100 |
| Superadmin console | `apps/admin` (Next.js 15) | http://localhost:3101 |
| API | `apps/api` (NestJS 11, Prisma, PostgreSQL, Redis/BullMQ) | http://localhost:4100/api/v1 |
| Mail catcher | MailDev (`pnpm mail`) or Mailpit (`--profile mail`) | http://localhost:8026 |

**Look and feel:** navy + gold. **Libre Caslon Display** for large headings, **Libre Caslon Text** for small titles, and **Libre Franklin** for UI text and all money (fixed-width digits). The fonts are self-hosted from `apps/*/public/fonts` (rules in `packages/ui/fonts.css`), so builds never need Google Fonts.

Shared code lives in `packages/shared` (zod schemas, money maths, enums) and `packages/ui` (design system and API client).

## Quick start

Requires Node 22+, pnpm 10, and Docker.

```bash
pnpm install
cp .env.example apps/api/.env          # already present if you cloned this workspace
docker compose up -d                   # Postgres :5440, Redis :6390
pnpm mail                              # SMTP catcher on :1026, inbox UI on :8026 (separate terminal)
pnpm db:migrate                        # create tables
pnpm db:seed                           # reference data + demo users
pnpm dev                               # api :4100, web :3100, admin :3101
```

### Demo logins

| Who | Email | Password | Notes |
|---|---|---|---|
| Customer | `alex@onebank.test` | `Demo@OneBank2026` | PIN `2580`, KYC level 2, USD/EUR/GBP, card, savings, loan |
| Customer | `ada@onebank.test` | `Demo@OneBank2026` | PIN `2580`, KYC level 1, NGN/USD, pending KYC |
| Superadmin | `admin@onebank.test` | `Admin@OneBank2026` | Scan the 2FA QR on first sign-in |
| Admin | `ops@onebank.test` | same | ADMIN role |
| Support | `support@onebank.test` | same | SUPPORT role |
| Compliance | `compliance@onebank.test` | same | COMPLIANCE role |

Lost the authenticator for an admin? Run `pnpm seed:reset-admin-2fa [email]`.

Every email (verification, password reset, sign-in alerts, receipts, statements) lands in the mail catcher at http://localhost:8026.

## Features

**Customers**
- **Auth:** 3-step sign-up, email verification, login with lockout, TOTP two-factor with backup codes, forgot/reset password, change email (confirmed at the new address, with an alert to the old one), "This wasn't me" lockdown link in new-device emails.
- **Sessions:** a list of every signed-in device (browser, OS, IP, location, last active), revoke one or all others, and sign-in history.
- **Accounts:** USD, EUR, GBP and NGN wallets, each with its own account number; simulated add-money; currency exchange with a 30-second locked quote.
- **Transfers:**
  - Between One Bank members (by account number or @tag), instant.
  - To other banks, with account-name lookup.
  - International SWIFT wires, with a status timeline.
  - Scheduled and recurring payments.
  - Saved beneficiaries.
- **Bills:** airtime, data, electricity (with token), TV, internet and water.
- **Virtual cards:** Visa or Mastercard; fund and withdraw, freeze, spend limit, reveal details only after PIN, terminate, simulated purchases and declines.
- **Savings and loans:** goals with auto-save and monthly interest; fixed deposits (30–365 days) with early-break penalty; loans with amortised schedules, automatic collection and late fees.
- **Records:**
  - Transactions with filters, search and CSV export.
  - A PDF receipt for every transaction.
  - PDF statements (download or email).
  - Spending insights.
- **Security:**
  - Transaction PIN (locks after 5 wrong attempts).
  - Extra one-time code for large payments (authenticator app or email).
  - Daily and per-payment limits by KYC level.
  - KYC upload (ID + selfie, proof of address).
  - Referrals with bonus.
- **Support and notifications:** tickets with attachments, FAQ suggestions, linking a ticket to a transaction; live in-app notifications (server-sent events) plus email, with per-category preferences.

**Superadmin console**
- **Dashboard:** KPIs (deposits, volume, fee revenue, customers online, queues), charts, and a live activity feed.
- **Users:** search, a full profile page, **suspend / block / reinstate / close**, freeze accounts, force logout, reset two-factor, clear locks, set KYC level, override limits, message the customer, internal notes, read-only customer view.
- **Ledger:**
  - **Credit/debit any wallet** (optionally back-dated).
  - **Add custom transactions**, e.g. "Incoming wire from ACME".
  - **Reverse** any transaction.
  - Settle or fail pending entries.
  - **Reconciliation** with a trial balance.
- **Review and fraud:** large or flagged transfers are held for approve/reject; fraud flags come from rules (new-device large payment, velocity, first-time large recipient, money drained soon after a large credit).
- **Approval queues:** KYC review with document viewer; support inbox (assignment, internal notes, canned replies, SLA stats); card controls; loan approvals, loan book and products.
- **Platform:** **maintenance mode** with message and expected end time, **feature flags** per service, fees, limits, thresholds, FX rates, banks, billers, FAQs.
- **Communications:** broadcast to customer segments (in-app and/or email), announcements, and an email outbox with preview and resend.
- **Oversight:** active sessions across the platform; admin team with invites and roles; **audit log** of every privileged action (with before/after diff and CSV export).

Roles: **SUPERADMIN** (everything), **ADMIN**, **SUPPORT**, **COMPLIANCE**. Each is enforced by the API and reflected in the UI.

## Architecture notes

- **Double-entry ledger** (`apps/api/src/modules/core/ledger.service.ts`):
  - Every money movement is a journal entry whose postings sum to zero per currency.
  - Postings run in a SERIALIZABLE transaction with ordered row locks, retried on conflict.
  - Idempotency keys prevent double charges.
  - Pending payments place *holds* on the available balance.
  - Reversals post opposite entries; nothing is ever deleted.
  - Bank system accounts (equity, fees, FX pool, settlement accounts, interest, loans) make the books balance.
- **Sessions:**
  - 15-minute access JWT plus a rotating, hashed refresh token in httpOnly cookies.
  - Reusing an old refresh token revokes the whole chain of sessions.
  - Revocations take effect within seconds (Redis-cached session check).
  - Customer and admin cookies, secrets and endpoints are separate.
- **CSRF:** double-submit cookie (`ob_csrf`) plus the `x-csrf-token` header on every mutation.
- **Background jobs** (BullMQ):
  - email delivery with 5 retries and backoff
  - transfer settlement
  - a one-minute scheduler for scheduled transfers, auto-save, deposit maturity, loan collection and monthly interest
- **Errors:** every error is `{ error: { code, message, details, requestId } }` with stable codes such as `INSUFFICIENT_FUNDS` and `MAINTENANCE`.

## Tests

```bash
pnpm --filter @onebank/shared test     # money maths (vitest)
pnpm --filter @onebank/api test        # 23 API integration tests against a separate onebank_test DB
pnpm test:e2e                          # 3 Playwright journeys against the running stack (uses installed Chrome)
pnpm lint                              # ESLint for web, admin and API
```

The API suite covers:
- sign-up, verification and login
- CSRF protection
- refresh-token rotation and reuse detection
- password reset revoking all sessions
- lockout after failed logins
- revoking a device
- idempotency
- concurrent double-spend protection
- KYC limits
- holds and settlement on bank transfers
- a bank rejecting a transfer
- FX exchange
- suspend and block enforcement
- admin credits, custom transactions and reversals
- role permissions
- maintenance mode and feature flags
- the review queue and the one-time-code step for large payments
- security hardening: CSV formula neutralising, upload sanitising, no customer card-simulation endpoint

Each run creates the `onebank_test` database if needed, applies migrations and seeds it. It never wipes a database.

The e2e journeys cover signup with email verification via the mail catcher, a member-to-member transfer, and an admin suspending and reinstating a customer and toggling maintenance mode. The admin journey enrols the seeded superadmin in 2FA, so run `pnpm seed:reset-admin-2fa` afterwards.

## Useful settings (apps/api/.env)

| Variable | Purpose |
|---|---|
| `SMTP_*`, `MAIL_FROM` | Point at Resend, SendGrid, SES, etc. in production |
| `SETTLEMENT_DELAY_MS`, `WIRE_DELAY_MS` | How long simulated bank transfers and wires take |
| `ADMIN_IP_ALLOWLIST` | Comma-separated IPs allowed to reach the admin API |
| `COOKIE_DOMAIN`, `COOKIE_SECURE` | Set to your parent domain and `true` behind HTTPS |
| `ENCRYPTION_KEY` | 32-byte hex key for AES-256-GCM (card numbers, 2FA secrets). **Change it.** |
| `JWT_ACCESS_SECRET`, `JWT_ADMIN_SECRET` | **Change both** for any shared deployment |

## Deploying (Dokploy + Cloudflare R2)

Production runs as one Docker Compose app: [`docker-compose.prod.yml`](docker-compose.prod.yml) with Postgres, Redis, the API, web and admin. Uploads (KYC documents, ticket attachments) go to a **private** Cloudflare R2 bucket and are always streamed through the API, so access checks still apply.

1. **R2:** in Cloudflare create a bucket (for example `onebank-uploads`) and keep public access **off**. Under *R2 → Manage API tokens*, create a token with *Object Read & Write* on that bucket. Note the account ID, access key ID and secret.
2. **DNS:** point three records at your Contabo server's IP, for example `onebank.com`, `admin.onebank.com` and `api.onebank.com`.
3. **Dokploy:** *Create Service → Compose*, connect this repo and branch, and set the compose path to `docker-compose.prod.yml`.
4. **Environment:** paste [`.env.production.example`](.env.production.example) into the Environment tab and fill in every value (`openssl rand -hex 32` for each secret). `PUBLIC_API_URL` and `WEB_URL` are baked into the frontends at build time, so **redeploy** after changing them.
5. **Domains tab:** `web` → `onebank.com` on port **3000**, `admin` → `admin.onebank.com` on port **3000**, `api` → `api.onebank.com` on port **4100**. Turn on HTTPS (Let's Encrypt). With the Cloudflare proxy on, the HTTP challenge still works; or use a Cloudflare Origin Certificate.
6. **Deploy.** On every boot the API runs `prisma migrate deploy`, then an idempotent seed of the reference data. On the first boot it also creates the superadmin from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`. Sign in to the admin console, set up 2FA, then delete `SEED_ADMIN_PASSWORD`.

Notes:
- The demo users are **never** created when `SEED_MODE=production`. Use `SEED_MODE=demo` only on a throwaway staging server.
- Keep `ENCRYPTION_KEY` safe and never change it: card data and 2FA secrets are encrypted with it.
- **Cloudflare proxy (orange cloud):** this stack expects it. `TRUST_PROXY_HOPS=2` (Cloudflare + Traefik) lets the API see the real visitor IP, and location comes from `CF-IPCountry`. For the city as well, turn on *Rules → Managed Transforms → Add visitor location headers*. Set the SSL mode to **Full (strict)**. Turn the proxy off and you must set `TRUST_PROXY_HOPS=1`.
- **Lock the origin to Cloudflare.** If the server can be reached directly by IP, a client can forge `X-Forwarded-For` / `CF-IPCountry` and slip past the rate limits and the admin allowlist. Use Contabo's firewall (or `iptables` on the `DOCKER-USER` chain; plain `ufw` does not filter Docker-published ports) to allow 80/443 only from [Cloudflare's IP ranges](https://www.cloudflare.com/ips/), and keep port 3000 (Dokploy's UI) and SSH restricted to your own IP.
- Back up the `pgdata` volume (Dokploy → Volume Backups, or a scheduled `pg_dump`).
