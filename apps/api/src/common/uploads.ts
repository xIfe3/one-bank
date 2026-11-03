import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { randomBytes } from 'crypto';
import type { Response } from 'express';
import { createReadStream, existsSync, mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { extname, join, resolve } from 'path';
import { config } from '../config';
import { AppError } from './app-error';

const ALLOWED: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf' };
const TYPES: Record<string, string> = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.pdf': 'application/pdf' };

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
      // Extension comes from the allow-listed MIME type, never the client-supplied filename.
      filename: (_req, file, cb) => cb(null, `${Date.now()}-${randomBytes(8).toString('hex')}${ALLOWED[file.mimetype] ?? '.bin'}`),
    }),
    limits: { fileSize: 5 * 1024 * 1024, files: 3 },
    fileFilter: (_req, file, cb) => {
      if (!ALLOWED[file.mimetype]) return cb(new AppError('VALIDATION', 'Only JPG, PNG, WEBP or PDF files up to 5 MB are allowed.'), false);
      cb(null, true);
    },
  };
}

export function uploadPath(sub: string, file: string) {
  // Prevent path traversal: only allow plain generated filenames.
  if (!/^[\w.-]+$/.test(file)) throw new AppError('VALIDATION', 'Invalid file');
  return join(uploadDir(sub), file);
}

/**
 * Stream an uploaded file with a server-chosen Content-Type and headers that stop browsers
 * from sniffing or executing it (defence against disguised HTML/SVG uploads).
 */
export function sendUpload(res: Response, sub: string, file: string) {
  const path = uploadPath(sub, file);
  if (!existsSync(path)) throw new AppError('NOT_FOUND', 'File not found');
  const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
  res.setHeader('Content-Type', type);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.setHeader('Content-Disposition', type === 'application/octet-stream' ? 'attachment' : 'inline');
  res.setHeader('Cache-Control', 'private, no-store');
  createReadStream(path).pipe(res);
}
