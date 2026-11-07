#!/bin/sh
set -e

echo "Applying database migrations..."
./node_modules/.bin/prisma migrate deploy

if [ "${RUN_SEED:-true}" = "true" ]; then
  # Idempotent: reference data (system ledgers, FX rates, banks, billers) + optional superadmin.
  SEED_MODE="${SEED_MODE:-production}" ./node_modules/.bin/ts-node --transpile-only prisma/seed.ts
fi

exec node dist/main.js
