#!/usr/bin/env bash
# راه‌اندازی یک‌باره محیط توسعه (Codespaces یا هر ماشین دارای Docker + Node 22).
# رمزهای پایگاه‌داده فقط برای همین کانتینر توسعه‌اند و روی 127.0.0.1 بسته‌اند؛ کلیدهای JWT/رمزنگاری تصادفی ساخته می‌شوند.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=\"$(openssl rand -base64 48 | tr -d '\n')\"|" .env
  sed -i "s|^APP_ENCRYPTION_KEY=.*|APP_ENCRYPTION_KEY=\"$(openssl rand -base64 32 | tr -d '\n')\"|" .env
  sed -i "s|^SEED_ADMIN_EMAIL=.*|SEED_ADMIN_EMAIL=admin@botshop.local|" .env
  sed -i "s|^SEED_ADMIN_PASSWORD=.*|SEED_ADMIN_PASSWORD=\"$(openssl rand -hex 8)\"|" .env
  sed -i "s|^NEXT_PUBLIC_MINIAPP_DEV=.*|NEXT_PUBLIC_MINIAPP_DEV=true|" .env
  echo "✓ .env ساخته شد (در گیت نمی‌رود)"
fi
set -a; . ./.env; set +a
docker compose -f infra/docker-compose.yml up -d --wait
npm install
npm run db:generate
DATABASE_URL="$MIGRATE_DATABASE_URL" npm run db:migrate
npm run db:seed
echo "✓ آماده. اجرا:  bash scripts/dev-run.sh"
