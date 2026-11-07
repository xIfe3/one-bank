import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalErrorFilter } from './common/error.filter';
import { config } from './config';

export async function createApp() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: config.env === 'test' ? ['error'] : ['log', 'warn', 'error'] });
  app.set('trust proxy', config.trustProxyHops);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cookieParser());
  app.enableCors({
    origin: [config.webUrl, config.adminUrl],
    credentials: true,
    allowedHeaders: ['Content-Type', 'x-csrf-token', 'x-request-id'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new GlobalErrorFilter());
  app.enableShutdownHooks();
  return app;
}

async function bootstrap() {
  const app = await createApp();
  await app.listen(config.port);
  new Logger('Bootstrap').log(`One Bank API listening on http://localhost:${config.port}/api/v1`);
}

if (require.main === module) void bootstrap();
