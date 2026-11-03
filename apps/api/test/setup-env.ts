import { config } from 'dotenv';

config();
process.env.NODE_ENV = 'test';
process.env.DISABLE_WORKERS = 'true';
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST ?? 'postgresql://onebank:onebank@localhost:5440/onebank_test';
