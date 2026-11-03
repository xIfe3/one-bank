import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { randomBytes } from 'crypto';
import { mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { extname, join, resolve } from 'path';
import { config } from '../config';
import { AppError } from './app-error';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export function uploadDir(sub: string) {
  const dir = resolve(config.uploadDir, sub);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Disk storage with random names, 5 MB cap, images + PDF only. */
export function uploadOptions(sub: 'kyc' | 'tickets'): MulterOptions {
  return {
    storage: diskStorage({
      destination: (_req, _file, cb) => cb(null, uploadDir(sub)),
      filename: (_req, file, cb) => cb(null, `${Date.now()}-${randomBytes(8).toString('hex')}${extname(file.originalname).toLowerCase().slice(0, 6)}`),
    }),
    limits: { fileSize: 5 * 1024 * 1024, files: 3 },
    fileFilter: (_req, file, cb) => {
      if (!ALLOWED.includes(file.mimetype)) return cb(new AppError('VALIDATION', 'Only JPG, PNG, WEBP or PDF files up to 5 MB are allowed.'), false);
      cb(null, true);
    },
  };
}

export function uploadPath(sub: string, file: string) {
  // Prevent path traversal: only allow plain generated filenames.
  if (!/^[\w.-]+$/.test(file)) throw new AppError('VALIDATION', 'Invalid file');
  return join(uploadDir(sub), file);
}
