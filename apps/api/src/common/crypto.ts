import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from 'crypto';
import { config } from '../config';

export const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const randomDigits = (n: number) => Array.from({ length: n }, () => randomInt(0, 10)).join('');

const ALNUM = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const randomCode = (n: number) => Array.from({ length: n }, () => ALNUM[randomInt(0, ALNUM.length)]).join('');

export function generateReference(prefix = 'OB'): string {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `${prefix}${ymd}${randomCode(8)}`;
}

const key = () => Buffer.from(config.encryptionKey, 'hex');

/** AES-256-GCM. Output: iv.tag.ciphertext (base64url). */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString('base64url')).join('.');
}

export function decrypt(payload: string): string {
  const [iv, tag, enc] = payload.split('.').map((s) => Buffer.from(s, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

/** Luhn-valid card number with the given IIN prefix. */
export function generatePan(prefix: string, length = 16): string {
  let pan = prefix;
  while (pan.length < length - 1) pan += String(randomInt(0, 10));
  let sum = 0;
  for (let i = 0; i < pan.length; i++) {
    let digit = Number(pan[pan.length - 1 - i]);
    if (i % 2 === 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return pan + String((10 - (sum % 10)) % 10);
}

export function generateAccountNumber(): string {
  return '20' + Array.from({ length: 8 }, () => randomInt(0, 10)).join('');
}
