import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import { authenticator } from 'otplib';
import request from 'supertest';
import { createApp } from '../src/main';

export const prisma = new PrismaClient();

/**
 * Prepare the dedicated test database without destroying anything: create it if missing,
 * apply pending migrations, and run the (idempotent) seed. Tests use unique users per run,
 * so they do not depend on an empty database.
 */
export async function prepareDatabase() {
  const testUrl = new URL(process.env.DATABASE_URL!);
  const dbName = testUrl.pathname.slice(1);
  if (!/^[a-z_]+_test$/.test(dbName)) throw new Error(`Refusing to run tests against non-test database "${dbName}"`);
  const adminUrl = new URL(testUrl);
  adminUrl.pathname = '/postgres';
  const root = new PrismaClient({ datasourceUrl: adminUrl.toString() });
  const exists = await root.$queryRaw<{ n: number }[]>`SELECT 1 AS n FROM pg_database WHERE datname = ${dbName}`;
  if (!exists.length) await root.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  await root.$disconnect();
  const env = { ...process.env, DATABASE_URL: process.env.DATABASE_URL! };
  execSync('npx prisma migrate deploy', { env, stdio: 'pipe', cwd: __dirname + '/..' });
  execSync('npx ts-node --transpile-only prisma/seed.ts', { env, stdio: 'pipe', cwd: __dirname + '/..' });
}

export async function bootApp(): Promise<INestApplication> {
  const app = await createApp();
  await app.init();
  return app;
}

/** Cookie-jar client that handles CSRF like the real frontends do. */
export class Client {
  private cookies = new Map<string, string>();
  constructor(private readonly app: INestApplication) {}

  private store(res: request.Response) {
    const set = res.headers['set-cookie'] as unknown as string[] | undefined;
    for (const c of set ?? []) {
      const [kv] = c.split(';');
      const i = kv.indexOf('=');
      const k = kv.slice(0, i);
      const v = kv.slice(i + 1);
      if (v === '' || /Expires=Thu, 01 Jan 1970/.test(c)) this.cookies.delete(k);
      else this.cookies.set(k, v);
    }
  }
  cookie(name: string) {
    return this.cookies.get(name);
  }
  setCookie(name: string, value: string) {
    this.cookies.set(name, value);
  }
  private header() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  async init() {
    const res = await request(this.app.getHttpServer()).get('/api/v1/csrf');
    this.store(res);
    return this;
  }
  async req(method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, body?: object, csrfOverride?: string) {
    let r = request(this.app.getHttpServer())[method](`/api/v1${path}`).set('Cookie', this.header());
    if (method !== 'get') r = r.set('x-csrf-token', csrfOverride ?? this.cookies.get('ob_csrf') ?? '');
    const res = body ? await r.send(body) : await r;
    this.store(res);
    return res;
  }
  get(p: string) {
    return this.req('get', p);
  }
  post(p: string, b: object = {}) {
    return this.req('post', p, b);
  }
  put(p: string, b: object = {}) {
    return this.req('put', p, b);
  }
  patch(p: string, b: object = {}) {
    return this.req('patch', p, b);
  }
  del(p: string) {
    return this.req('delete', p);
  }
}

export const PASSWORD = 'Str0ngPassword!';
export const PIN = '2468';
let seq = 0;
export const key = () => `test-${Date.now()}-${++seq}-${Math.random().toString(36).slice(2, 8)}`;

/** Full signup → verify → login → PIN; returns a logged-in client with a funded USD wallet. */
export async function newCustomer(app: INestApplication, opts: { fund?: number; kycLevel?: number } = {}) {
  const c = await new Client(app).init();
  const email = `u${Date.now()}${++seq}@example.com`;
  const signup = await c.post('/auth/signup', {
    email,
    password: PASSWORD,
    firstName: 'Test',
    lastName: `User${seq}`,
    phone: '+15555550100',
    country: 'US',
    dateOfBirth: '1990-01-01',
    addressLine1: '1 Test Street',
    city: 'Austin',
    state: 'TX',
    postalCode: '73301',
    baseCurrency: 'USD',
    acceptTerms: true,
  });
  if (signup.status !== 201) throw new Error(`signup failed ${JSON.stringify(signup.body)}`);
  const mail = await prisma.emailLog.findFirstOrThrow({ where: { to: email, template: 'verify-email' }, orderBy: { createdAt: 'desc' } });
  const token = /verify-email\?token=([\w-]+)/.exec(mail.html)![1];
  await c.post('/auth/verify-email', { token });
  const login = await c.post('/auth/login', { email, password: PASSWORD });
  if (login.status !== 200) throw new Error(`login failed ${JSON.stringify(login.body)}`);
  await c.post('/me/pin', { pin: PIN, password: PASSWORD });
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  if (opts.kycLevel !== undefined) await prisma.user.update({ where: { id: user.id }, data: { kycLevel: opts.kycLevel } });
  const wallet = await prisma.ledgerAccount.findFirstOrThrow({ where: { ownerId: user.id, type: 'CUSTOMER_WALLET' } });
  if (opts.fund) {
    const r = await c.post('/accounts/deposit', { accountId: wallet.id, amount: opts.fund, method: 'CARD', pin: PIN, idempotencyKey: key() });
    if (r.status !== 201) throw new Error(`deposit failed ${JSON.stringify(r.body)}`);
  }
  return { client: c, user, wallet, email };
}

/** Admin login including first-time TOTP setup. */
export async function adminClient(app: INestApplication, email = 'admin@onebank.test') {
  const c = await new Client(app).init();
  const r = await c.post('/admin/auth/login', { email, password: 'Admin@OneBank2026' });
  let secret = r.body.secret as string | undefined;
  if (!secret) {
    const admin = await prisma.adminUser.findUniqueOrThrow({ where: { email } });
    // Re-use the stored secret when 2FA was already set up earlier in the run.
    const { decrypt } = await import('../src/common/crypto');
    secret = decrypt(admin.twoFactorSecret!);
  }
  const ok = await c.post('/admin/auth/login/2fa', { challengeToken: r.body.challengeToken, code: authenticator.generate(secret) });
  if (ok.status !== 200) throw new Error(`admin 2fa failed ${JSON.stringify(ok.body)}`);
  return c;
}

export async function balance(accountId: string) {
  const a = await prisma.ledgerAccount.findUniqueOrThrow({ where: { id: accountId } });
  return { balance: Number(a.balance), available: Number(a.availableBalance) };
}
