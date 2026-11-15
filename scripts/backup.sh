#!/usr/bin/env bash
# پشتیبان‌گیری از دیتابیس (pg_dump فرمت custom، فشرده) + پاک‌سازی نسخه‌های قدیمی.
# اجرا:  bash scripts/backup.sh            (متغیرها از .env یا محیط)
# زمان‌بندی (cron روی سرور):  0 3 * * *  cd /opt/botshop && bash scripts/backup.sh >> backup.log 2>&1
# ⚠ فایل پشتیبان شامل داده مشتریان و توکن‌های رمزشده است؛ خارج از سرور و در محل امن (رمزنگاری‌شده) نگه دارید.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] && { set -a; . ./.env; set +a; }
: "${MIGRATE_DATABASE_URL:?MIGRATE_DATABASE_URL تنظیم نشده}"
DIR="${BACKUP_DIR:-./backups}"; KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
mkdir -p "$DIR"; chmod 700 "$DIR"
F="$DIR/botshop-$(date -u +%Y%m%dT%H%M%SZ).dump"
# پارامتر schema مخصوص Prisma را برای pg_dump حذف می‌کنیم
pg_dump "${MIGRATE_DATABASE_URL%%\?*}" --format=custom --compress=6 --no-owner --file "$F"
# اعتبارسنجی: فایل باید قابل خواندن باشد
pg_restore --list "$F" > /dev/null
if [ -n "${BACKUP_GPG_RECIPIENT:-}" ]; then gpg --yes --encrypt --recipient "$BACKUP_GPG_RECIPIENT" "$F" && rm -f "$F" && F="$F.gpg"; fi
find "$DIR" -name 'botshop-*.dump*' -mtime +"$KEEP_DAYS" -delete
echo "✓ پشتیبان ساخته شد: $F ($(du -h "$F" | cut -f1))"
