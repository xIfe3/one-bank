/* eslint-disable no-console */
// Clears 2FA for an admin (default: the seeded superadmin) so it can be set up again on next login.
// Usage: pnpm seed:reset-admin-2fa [email]
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const email = process.argv[2] ?? 'admin@onebank.test';

prisma.adminUser
  .update({ where: { email }, data: { twoFactorEnabled: false, twoFactorSecret: null } })
  .then(async (a) => {
    await prisma.session.updateMany({ where: { adminId: a.id, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: '2FA reset' } });
    console.log(`2FA reset for ${email}. You will be asked to scan a new QR code on next sign-in.`);
  })
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
