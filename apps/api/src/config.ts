import 'dotenv/config';

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing env var ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.API_PORT ?? 4100),
  env: process.env.NODE_ENV ?? 'development',
  databaseUrl: req('DATABASE_URL'),
  redisUrl: req('REDIS_URL', 'redis://localhost:6390'),
  webUrl: req('WEB_URL', 'http://localhost:3100'),
  adminUrl: req('ADMIN_URL', 'http://localhost:3101'),
  jwtAccessSecret: req('JWT_ACCESS_SECRET'),
  jwtAdminSecret: req('JWT_ADMIN_SECRET'),
  encryptionKey: req('ENCRYPTION_KEY'),
  smtp: {
    host: req('SMTP_HOST', 'localhost'),
    port: Number(process.env.SMTP_PORT ?? 1026),
    user: process.env.SMTP_USER || undefined,
    pass: process.env.SMTP_PASS || undefined,
    secure: process.env.SMTP_SECURE === 'true',
  },
  mailFrom: req('MAIL_FROM', 'One Bank <no-reply@onebank.test>'),
  adminIpAllowlist: (process.env.ADMIN_IP_ALLOWLIST ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  cookieDomain: process.env.COOKIE_DOMAIN && process.env.COOKIE_DOMAIN !== 'localhost' ? process.env.COOKIE_DOMAIN : undefined,
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  disableWorkers: process.env.DISABLE_WORKERS === 'true',
  settlementDelayMs: Number(process.env.SETTLEMENT_DELAY_MS ?? 30_000),
  wireDelayMs: Number(process.env.WIRE_DELAY_MS ?? 180_000),
  uploadDir: process.env.UPLOAD_DIR ?? 'uploads',
};

if (config.env === 'production') {
  const weak = (v: string) => v.length < 32 || /change-me/i.test(v) || /^0123456789abcdef/i.test(v);
  const bad = [
    ['JWT_ACCESS_SECRET', config.jwtAccessSecret],
    ['JWT_ADMIN_SECRET', config.jwtAdminSecret],
    ['ENCRYPTION_KEY', config.encryptionKey],
  ].filter(([, v]) => weak(v));
  if (bad.length) throw new Error(`Refusing to start in production with weak/sample secrets: ${bad.map(([k]) => k).join(', ')}`);
  if (!/^[0-9a-f]{64}$/i.test(config.encryptionKey)) throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
}
