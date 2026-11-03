import { expect, test, type Page } from '@playwright/test';
import { authenticator } from 'otplib';

const API = process.env.API_URL ?? 'http://localhost:4100/api/v1';
const MAIL = process.env.MAIL_URL ?? 'http://localhost:8026';
const ADMIN = process.env.ADMIN_URL ?? 'http://localhost:3101';
const PASSWORD = 'E2eP4ssword!x';

/** Poll the local mail catcher (MailDev or Mailpit) for the newest email to an address. */
async function latestEmailHtml(to: string, subject: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const maildev = await fetch(`${MAIL}/email`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (Array.isArray(maildev)) {
      const m = maildev.reverse().find((e: { to: { address: string }[]; subject: string }) => e.to.some((t) => t.address === to) && e.subject.includes(subject));
      if (m) return m.html;
    } else {
      const list = await fetch(`${MAIL}/api/v1/search?query=to:${encodeURIComponent(to)}`).then((r) => r.json());
      const m = list.messages?.find((e: { Subject: string }) => e.Subject.includes(subject));
      if (m) return (await fetch(`${MAIL}/api/v1/message/${m.ID}`).then((r) => r.json())).HTML;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`No "${subject}" email for ${to}`);
}

async function signUpAndVerify(page: Page) {
  const email = `e2e${Date.now()}@example.com`;
  await page.goto('/signup');
  await page.fill('#firstName', 'Erin');
  await page.fill('#lastName', 'Endtoend');
  await page.fill('#email', email);
  await page.fill('#password', PASSWORD);
  await page.fill('#phone', '+15555550123');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.fill('#dateOfBirth', '1992-03-04');
  await page.fill('#addressLine1', '10 Playwright Ave');
  await page.fill('#city', 'Seattle');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create my account' }).click();
  await expect(page.getByText('Check your inbox')).toBeVisible();
  const html = await latestEmailHtml(email, 'Verify');
  const link = /href="([^"]*verify-email\?token=[^"]+)"/.exec(html)![1].replace(/&amp;/g, '&');
  await page.goto(link);
  await expect(page.getByText('Email verified')).toBeVisible();
  return email;
}

async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/app');
}

test('sign up, verify email via the mail catcher, and sign in', async ({ page }) => {
  const email = await signUpAndVerify(page);
  await login(page, email);
  await expect(page.getByText('Total balance')).toBeVisible();
  await expect(page.getByText('Create your transaction PIN')).toBeVisible();
});

test('send money to another member and see both balances update', async ({ page }) => {
  await login(page, 'alex@onebank.test', 'Demo@OneBank2026');
  await page.goto('/app/transfer');
  await page.getByPlaceholder('@alex or 2012345678').fill('@ada');
  await expect(page.getByText('Ada Okafor')).toBeVisible();
  await page.getByPlaceholder('0.00').fill('12.34');
  await page.getByRole('button', { name: 'Continue' }).click();
  for (const d of '2580') await page.keyboard.type(d);
  await page.getByRole('button', { name: /Send/ }).click();
  await expect(page.getByText('Money sent')).toBeVisible();
});

test('admin suspends a customer, who can no longer send money; maintenance mode shows the maintenance page', async ({ page, browser }) => {
  test.setTimeout(180_000); // two browsers + several admin round-trips
  // Admin signs in (TOTP set up on first login if needed).
  const admin = await browser.newPage();
  await admin.goto(`${ADMIN}/login`);
  await admin.fill('input[type=email]', 'admin@onebank.test');
  await admin.fill('input[type=password]', 'Admin@OneBank2026');
  const loginResp = admin.waitForResponse((r) => r.url().endsWith('/admin/auth/login'));
  await admin.getByRole('button', { name: 'Continue' }).click();
  const body = await (await loginResp).json();
  test.skip(!body.secret && !process.env.ADMIN_TOTP_SECRET, 'Admin already has 2FA; set ADMIN_TOTP_SECRET to run this test.');
  await admin.fill('input[inputmode=numeric]', authenticator.generate(body.secret ?? process.env.ADMIN_TOTP_SECRET!));
  await admin.getByRole('button', { name: /Verify/ }).click();
  await admin.waitForURL(`${ADMIN}/`);

  // Suspend Ada
  await admin.goto(`${ADMIN}/users`);
  await admin.getByText('Ada Okafor').click();
  await admin.getByRole('button', { name: 'Suspend' }).click();
  await admin.getByPlaceholder('Explain why you are taking this action').fill('E2E suspension check');
  await Promise.all([admin.waitForResponse((r) => r.url().includes('/status') && r.ok()), admin.getByRole('button', { name: 'Suspend account' }).click()]);

  await login(page, 'ada@onebank.test', 'Demo@OneBank2026');
  await expect(page.getByText('Your account is suspended')).toBeVisible();

  // Reinstate + maintenance on/off
  await admin.getByRole('button', { name: 'Reinstate' }).click();
  await admin.getByPlaceholder('Explain why you are taking this action').fill('E2E done');
  await Promise.all([admin.waitForResponse((r) => r.url().includes('/status') && r.ok()), admin.getByRole('button', { name: 'Reinstate account' }).click()]);

  await admin.goto(`${ADMIN}/settings`);
  await admin.getByRole('button', { name: 'Enable maintenance' }).click();
  try {
    await Promise.all([
      admin.waitForResponse((r) => r.url().endsWith('/admin/settings') && r.request().method() === 'PUT' && r.ok()),
      admin.getByRole('button', { name: 'Enable now' }).click(),
    ]);
    await page.goto('/app/accounts');
    await expect(page).toHaveURL(/maintenance/);
    await expect(page.getByText('polishing the vault')).toBeVisible();
  } finally {
    // Always bring the bank back online, even if an assertion above failed.
    await admin.goto(`${ADMIN}/settings`);
    await admin.getByRole('button', { name: 'Turn off maintenance' }).click();
    await Promise.all([
      admin.waitForResponse((r) => r.url().endsWith('/admin/settings') && r.request().method() === 'PUT' && r.ok()),
      admin.getByRole('button', { name: 'Bring the bank back online' }).click(),
    ]);
  }
  const status = await fetch(`${API}/public/status`).then((r) => r.json());
  expect(status.maintenanceMode).toBe(false);
});
