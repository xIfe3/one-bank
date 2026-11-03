import type { INestApplication } from '@nestjs/common';
import { LedgerService } from '../src/modules/core/ledger.service';
import { TransfersService } from '../src/modules/banking/transfers.service';
import { PIN, PASSWORD, adminClient, balance, bootApp, Client, key, newCustomer, prepareDatabase, prisma } from './helpers';

let app: INestApplication;

beforeAll(async () => {
  await prepareDatabase();
  app = await bootApp();
}, 180_000);

afterAll(async () => {
  await app?.close();
  await prisma.$disconnect();
});

describe('auth', () => {
  it('blocks login until email is verified, then logs in', async () => {
    const c = await new Client(app).init();
    const email = `pending${Date.now()}@example.com`;
    const s = await c.post('/auth/signup', {
      email,
      password: PASSWORD,
      firstName: 'Pat',
      lastName: 'Pending',
      phone: '+15555550111',
      country: 'US',
      dateOfBirth: '1991-02-02',
      addressLine1: '2 Test Street',
      city: 'Austin',
      baseCurrency: 'EUR',
      acceptTerms: true,
    });
    expect(s.status).toBe(201);
    const blocked = await c.post('/auth/login', { email, password: PASSWORD });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('EMAIL_NOT_VERIFIED');

    const mail = await prisma.emailLog.findFirstOrThrow({ where: { to: email, template: 'verify-email' } });
    const token = /token=([\w-]+)/.exec(mail.html)![1];
    expect((await c.post('/auth/verify-email', { token })).status).toBe(200);
    // Token is single use
    expect((await c.post('/auth/verify-email', { token })).status).toBe(400);

    const ok = await c.post('/auth/login', { email, password: PASSWORD });
    expect(ok.status).toBe(200);
    const me = await c.get('/me');
    expect(me.body.status).toBe('ACTIVE');
    const accts = await c.get('/accounts');
    expect(accts.body.accounts[0].currency).toBe('EUR');
  });

  it('rejects mutations whose CSRF header does not match the cookie', async () => {
    const { client } = await newCustomer(app);
    const forged = await client.req('post', '/me/notifications/read', {}, 'x'.repeat(43));
    expect(forged.status).toBe(403);
    const missing = await client.req('post', '/me/notifications/read', {}, '');
    expect(missing.status).toBe(403);
    expect((await client.post('/me/notifications/read', {})).status).toBe(200);
  });

  it('rotates refresh tokens and revokes the family on reuse', async () => {
    const { client, user } = await newCustomer(app);
    const first = client.cookie('ob_rt')!;
    expect((await client.post('/auth/refresh')).status).toBe(200);
    expect(client.cookie('ob_rt')).not.toEqual(first);

    // Replay the old (rotated) refresh token: should be treated as theft.
    const attacker = await new Client(app).init();
    attacker.setCookie('ob_rt', first);
    const reuse = await attacker.post('/auth/refresh');
    expect(reuse.status).toBe(401);
    const active = await prisma.session.count({ where: { userId: user.id, revokedAt: null } });
    expect(active).toBe(0);
  });

  it('password reset revokes all sessions and does not leak account existence', async () => {
    const { client, email } = await newCustomer(app);
    const anon = await new Client(app).init();
    const unknown = await anon.post('/auth/forgot-password', { email: 'nobody@example.com' });
    const known = await anon.post('/auth/forgot-password', { email });
    expect(unknown.status).toBe(200);
    expect(known.body.message).toEqual(unknown.body.message);
    const mail = await prisma.emailLog.findFirstOrThrow({ where: { to: email, template: 'password-reset' } });
    const token = /reset-password\?token=([\w-]+)/.exec(mail.html)![1];
    expect((await anon.post('/auth/reset-password', { token, password: 'An0therPassword!' })).status).toBe(200);
    expect((await client.get('/me')).status).toBe(401);
    expect((await anon.post('/auth/login', { email, password: 'An0therPassword!' })).status).toBe(200);
  });

  it('locks the account after 5 failed attempts', async () => {
    const { email } = await newCustomer(app);
    const c = await new Client(app).init();
    for (let i = 0; i < 4; i++) expect((await c.post('/auth/login', { email, password: 'wrong' })).status).toBe(401);
    const locked = await c.post('/auth/login', { email, password: 'wrong' });
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
    expect((await c.post('/auth/login', { email, password: PASSWORD })).body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('lists and revokes devices', async () => {
    const { client, email } = await newCustomer(app);
    const second = await new Client(app).init();
    await second.post('/auth/login', { email, password: PASSWORD });
    const sessions = await client.get('/me/sessions');
    expect(sessions.body.length).toBe(2);
    const other = sessions.body.find((s: { current: boolean }) => !s.current);
    expect((await client.del(`/me/sessions/${other.id}`)).status).toBe(200);
    expect((await second.get('/me')).status).toBe(401);
    expect((await client.get('/me')).status).toBe(200);
  });
});

describe('ledger & money movement', () => {
  it('internal transfer moves money, is idempotent and keeps the books balanced', async () => {
    const { client, wallet } = await newCustomer(app, { fund: 300 });
    const alex = await prisma.ledgerAccount.findFirstOrThrow({ where: { owner: { email: 'alex@onebank.test' }, currency: 'USD', type: 'CUSTOMER_WALLET' } });
    const before = await balance(alex.id);
    const k = key();
    const r1 = await client.post('/transfers/internal', { fromAccountId: wallet.id, recipient: '@alex', amount: 120.5, pin: PIN, idempotencyKey: k });
    const r2 = await client.post('/transfers/internal', { fromAccountId: wallet.id, recipient: '@alex', amount: 120.5, pin: PIN, idempotencyKey: k });
    expect(r1.status).toBe(201);
    expect(r2.body.id).toBe(r1.body.id);
    expect((await balance(wallet.id)).balance).toBeCloseTo(179.5);
    expect((await balance(alex.id)).balance).toBeCloseTo(before.balance + 120.5);
    const rec = await app.get(LedgerService).reconcile();
    expect(rec.ok).toBe(true);
  });

  it('rejects wrong PIN and insufficient funds', async () => {
    const { client, wallet } = await newCustomer(app, { fund: 50 });
    const bad = await client.post('/transfers/internal', { fromAccountId: wallet.id, recipient: '@alex', amount: 10, pin: '9999', idempotencyKey: key() });
    expect(bad.body.error.code).toBe('INVALID_PIN');
    const broke = await client.post('/transfers/internal', { fromAccountId: wallet.id, recipient: '@alex', amount: 75, pin: PIN, idempotencyKey: key() });
    expect(broke.body.error.code).toBe('INSUFFICIENT_FUNDS');
    expect((await balance(wallet.id)).balance).toBe(50);
  });

  it('never double-spends under concurrent transfers', async () => {
    const { client, wallet } = await newCustomer(app, { fund: 100, kycLevel: 2 });
    const results = await Promise.all(Array.from({ length: 8 }, () => client.post('/transfers/internal', { fromAccountId: wallet.id, recipient: '@alex', amount: 30, pin: PIN, idempotencyKey: key() })));
    const ok = results.filter((r) => r.status === 201).length;
    expect(ok).toBe(3);
    const b = await balance(wallet.id);
    expect(b.balance).toBeCloseTo(10);
    expect(b.balance).toBeGreaterThanOrEqual(0);
    expect((await app.get(LedgerService).reconcile()).ok).toBe(true);
  }, 60_000);

  it('enforces KYC daily limits', async () => {
    const { client, wallet } = await newCustomer(app, { fund: 2000 });
    const r = await client.post('/transfers/internal', { fromAccountId: wallet.id, recipient: '@alex', amount: 600, pin: PIN, idempotencyKey: key() });
    expect(r.body.error.code).toBe('LIMIT_EXCEEDED');
  });

  it('interbank transfer holds funds, then settles', async () => {
    const { client, wallet } = await newCustomer(app, { fund: 200 });
    const r = await client.post('/transfers/interbank', { fromAccountId: wallet.id, bankCode: 'CHASUS', accountNumber: '12345678', accountName: 'Jane Doe', amount: 50, pin: PIN, idempotencyKey: key() });
    expect(r.status).toBe(201);
    let b = await balance(wallet.id);
    expect(b.balance).toBe(200);
    expect(b.available).toBeCloseTo(148.5); // 50 + $1.50 fee on hold
    await app.get(TransfersService).advance(r.body.transferId);
    b = await balance(wallet.id);
    expect(b.balance).toBeCloseTo(148.5);
    expect(b.available).toBeCloseTo(148.5);
    const t = await prisma.transfer.findUniqueOrThrow({ where: { id: r.body.transferId } });
    expect(t.status).toBe('COMPLETED');
    expect((await app.get(LedgerService).reconcile()).ok).toBe(true);
  });

  it('a beneficiary-bank rejection releases the hold', async () => {
    const { client, wallet } = await newCustomer(app, { fund: 100 });
    const r = await client.post('/transfers/interbank', { fromAccountId: wallet.id, bankCode: 'CHASUS', accountNumber: '99990000', accountName: 'Closed Account', amount: 20, pin: PIN, idempotencyKey: key() });
    await app.get(TransfersService).advance(r.body.transferId);
    const b = await balance(wallet.id);
    expect(b.balance).toBe(100);
    expect(b.available).toBe(100);
    expect((await prisma.transfer.findUniqueOrThrow({ where: { id: r.body.transferId } })).status).toBe('FAILED');
  });

  it('FX exchange converts via the FX pool with a locked quote', async () => {
    const { client, wallet } = await newCustomer(app, { fund: 100 });
    const eur = (await client.post('/accounts', { currency: 'EUR' })).body;
    const q = await client.post('/fx/quote', { from: 'USD', to: 'EUR', amount: 40 });
    const x = await client.post('/fx/exchange', { fromAccountId: wallet.id, toAccountId: eur.id, amount: 40, quoteId: q.body.id, pin: PIN, idempotencyKey: key() });
    expect(x.status).toBe(201);
    expect((await balance(eur.id)).balance).toBeCloseTo(Number(q.body.converted));
    // Quotes are single-use
    const again = await client.post('/fx/exchange', { fromAccountId: wallet.id, toAccountId: eur.id, amount: 40, quoteId: q.body.id, pin: PIN, idempotencyKey: key() });
    expect(again.status).toBe(409);
    expect((await app.get(LedgerService).reconcile()).ok).toBe(true);
  });
});

describe('admin controls', () => {
  it('suspended customers cannot move money; blocked customers cannot sign in', async () => {
    const admin = await adminClient(app);
    const { client, user, wallet, email } = await newCustomer(app, { fund: 100 });
    expect((await admin.post(`/admin/users/${user.id}/status`, { status: 'SUSPENDED', reason: 'test' })).status).toBe(200);
    const r = await client.post('/transfers/internal', { fromAccountId: wallet.id, recipient: '@alex', amount: 1, pin: PIN, idempotencyKey: key() });
    expect(r.body.error.code).toBe('ACCOUNT_SUSPENDED');
    expect((await client.get('/accounts')).status).toBe(200);

    await admin.post(`/admin/users/${user.id}/status`, { status: 'BLOCKED', reason: 'test' });
    expect((await client.get('/me')).status).toBe(401);
    const login = await (await new Client(app).init()).post('/auth/login', { email, password: PASSWORD });
    expect(login.body.error.code).toBe('ACCOUNT_BLOCKED');
    const audit = await prisma.auditLog.count({ where: { targetId: user.id, action: { startsWith: 'user.status' } } });
    expect(audit).toBe(2);
  });

  it('credits, posts custom transactions and reverses them with balanced entries', async () => {
    const admin = await adminClient(app);
    const { client, wallet } = await newCustomer(app);
    const credit = await admin.post('/admin/ledger/adjust', { accountId: wallet.id, direction: 'CREDIT', amount: 250, kind: 'BONUS', description: 'Welcome bonus', reason: 'test' });
    expect(credit.status).toBe(201);
    const custom = await admin.post('/admin/ledger/custom-transaction', { accountId: wallet.id, direction: 'CREDIT', type: 'WIRE', amount: 1000, counterpartyName: 'ACME Ltd', description: 'Incoming wire from ACME Ltd', valueDate: '2026-09-01', reason: 'test' });
    expect(custom.status).toBe(201);
    expect((await balance(wallet.id)).balance).toBe(1250);
    const tx = await client.get('/transactions');
    expect(tx.body.items.some((t: { description: string }) => t.description === 'Incoming wire from ACME Ltd')).toBe(true);

    expect((await admin.post(`/admin/transactions/${custom.body.id}/reverse`, { reason: 'test' })).status).toBe(200);
    expect((await balance(wallet.id)).balance).toBe(250);
    expect((await admin.post(`/admin/transactions/${custom.body.id}/reverse`, { reason: 'again' })).status).toBe(409);
    expect((await app.get(LedgerService).reconcile()).ok).toBe(true);
  });

  it('enforces role permissions', async () => {
    const support = await adminClient(app, 'support@onebank.test');
    const { wallet } = await newCustomer(app);
    const r = await support.post('/admin/ledger/adjust', { accountId: wallet.id, direction: 'CREDIT', amount: 10, kind: 'BONUS', description: 'x', reason: 'not allowed' });
    expect(r.status).toBe(403);
    expect((await support.get('/admin/tickets')).status).toBe(200);
    expect((await support.put('/admin/settings', { maintenanceMode: true })).status).toBe(403);
  });

  it('customer cookies cannot access admin routes', async () => {
    const { client } = await newCustomer(app);
    expect((await client.get('/admin/overview')).status).toBe(401);
  });

  it('maintenance mode blocks customers but not admins', async () => {
    const admin = await adminClient(app);
    const { client } = await newCustomer(app);
    await admin.put('/admin/settings', { maintenanceMode: true, maintenanceMessage: 'Back soon' });
    const r = await client.get('/accounts');
    expect(r.status).toBe(503);
    expect(r.body.error.message).toBe('Back soon');
    expect((await client.get('/public/status')).body.maintenanceMode).toBe(true);
    expect((await admin.get('/admin/overview')).status).toBe(200);
    await admin.put('/admin/settings', { maintenanceMode: false });
    expect((await client.get('/accounts')).status).toBe(200);
  });

  it('feature flags disable individual services', async () => {
    const admin = await adminClient(app);
    const { client, wallet } = await newCustomer(app, { fund: 50 });
    await admin.put('/admin/settings', { features: { bills: false } });
    const provider = await prisma.billProvider.findFirstOrThrow({ where: { currencies: { has: 'USD' } } });
    const r = await client.post('/bills/pay', { fromAccountId: wallet.id, providerId: provider.id, category: provider.category, customerId: '12345678', amount: 5, pin: PIN, idempotencyKey: key() });
    expect(r.body.error.code).toBe('FEATURE_DISABLED');
    await admin.put('/admin/settings', { features: { bills: true } });
  });

  it('holds large transfers for review and approves them', async () => {
    const admin = await adminClient(app);
    const { client, user, wallet } = await newCustomer(app, { kycLevel: 3 });
    await admin.post('/admin/ledger/adjust', { accountId: wallet.id, direction: 'CREDIT', amount: 9000, kind: 'ADJUSTMENT', description: 'Funding', reason: 'test', notifyUser: false });
    await prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: false } });
    // Above the OTP threshold: request an emailed code first.
    const first = await client.post('/transfers/interbank', { fromAccountId: wallet.id, bankCode: 'CHASUS', accountNumber: '55667788', accountName: 'Big Payee', amount: 6000, pin: PIN, idempotencyKey: key() });
    expect(first.body.error.code).toBe('TWO_FACTOR_REQUIRED');
    await client.post('/me/otp');
    const { RedisService } = await import('../src/common/infra');
    const otp = await app.get(RedisService).client.get(`otp:${user.id}`);
    const r = await client.post('/transfers/interbank', { fromAccountId: wallet.id, bankCode: 'CHASUS', accountNumber: '55667788', accountName: 'Big Payee', amount: 6000, pin: PIN, otp, idempotencyKey: key() });
    expect(r.body.status).toBe('AWAITING_REVIEW');
    const queue = await admin.get('/admin/review-queue');
    expect(queue.body.some((t: { id: string }) => t.id === r.body.transferId)).toBe(true);
    expect((await admin.post(`/admin/transfers/${r.body.transferId}/approve`, { note: 'ok' })).status).toBe(200);
    expect((await prisma.transfer.findUniqueOrThrow({ where: { id: r.body.transferId } })).status).toBe('COMPLETED');
  });
});
