import { DeleteObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload as S3Upload } from '@aws-sdk/lib-storage';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { randomBytes } from 'crypto';
import type { Request, Response } from 'express';
import { createReadStream, existsSync, mkdirSync } from 'fs';
import { diskStorage, type StorageEngine } from 'multer';
import { extname, join, resolve } from 'path';
import type { Readable } from 'stream';
import { config } from '../config';
import { AppError } from './app-error';

const ALLOWED: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf' };
const TYPES: Record<string, string> = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.pdf': 'application/pdf' };

type Sub = 'kyc' | 'tickets';

// ---------- Storage backend: Cloudflare R2 (S3 API) when configured, local disk otherwise ----------

let s3: S3Client | undefined;
function r2() {
  if (!config.r2) return undefined;
  s3 ??= new S3Client({
    region: 'auto',
    endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.r2.accessKeyId, secretAccessKey: config.r2.secretAccessKey },
  });
  return s3;
}

const objectKey = (sub: string, file: string) => `${sub}/${file}`;

export function uploadDir(sub: string) {
  const dir = resolve(config.uploadDir, sub);
  mkdirSync(dir, { recursive: true });
  return dir;
}

const generateName = (file: Express.Multer.File) => `${Date.now()}-${randomBytes(8).toString('hex')}${ALLOWED[file.mimetype] ?? '.bin'}`;

/** Streams each upload straight into the private R2 bucket (never touches local disk). */
class R2Storage implements StorageEngine {
  constructor(private readonly sub: Sub) {}

  _handleFile(_req: Request, file: Express.Multer.File, cb: (error?: unknown, info?: Partial<Express.Multer.File>) => void) {
    const filename = generateName(file);
    let size = 0;
    file.stream.on('data', (chunk: Buffer) => (size += chunk.length));
    new S3Upload({
      client: r2()!,
      params: { Bucket: config.r2!.bucket, Key: objectKey(this.sub, filename), Body: file.stream, ContentType: file.mimetype },
    })
      .done()
      .then(() => cb(null, { filename, size }))
      .catch((e) => cb(e));
  }

  _removeFile(_req: Request, file: Express.Multer.File, cb: (error: Error | null) => void) {
    r2()!
      .send(new DeleteObjectCommand({ Bucket: config.r2!.bucket, Key: objectKey(this.sub, file.filename) }))
      .then(() => cb(null))
      .catch((e) => cb(e));
  }
}

/** Random names, 5 MB cap, images + PDF only. */
export function uploadOptions(sub: Sub): MulterOptions {
  return {
    storage: config.r2
      ? new R2Storage(sub)
      : diskStorage({
          destination: (_req, _file, cb) => cb(null, uploadDir(sub)),
          // Extension comes from the allow-listed MIME type, never the client-supplied filename.
          filename: (_req, file, cb) => cb(null, generateName(file)),
        }),
    limits: { fileSize: 5 * 1024 * 1024, files: 3 },
    fileFilter: (_req, file, cb) => {
      if (!ALLOWED[file.mimetype]) return cb(new AppError('VALIDATION', 'Only JPG, PNG, WEBP or PDF files up to 5 MB are allowed.'), false);
      cb(null, true);
    },
  };
}

function checkName(file: string) {
  // Prevent path traversal / key injection: only allow plain generated filenames.
  if (!/^[\w.-]+$/.test(file) || file.startsWith('.')) throw new AppError('VALIDATION', 'Invalid file');
}

export function uploadPath(sub: string, file: string) {
  checkName(file);
  return join(uploadDir(sub), file);
}

async function openUpload(sub: string, file: string): Promise<Readable> {
  checkName(file);
  const client = r2();
  if (client) {
    try {
      const obj = await client.send(new GetObjectCommand({ Bucket: config.r2!.bucket, Key: objectKey(sub, file) }));
      return obj.Body as Readable;
    } catch (e) {
      const name = (e as { name?: string }).name;
      if (name === 'NoSuchKey' || name === 'NotFound') throw new AppError('NOT_FOUND', 'File not found');
      throw e;
    }
  }
  const path = uploadPath(sub, file);
  if (!existsSync(path)) throw new AppError('NOT_FOUND', 'File not found');
  return createReadStream(path);
}

/**
 * Stream an uploaded file with a server-chosen Content-Type and headers that stop browsers
 * from sniffing or executing it (defence against disguised HTML/SVG uploads).
 * Files are always proxied through the API so the caller's auth checks apply; the bucket stays private.
 */
export async function sendUpload(res: Response, sub: string, file: string) {
  const body = await openUpload(sub, file);
  const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
  res.setHeader('Content-Type', type);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.setHeader('Content-Disposition', type === 'application/octet-stream' ? 'attachment' : 'inline');
  res.setHeader('Cache-Control', 'private, no-store');
  body.on('error', () => res.destroy());
  body.pipe(res);
}

/** Store a server-generated file (e.g. seed placeholders) in the active backend. */
export async function putUpload(sub: Sub, file: string, content: Buffer, contentType: string) {
  checkName(file);
  const client = r2();
  if (client) {
    await new S3Upload({ client, params: { Bucket: config.r2!.bucket, Key: objectKey(sub, file), Body: content, ContentType: contentType } }).done();
    return;
  }
  const { writeFileSync } = await import('fs');
  writeFileSync(uploadPath(sub, file), content);
}
