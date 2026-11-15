#!/usr/bin/env bash
# بازیابی پشتیبان در یک دیتابیس «خالی». هرگز روی دیتابیس زنده اجرا نکنید.
# اجرا:  RESTORE_DATABASE_URL=postgresql://owner:pw@host:5432/newdb bash scripts/restore.sh backups/botshop-XXXX.dump
set -euo pipefail
: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL (دیتابیس مقصد خالی) تنظیم نشده}"
[ $# -eq 1 ] && [ -f "$1" ] || { echo "استفاده: bash scripts/restore.sh <فایل.dump>"; exit 1; }
read -r -p "بازیابی در ${RESTORE_DATABASE_URL%%\?*} ؟ (yes برای ادامه) " a; [ "$a" = yes ] || exit 1
pg_restore --no-owner --exit-on-error --dbname "${RESTORE_DATABASE_URL%%\?*}" "$1"
echo "✓ بازیابی انجام شد. سپس نقش‌ها/دسترسی‌ها را بررسی کنید (infra/postgres-init.sql) و scripts/db-verify.sh را اجرا کنید."
