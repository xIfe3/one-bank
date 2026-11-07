/* eslint-disable no-console */
import 'dotenv/config';
import { EntryType, PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { createHash, randomInt } from 'crypto';
import Decimal from 'decimal.js';
import { encrypt, generatePan, generateReference, randomCode } from '../src/common/crypto';
import { putUpload } from '../src/common/uploads';

const prisma = new PrismaClient();
const CURRENCIES = ['USD', 'EUR', 'GBP', 'NGN'];
const SYSTEM = ['BANK_EQUITY', 'FEES', 'FX_POOL', 'INTERBANK_SETTLEMENT', 'BILLS_SETTLEMENT', 'CARD_SETTLEMENT', 'INTEREST_EXPENSE', 'LOAN_PORTFOLIO'];

export const DEMO = {
  adminEmail: 'admin@onebank.test',
  adminPassword: 'Admin@OneBank2026',
  customerPassword: 'Demo@OneBank2026',
  pin: '2580',
};

const sys = new Map<string, string>();
const acctNo = () => '20' + Array.from({ length: 8 }, () => randomInt(0, 10)).join('');

/** Minimal ledger poster for seeding (same invariants as LedgerService). */
async function post(
  type: EntryType,
  description: string,
  legs: { accountId: string; amount: Decimal.Value }[],
  opts: { date: Date; counterpartyName?: string; counterpartyAccount?: string; counterpartyBank?: string; category?: string; metadata?: object; initiatorType?: string } = { date: new Date() },
) {
  const sum = legs.reduce((s, l) => s.plus(l.amount), new Decimal(0));
  const accts = await prisma.ledgerAccount.findMany({ where: { id: { in: legs.map((l) => l.accountId) } } });
  const byCur = new Map<string, Decimal>();
  for (const l of legs) {
    const a = accts.find((x) => x.id === l.accountId)!;
    byCur.set(a.currency, (byCur.get(a.currency) ?? new Decimal(0)).plus(l.amount));
  }
  if ([...byCur.values()].some((v) => !v.isZero()) || (byCur.size === 1 && !sum.isZero())) throw new Error(`Unbalanced seed entry: ${description}`);
  const entry = await prisma.journalEntry.create({
    data: {
      reference: generateReference(),
      type,
      description,
      category: opts.category,
      counterpartyName: opts.counterpartyName,
      counterpartyAccount: opts.counterpartyAccount,
      counterpartyBank: opts.counterpartyBank,
      initiatorType: opts.initiatorType ?? 'USER',
      valueDate: opts.date,
      createdAt: opts.date,
      metadata: (opts.metadata ?? {}) as object,
    },
  });
  for (const l of legs) {
    const a = await prisma.ledgerAccount.update({
      where: { id: l.accountId },
      data: { balance: { increment: new Decimal(l.amount).toFixed(4) }, availableBalance: { increment: new Decimal(l.amount).toFixed(4) } },
    });
    await prisma.posting.create({ data: { entryId: entry.id, accountId: l.accountId, amount: new Decimal(l.amount).toFixed(4), currency: a.currency, balanceAfter: a.balance, createdAt: opts.date } });
  }
  return entry;
}

async function seedReference() {
  for (const code of SYSTEM)
    for (const currency of CURRENCIES) {
      const a = await prisma.ledgerAccount.upsert({
        where: { systemCode_currency: { systemCode: code, currency } },
        create: { type: 'SYSTEM', systemCode: code, currency, name: `${code} ${currency}` },
        update: {},
      });
      sys.set(`${code}:${currency}`, a.id);
    }

  const rates: [string, number, number][] = [
    ['EUR', 0.92, 0.75],
    ['GBP', 0.79, 0.75],
    ['NGN', 1540, 1.5],
  ];
  for (const [quote, rate, spread] of rates) await prisma.fxRate.upsert({ where: { base_quote: { base: 'USD', quote } }, create: { base: 'USD', quote, rate, spread }, update: {} });

  const banks: [string, string, string][] = [
    ['CHASUS', 'JPMorgan Chase', 'US'],
    ['BOFAUS', 'Bank of America', 'US'],
    ['WFBIUS', 'Wells Fargo', 'US'],
    ['CITIUS', 'Citibank', 'US'],
    ['BARCGB', 'Barclays', 'GB'],
    ['HSBCGB', 'HSBC UK', 'GB'],
    ['DEUTDE', 'Deutsche Bank', 'DE'],
    ['BNPAFR', 'BNP Paribas', 'FR'],
    ['058', 'Guaranty Trust Bank', 'NG'],
    ['044', 'Access Bank', 'NG'],
    ['057', 'Zenith Bank', 'NG'],
    ['033', 'United Bank for Africa', 'NG'],
    ['011', 'First Bank of Nigeria', 'NG'],
  ];
  for (const [code, name, country] of banks) await prisma.bank.upsert({ where: { code }, create: { code, name, country }, update: {} });

  const providers: [string, string, string, string[], string][] = [
    ['AIRTIME', 'MTN Airtime', 'MTN_AIR', ['NGN'], '#FFCC00'],
    ['AIRTIME', 'Airtel Airtime', 'AIRTEL_AIR', ['NGN'], '#E40000'],
    ['AIRTIME', 'Verizon Prepaid', 'VZ_AIR', ['USD'], '#CD040B'],
    ['DATA', 'MTN Data', 'MTN_DATA', ['NGN'], '#FFCC00'],
    ['DATA', 'Glo Data', 'GLO_DATA', ['NGN'], '#4CAF50'],
    ['ELECTRICITY', 'Ikeja Electric (Prepaid)', 'IKEDC', ['NGN'], '#F57C00'],
    ['ELECTRICITY', 'Con Edison', 'CONED', ['USD'], '#1565C0'],
    ['ELECTRICITY', 'British Gas', 'BGAS', ['GBP'], '#0091EA'],
    ['TV', 'DStv', 'DSTV', ['NGN'], '#0277BD'],
    ['TV', 'Netflix', 'NETFLIX', ['USD', 'EUR', 'GBP'], '#E50914'],
    ['INTERNET', 'Comcast Xfinity', 'XFINITY', ['USD'], '#6A1B9A'],
    ['INTERNET', 'Spectranet', 'SPECTRANET', ['NGN'], '#00897B'],
    ['WATER', 'NYC Water Board', 'NYCWB', ['USD'], '#0288D1'],
    ['WATER', 'Thames Water', 'THAMES', ['GBP'], '#00ACC1'],
  ];
  for (const [category, name, code, currencies, logoColor] of providers) {
    await prisma.billProvider.upsert({ where: { code }, create: { category, name, code, currencies, logoColor }, update: {} });
  }

  if (!(await prisma.loanProduct.count())) {
    await prisma.loanProduct.createMany({
      data: [
        { name: 'Personal Loan', description: 'Flexible personal financing for life’s big moments.', currency: 'USD', minAmount: 500, maxAmount: 25000, interestRate: 11.9, minTenorMonths: 3, maxTenorMonths: 36, minKycLevel: 2 },
        { name: 'Quick Cash', description: 'Small, fast loans paid out instantly after approval.', currency: 'USD', minAmount: 100, maxAmount: 2000, interestRate: 18, minTenorMonths: 1, maxTenorMonths: 6, minKycLevel: 2 },
        { name: 'Salary Advance', description: 'Get up to ₦2,000,000 ahead of payday.', currency: 'NGN', minAmount: 50000, maxAmount: 2000000, interestRate: 24, minTenorMonths: 1, maxTenorMonths: 12, minKycLevel: 2 },
        { name: 'Euro Personal Loan', description: 'Personal loans for our European customers.', currency: 'EUR', minAmount: 500, maxAmount: 20000, interestRate: 9.5, minTenorMonths: 6, maxTenorMonths: 36, minKycLevel: 2 },
      ],
    });
  }

  if (!(await prisma.faq.count())) {
    const faqs: [string, string, string][] = [
      ['Getting started', 'How do I open a One Bank account?', 'Tap “Open an account”, fill in your details and verify your email. Your first account is created instantly in your chosen currency.'],
      ['Getting started', 'Is my money protected?', 'Your deposits are held with [Partner Bank / licence holder] and protected by [deposit protection scheme] up to [limit].'],
      ['Getting started', 'Which currencies do you support?', 'You can hold USD, EUR and GBP accounts and exchange between them at transparent rates.'],
      ['Transfers', 'How long do transfers take?', 'Transfers to other One Bank customers are instant. Domestic bank transfers usually settle within minutes; international wires take up to a few hours.'],
      ['Transfers', 'Why is my transfer “under review”?', 'Large or unusual payments are reviewed by our compliance team to keep your money safe. You will be notified once it is complete.'],
      ['Transfers', 'What are my transfer limits?', 'Limits depend on your verification level. See Settings → Limits for your current daily and per-transaction limits.'],
      ['Cards', 'How do I get a virtual card?', 'Go to Cards → New card. Cards are issued instantly and can be funded from any account in the same currency.'],
      ['Cards', 'What should I do if my card is compromised?', 'Freeze it instantly from the Cards page, then terminate it and create a new one. Contact support if you see transactions you do not recognise.'],
      ['Security', 'How do I turn on two-factor authentication?', 'Go to Settings → Security → Two-factor authentication and scan the QR code with an authenticator app such as Google Authenticator or 1Password.'],
      ['Security', 'I forgot my transaction PIN', 'Go to Settings → Security → Transaction PIN and choose “Forgot PIN”. We will email you a code to set a new one.'],
      ['Security', 'How can I see where I am signed in?', 'Settings → Security lists every active device. You can sign out of any device remotely.'],
      ['Savings & loans', 'How is savings interest paid?', 'Interest on savings goals is calculated on your balance and paid monthly. Fixed deposits pay principal plus interest at maturity.'],
      ['Savings & loans', 'Who can apply for a loan?', 'Customers with verification level 2 or higher can apply. Applications are reviewed and, once approved, paid into your account immediately.'],
      ['Account', 'How do I verify my identity?', 'Settings → Verification. Upload a government-issued ID and a selfie for level 2, and a proof of address for level 3.'],
      ['Account', 'How do I close my account?', 'Withdraw all balances, then go to Settings → Profile → Close account.'],
    ];
    await prisma.faq.createMany({ data: faqs.map(([category, question, answer], i) => ({ category, question, answer, order: i })) });
  }

  if (!(await prisma.cannedReply.count())) {
    await prisma.cannedReply.createMany({
      data: [
        { title: 'Greeting', body: 'Hi there, thanks for reaching out to One Bank. I am looking into this for you now.' },
        { title: 'Transfer in review', body: 'Your transfer is undergoing a routine security review. These normally complete within a few hours and we will notify you as soon as it is done.' },
        { title: 'KYC resubmit', body: 'Unfortunately we could not verify your document. Please upload a clear, uncropped photo of a valid government-issued ID together with a selfie.' },
        { title: 'Resolved', body: 'I am glad we could help. I will mark this ticket as resolved — reply any time if you need anything else.' },
      ],
    });
  }

  if (!(await prisma.announcement.count())) {
    await prisma.announcement.create({ data: { title: 'Earn 10% p.a. on 12-month fixed deposits', body: 'Lock in our best-ever rate on fixed deposits this month.', variant: 'PROMO' } });
  }
}

async function seedAdmins() {
  const hash = await argon2.hash(DEMO.adminPassword);
  const admins: [string, string, string, 'SUPERADMIN' | 'ADMIN' | 'SUPPORT' | 'COMPLIANCE'][] = [
    [DEMO.adminEmail, 'Olivia', 'Grant', 'SUPERADMIN'],
    ['ops@onebank.test', 'Daniel', 'Reyes', 'ADMIN'],
    ['support@onebank.test', 'Priya', 'Shah', 'SUPPORT'],
    ['compliance@onebank.test', 'Marcus', 'Lee', 'COMPLIANCE'],
  ];
  for (const [email, firstName, lastName, role] of admins) {
    await prisma.adminUser.upsert({ where: { email }, create: { email, firstName, lastName, role, status: 'ACTIVE', passwordHash: hash }, update: {} });
  }
}

const daysAgo = (n: number, hour = 10) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, randomInt(0, 59), 0, 0);
  return d;
};

async function wallet(ownerId: string, currency: string, primary = false) {
  return prisma.ledgerAccount.create({ data: { type: 'CUSTOMER_WALLET', currency, ownerId, accountNumber: acctNo(), name: `${currency} Account`, isPrimary: primary } });
}

async function seedCustomers() {
  if (await prisma.user.findUnique({ where: { email: 'alex@onebank.test' } })) return;
  const pw = await argon2.hash(DEMO.customerPassword);
  const pin = await argon2.hash(DEMO.pin);
  const prefs = { create: ['SECURITY', 'TRANSACTIONS', 'ACCOUNT', 'SUPPORT', 'MARKETING'].map((category) => ({ category, inApp: true, email: category !== 'MARKETING' })) };

  const alex = await prisma.user.create({
    data: {
      email: 'alex@onebank.test',
      phone: '+1 212 555 0148',
      firstName: 'Alex',
      lastName: 'Morgan',
      dateOfBirth: new Date('1990-04-12'),
      country: 'US',
      addressLine1: '245 Park Avenue',
      city: 'New York',
      state: 'NY',
      postalCode: '10167',
      passwordHash: pw,
      transactionPinHash: pin,
      emailVerifiedAt: daysAgo(190),
      status: 'ACTIVE',
      kycLevel: 2,
      baseCurrency: 'USD',
      tag: 'alex',
      referralCode: randomCode(8),
      createdAt: daysAgo(190),
      notificationPrefs: prefs,
    },
  });
  const ada = await prisma.user.create({
    data: {
      email: 'ada@onebank.test',
      phone: '+234 803 555 0192',
      firstName: 'Ada',
      lastName: 'Okafor',
      dateOfBirth: new Date('1994-09-03'),
      country: 'NG',
      addressLine1: '12 Admiralty Way, Lekki Phase 1',
      city: 'Lagos',
      state: 'Lagos',
      postalCode: '106104',
      passwordHash: pw,
      transactionPinHash: pin,
      emailVerifiedAt: daysAgo(150),
      status: 'ACTIVE',
      kycLevel: 1,
      baseCurrency: 'NGN',
      tag: 'ada',
      referralCode: randomCode(8),
      referredById: alex.id,
      createdAt: daysAgo(150),
      notificationPrefs: prefs,
    },
  });
  await prisma.referral.create({ data: { referrerId: alex.id, refereeId: ada.id } });

  const aUsd = await wallet(alex.id, 'USD', true);
  const aEur = await wallet(alex.id, 'EUR');
  const aGbp = await wallet(alex.id, 'GBP');
  const dNgn = await wallet(ada.id, 'NGN', true);
  const dUsd = await wallet(ada.id, 'USD');
  const s = (code: string, cur: string) => sys.get(`${code}:${cur}`)!;

  // Opening deposits
  await post('DEPOSIT', 'Opening deposit from linked bank account', [{ accountId: s('BANK_EQUITY', 'USD'), amount: -15000 }, { accountId: aUsd.id, amount: 15000 }], { date: daysAgo(185), counterpartyName: 'Chase •••• 1123', category: 'Income' });
  await post('DEPOSIT', 'Opening deposit from linked bank account', [{ accountId: s('BANK_EQUITY', 'NGN'), amount: -2500000 }, { accountId: dNgn.id, amount: 2500000 }], { date: daysAgo(148), counterpartyName: 'GTBank •••• 4410', category: 'Income' });

  // Six months of activity
  for (let m = 5; m >= 0; m--) {
    const base = m * 30 + 3;
    await post('DEPOSIT', 'Salary — Northwind Analytics Inc.', [{ accountId: s('BANK_EQUITY', 'USD'), amount: -6850 }, { accountId: aUsd.id, amount: 6850 }], { date: daysAgo(base, 9), counterpartyName: 'Northwind Analytics Inc.', counterpartyBank: 'Bank of America', category: 'Income', initiatorType: 'SYSTEM' });
    await post('DEPOSIT', 'Salary — Lagos Fintech Hub', [{ accountId: s('BANK_EQUITY', 'NGN'), amount: -950000 }, { accountId: dNgn.id, amount: 950000 }], { date: daysAgo(base, 8), counterpartyName: 'Lagos Fintech Hub Ltd', counterpartyBank: 'Access Bank', category: 'Income', initiatorType: 'SYSTEM' });
    await post('INTERBANK', 'Rent — 245 Park Ave', [{ accountId: aUsd.id, amount: -2401.5 }, { accountId: s('INTERBANK_SETTLEMENT', 'USD'), amount: 2400 }, { accountId: s('FEES', 'USD'), amount: 1.5 }], { date: daysAgo(base - 1, 11), counterpartyName: 'Park Property Mgmt', counterpartyAccount: '7731004412', counterpartyBank: 'JPMorgan Chase', category: 'Housing' });
    const power = 96 + randomInt(0, 60);
    await post('BILL', 'Con Edison · 4412-8810', [{ accountId: aUsd.id, amount: -power }, { accountId: s('BILLS_SETTLEMENT', 'USD'), amount: power }], { date: daysAgo(base - 4, 14), counterpartyName: 'Con Edison', counterpartyAccount: '4412-8810', category: 'Utilities' });
    await post('BILL', 'Netflix · alex.morgan', [{ accountId: aUsd.id, amount: -15.49 }, { accountId: s('BILLS_SETTLEMENT', 'USD'), amount: 15.49 }], { date: daysAgo(base - 6, 20), counterpartyName: 'Netflix', category: 'Entertainment' });
    await post('BILL', 'DStv · 7024419981', [{ accountId: dNgn.id, amount: -29500 }, { accountId: s('BILLS_SETTLEMENT', 'NGN'), amount: 29500 }], { date: daysAgo(base - 5, 18), counterpartyName: 'DStv', category: 'Entertainment' });
    await post('BILL', 'MTN Airtime · 08035550192', [{ accountId: dNgn.id, amount: -5000 }, { accountId: s('BILLS_SETTLEMENT', 'NGN'), amount: 5000 }], { date: daysAgo(base - 8, 12), counterpartyName: 'MTN Airtime', category: 'Phone & Internet' });
    const send = 150 + randomInt(0, 200);
    await post('INTERNAL_TRANSFER', 'Dinner split 🍣', [{ accountId: aUsd.id, amount: -send }, { accountId: dUsd.id, amount: send }], { date: daysAgo(base - 10, 21), counterpartyName: 'Ada Okafor', counterpartyAccount: dUsd.accountNumber!, counterpartyBank: 'One Bank', category: 'Transfers', metadata: { senderName: 'Alex Morgan' } });
    await post('INTERBANK', 'Family support', [{ accountId: dNgn.id, amount: -150050 }, { accountId: s('INTERBANK_SETTLEMENT', 'NGN'), amount: 150000 }, { accountId: s('FEES', 'NGN'), amount: 50 }], { date: daysAgo(base - 12, 10), counterpartyName: 'Chinedu Okafor', counterpartyAccount: '0123456789', counterpartyBank: 'Zenith Bank', category: 'Transfers' });
    const gro = 80 + randomInt(0, 90);
    await post('INTERBANK', 'Whole Foods Market', [{ accountId: aUsd.id, amount: -gro }, { accountId: s('INTERBANK_SETTLEMENT', 'USD'), amount: gro }], { date: daysAgo(base - 14, 17), counterpartyName: 'Whole Foods Market', category: 'Groceries' });
  }

  // FX: USD -> EUR and USD -> GBP
  const fx = async (from: string, to: string, fromAcct: string, toAcct: string, amount: number, rate: number, d: number) => {
    const converted = new Decimal(amount).mul(rate).toDecimalPlaces(2);
    await post(
      'FX',
      `Exchanged ${from} to ${to}`,
      [
        { accountId: fromAcct, amount: -amount },
        { accountId: s('FX_POOL', from), amount },
        { accountId: s('FX_POOL', to), amount: converted.negated() },
        { accountId: toAcct, amount: converted },
      ],
      { date: daysAgo(d), counterpartyName: 'One Bank FX', category: 'Exchange', metadata: { fx: { rate: String(rate), from, to, converted: converted.toFixed(2) } } },
    );
  };
  await fx('USD', 'EUR', aUsd.id, aEur.id, 2000, 0.9131, 120);
  await fx('USD', 'GBP', aUsd.id, aGbp.id, 1500, 0.7841, 60);

  // A wire
  await post('WIRE', 'Wire to Atelier Lumière SARL', [{ accountId: aEur.id, amount: -815 }, { accountId: s('INTERBANK_SETTLEMENT', 'EUR'), amount: 800 }, { accountId: s('FEES', 'EUR'), amount: 15 }], { date: daysAgo(45), counterpartyName: 'Atelier Lumière SARL', counterpartyAccount: 'FR7630006000011234567890189', counterpartyBank: 'BNP Paribas', category: 'Shopping' });

  // Savings goal for Alex
  const savingsAcct = await prisma.ledgerAccount.create({ data: { type: 'SAVINGS', currency: 'USD', ownerId: alex.id, name: 'Savings · Japan trip' } });
  await prisma.savingsGoal.create({ data: { userId: alex.id, accountId: savingsAcct.id, name: 'Japan trip', targetAmount: 6000, targetDate: daysAgo(-150), autoSaveAmount: 250, autoSaveFrequency: 'MONTHLY', autoSaveSourceId: aUsd.id, nextAutoSaveAt: daysAgo(-12) } });
  for (let m = 4; m >= 0; m--) await post('SAVINGS_TRANSFER', 'Auto-save to “Japan trip”', [{ accountId: aUsd.id, amount: -500 }, { accountId: savingsAcct.id, amount: 500 }], { date: daysAgo(m * 30 + 2, 7), counterpartyName: 'Japan trip', category: 'Savings', initiatorType: 'SYSTEM' });
  await post('INTEREST', 'Monthly savings interest @ 4.5% p.a.', [{ accountId: s('INTEREST_EXPENSE', 'USD'), amount: -7.5 }, { accountId: savingsAcct.id, amount: 7.5 }], { date: daysAgo(31), counterpartyName: 'One Bank', category: 'Income', initiatorType: 'SYSTEM' });

  // Virtual card for Alex with spends
  const pan = generatePan('4' + Array.from({ length: 5 }, () => randomInt(0, 10)).join(''));
  const cardAcct = await prisma.ledgerAccount.create({ data: { type: 'CARD', currency: 'USD', ownerId: alex.id, name: `VISA card •••• ${pan.slice(-4)}` } });
  const card = await prisma.virtualCard.create({
    data: { userId: alex.id, accountId: cardAcct.id, brand: 'VISA', label: 'Online shopping', nameOnCard: 'ALEX MORGAN', last4: pan.slice(-4), panEnc: encrypt(pan), cvvEnc: encrypt(String(randomInt(100, 999))), expMonth: 11, expYear: new Date().getFullYear() + 3, currency: 'USD', color: 'navy', spendLimit: 1000 },
  });
  await post('CARD_FUNDING', `Card top-up •••• ${card.last4}`, [{ accountId: aUsd.id, amount: -805 }, { accountId: s('FEES', 'USD'), amount: 5 }, { accountId: cardAcct.id, amount: 800 }], { date: daysAgo(90), counterpartyName: `VISA •••• ${card.last4}`, category: 'Transfers' });
  const spends: [string, string, number, number][] = [
    ['Amazon.com', 'Shopping', 129.99, 80],
    ['Spotify', 'Entertainment', 10.99, 70],
    ['Uber', 'Transport', 23.4, 55],
    ['Apple.com/bill', 'Entertainment', 2.99, 40],
    ['Airbnb', 'Travel', 312.0, 25],
    ['Uber Eats', 'Food & Drink', 41.75, 8],
  ];
  for (const [merchant, category, amount, d] of spends) {
    const e = await post('CARD_SPEND', merchant, [{ accountId: cardAcct.id, amount: -amount }, { accountId: s('CARD_SETTLEMENT', 'USD'), amount }], { date: daysAgo(d, 19), counterpartyName: merchant, category, metadata: { cardId: card.id, last4: card.last4 } });
    await prisma.cardTransaction.create({ data: { cardId: card.id, entryId: e.id, merchant, category, amount, currency: 'USD', createdAt: daysAgo(d, 19) } });
  }

  await prisma.beneficiary.createMany({
    data: [
      { userId: alex.id, type: 'INTERNAL', name: 'Ada Okafor', accountNumber: dUsd.accountNumber!, bankName: 'One Bank', nickname: 'Ada', lastUsedAt: daysAgo(10) },
      { userId: alex.id, type: 'INTERBANK', name: 'Park Property Mgmt', accountNumber: '7731004412', bankCode: 'CHASUS', bankName: 'JPMorgan Chase', nickname: 'Landlord', lastUsedAt: daysAgo(2) },
      { userId: ada.id, type: 'INTERBANK', name: 'Chinedu Okafor', accountNumber: '0123456789', bankCode: '057', bankName: 'Zenith Bank', nickname: 'Brother', lastUsedAt: daysAgo(12) },
    ],
  });

  // Loan for Alex (disbursed, 2 instalments paid)
  const product = await prisma.loanProduct.findFirstOrThrow({ where: { name: 'Personal Loan' } });
  const loan = await prisma.loan.create({
    data: { userId: alex.id, productId: product.id, disburseAccountId: aUsd.id, principal: 3000, interestRate: product.interestRate, tenorMonths: 12, totalRepayable: 3196.32, amountRepaid: 532.72, currency: 'USD', purpose: 'Home office upgrade', status: 'DISBURSED', disbursedAt: daysAgo(70) },
  });
  await post('LOAN_DISBURSE', 'Personal Loan disbursement', [{ accountId: s('LOAN_PORTFOLIO', 'USD'), amount: -3000 }, { accountId: aUsd.id, amount: 3000 }], { date: daysAgo(70), counterpartyName: 'One Bank Loans', category: 'Income', initiatorType: 'ADMIN', metadata: { loanId: loan.id } });
  for (let i = 0; i < 12; i++) {
    const due = daysAgo(70 - (i + 1) * 30);
    const paid = i < 2;
    await prisma.loanRepayment.create({ data: { loanId: loan.id, dueDate: due, amountDue: 266.36, amountPaid: paid ? 266.36 : 0, status: paid ? 'PAID' : 'DUE', paidAt: paid ? due : null } });
    if (paid) await post('LOAN_REPAY', 'Personal Loan repayment', [{ accountId: aUsd.id, amount: -266.36 }, { accountId: s('LOAN_PORTFOLIO', 'USD'), amount: 266.36 }], { date: due, counterpartyName: 'One Bank Loans', category: 'Loans', initiatorType: 'SYSTEM', metadata: { loanId: loan.id } });
  }

  // Support history
  await prisma.supportTicket.create({
    data: {
      userId: ada.id,
      subject: 'How do I upgrade to level 2?',
      category: 'KYC',
      priority: 'LOW',
      status: 'OPEN',
      messages: { create: [{ authorType: 'USER', authorId: ada.id, authorName: 'Ada Okafor', body: 'Hi, I would like to send money abroad. How do I get verified for wire transfers?' }] },
    },
  });
  await prisma.supportTicket.create({
    data: {
      userId: alex.id,
      subject: 'Card declined at checkout',
      category: 'CARD',
      priority: 'MEDIUM',
      status: 'RESOLVED',
      firstResponseAt: daysAgo(19),
      resolvedAt: daysAgo(18),
      createdAt: daysAgo(20),
      messages: {
        create: [
          { authorType: 'USER', authorId: alex.id, authorName: 'Alex Morgan', body: 'My virtual card was declined on an order yesterday.', createdAt: daysAgo(20) },
          { authorType: 'ADMIN', authorName: 'Priya (One Bank)', body: 'Hi Alex — the order exceeded the spend limit on that card. You can raise the limit from the Cards page.', createdAt: daysAgo(19) },
        ],
      },
    },
  });

  // Notifications & login history
  await prisma.notification.createMany({
    data: [
      { userId: alex.id, category: 'TRANSACTIONS', type: 'CREDIT', title: 'You received $6,850.00', body: 'Salary — Northwind Analytics Inc.', link: '/app/transactions', createdAt: daysAgo(3, 9) },
      { userId: alex.id, category: 'ACCOUNT', type: 'INTEREST', title: 'Interest paid', body: '$7.50 added to Savings · Japan trip', createdAt: daysAgo(31) },
      { userId: ada.id, category: 'ACCOUNT', type: 'WELCOME', title: 'Welcome to One Bank 🎉', body: 'Your NGN account is ready.', readAt: daysAgo(149), createdAt: daysAgo(150) },
    ],
  });
  for (const [u, browser, os, ip, loc, d] of [
    [alex.id, 'Chrome 141', 'Windows 11', '127.0.0.1', 'Local network', 1],
    [alex.id, 'Mobile Safari 19', 'iOS 19', '127.0.0.1', 'Local network', 4],
    [ada.id, 'Chrome 141', 'Android 16', '127.0.0.1', 'Local network', 2],
  ] as const) {
    await prisma.loginEvent.create({ data: { userId: u, email: u === alex.id ? alex.email : ada.email, success: true, browser, os, ip, location: loc, createdAt: daysAgo(d) } });
  }

  // A KYC submission pending review for Ada (placeholder doc)
  await prisma.kycSubmission.create({ data: { userId: ada.id, level: 2, idType: 'NATIONAL_ID', idNumber: 'NIN-' + createHash('md5').update(ada.id).digest('hex').slice(0, 10).toUpperCase(), documentPath: 'sample-id.png', selfiePath: 'sample-selfie.png' } });

  console.log(`Seeded customers: alex@onebank.test (USD ${aUsd.accountNumber}), ada@onebank.test (NGN ${dNgn.accountNumber})`);
}

async function seedSampleUploads() {
  // 1x1 PNG placeholders so the KYC review screen has something to show (R2 or local disk).
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  for (const f of ['sample-id.png', 'sample-selfie.png']) await putUpload('kyc', f, png, 'image/png');
}

/**
 * Production bootstrap: reference data only, plus one superadmin from env.
 * Never creates the demo customers/admins (their passwords are public in the README).
 */
async function seedProductionAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    console.log('SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set: skipping superadmin bootstrap.');
    return;
  }
  if (password.length < 12) throw new Error('SEED_ADMIN_PASSWORD must be at least 12 characters');
  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) return;
  await prisma.adminUser.create({
    data: { email, firstName: process.env.SEED_ADMIN_FIRST_NAME ?? 'Super', lastName: process.env.SEED_ADMIN_LAST_NAME ?? 'Admin', role: 'SUPERADMIN', status: 'ACTIVE', passwordHash: await argon2.hash(password) },
  });
  console.log(`Created superadmin ${email} (set up 2FA on first sign-in, then remove SEED_ADMIN_PASSWORD).`);
}

async function main() {
  await seedReference();
  if (process.env.SEED_MODE === 'production') {
    await seedProductionAdmin();
    console.log('\nOne Bank production seed complete (reference data).');
    return;
  }
  if (await prisma.user.count()) {
    console.log('Database already has users: skipping demo data.');
    return;
  }
  await seedAdmins();
  await seedCustomers();
  await seedSampleUploads();
  console.log('\nOne Bank seed complete.');
  console.log(`  Admin:     ${DEMO.adminEmail} / ${DEMO.adminPassword} (2FA set up on first login)`);
  console.log(`  Customers: alex@onebank.test, ada@onebank.test / ${DEMO.customerPassword}  · PIN ${DEMO.pin}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
