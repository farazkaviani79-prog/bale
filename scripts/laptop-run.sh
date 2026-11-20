#!/usr/bin/env bash
# اجرای BotShop روی لپ‌تاپ (Ubuntu داخل WSL2 در ویندوز، یا Ubuntu/Debian) با آدرس عمومی رایگان Cloudflare.
#   bash scripts/laptop-run.sh setup   # یک‌بار: نصب Node/Postgres/Redis/cloudflared، ساخت دیتابیس و Migration
#   bash scripts/laptop-run.sh run     # هر بار: تونل‌ها، ساخت پنل، اجرای API و پنل، ثبت دوبارهٔ وب‌هوک
#   bash scripts/laptop-run.sh stop
# ⚠️ آدرس تونل‌های رایگان (trycloudflare.com) هر بار که run می‌زنید عوض می‌شود؛ برنامه خودش وب‌هوک ربات را دوباره ثبت می‌کند.
# ⚠️ تا وقتی لپ‌تاپ روشن و این برنامه در حال اجراست، ربات و مینی‌اپ کار می‌کنند.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"; ENVF="$ROOT/.env.laptop"; RUN="$ROOT/.laptop-run"; mkdir -p "$RUN"
SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO="sudo"
PGO=botshop
as_pg() { if [ "$(id -u)" -eq 0 ]; then runuser -u postgres -- "$@"; else sudo -u postgres "$@"; fi; }

setup() {
  echo "▶ نصب بسته‌ها (ممکن است رمز ویندوز/لینوکس را بخواهد)"
  $SUDO apt-get update -qq
  $SUDO apt-get install -y -qq curl ca-certificates gnupg openssl postgresql redis-server
  if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 22 ]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | $SUDO -E bash -
    $SUDO apt-get install -y -qq nodejs
  fi
  if ! command -v cloudflared >/dev/null; then
    ARCH="$(dpkg --print-architecture)"
    curl -fsSL -o "$RUN/cf.deb" "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb"
    $SUDO dpkg -i "$RUN/cf.deb"
  fi
  $SUDO service postgresql start || true; $SUDO service redis-server start || true
  sleep 3
  if [ ! -f "$ENVF" ]; then
    O="$(openssl rand -hex 12)"; A="$(openssl rand -hex 12)"; S="$(openssl rand -hex 12)"
    cat > "$ENVF" <<EOF
export DATABASE_URL='postgresql://botshop_app:${A}@localhost:5432/botshop?schema=public'
export SYSTEM_DATABASE_URL='postgresql://botshop_system:${S}@localhost:5432/botshop?schema=public'
export MIGRATE_DATABASE_URL='postgresql://${PGO}:${O}@localhost:5432/botshop?schema=public'
export REDIS_URL='redis://localhost:6379'
export API_PORT=4000
export JWT_SECRET='$(openssl rand -base64 48 | tr -d '\n')'
export APP_ENCRYPTION_KEY='$(openssl rand -base64 32 | tr -d '\n')'
export BALE_MODE=http
export BALE_API_BASE_URL='https://tapi.bale.ai'
export INITDATA_VERIFIED=true
export BALE_PROVIDER_TOKEN='WALLET-TEST-1111111111111111'
export UPLOAD_DIR='$ROOT/uploads'
export NODE_ENV=production
export REWIRE_WEBHOOKS_ON_BOOT=true
export API_INTERNAL_URL='http://localhost:4000'
export SEED_ADMIN_EMAIL='admin@botshop.local'
export SEED_ADMIN_PASSWORD='$(openssl rand -hex 8)'
export PG_OWNER_PW='${O}' PG_APP_PW='${A}' PG_SYS_PW='${S}'
EOF
    chmod 600 "$ENVF"
  fi
  set -a; . "$ENVF"; set +a
  export NODE_ENV=development   # فقط برای نصب/ساخت: با production وابستگی‌های توسعه (tsx, nest) نصب نمی‌شوند
  mkdir -p "$UPLOAD_DIR"
  if ! as_pg psql -qAt -c "select 1 from pg_roles where rolname='${PGO}'" | grep -q 1; then
    as_pg psql -q -c "CREATE ROLE ${PGO} LOGIN SUPERUSER PASSWORD '${PG_OWNER_PW}'" -c "CREATE DATABASE botshop OWNER ${PGO}"
    PGPASSWORD="$PG_OWNER_PW" psql -q -h localhost -U "$PGO" -d botshop -f infra/postgres-init.sql
    PGPASSWORD="$PG_OWNER_PW" psql -q -h localhost -U "$PGO" -d botshop -c "ALTER ROLE botshop_app PASSWORD '${PG_APP_PW}'; ALTER ROLE botshop_system PASSWORD '${PG_SYS_PW}'"
  fi
  npm install --ignore-scripts
  npm run db:generate
  DATABASE_URL="$MIGRATE_DATABASE_URL" npm run db:migrate
  npm run db:seed
  npm --workspace @botshop/api run build
  echo "✓ آماده. اکنون:  bash scripts/laptop-run.sh run"
  echo "  ورود مدیر پلتفرم: $SEED_ADMIN_EMAIL  /  رمز در فایل .env.laptop (SEED_ADMIN_PASSWORD)"
}

wait_url() { # $1=logfile
  for _ in $(seq 1 60); do
    u="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$1" 2>/dev/null | head -1 || true)"
    [ -n "$u" ] && { echo "$u"; return 0; }; sleep 1
  done; return 1
}

stop() {
  for f in "$RUN"/*.pid; do [ -f "$f" ] && kill "$(cat "$f")" 2>/dev/null || true; rm -f "$f"; done
  echo "✓ متوقف شد"
}

run() {
  [ -f "$ENVF" ] || { echo "ابتدا: bash scripts/laptop-run.sh setup"; exit 1; }
  stop >/dev/null 2>&1 || true
  $SUDO service postgresql start || true; $SUDO service redis-server start || true
  set -a; . "$ENVF"; set +a
  : > "$RUN/cf-api.log"; : > "$RUN/cf-web.log"
  cloudflared tunnel --no-autoupdate --url http://localhost:4000 > "$RUN/cf-api.log" 2>&1 & echo $! > "$RUN/cf-api.pid"
  cloudflared tunnel --no-autoupdate --url http://localhost:3000 > "$RUN/cf-web.log" 2>&1 & echo $! > "$RUN/cf-web.pid"
  API_URL="$(wait_url "$RUN/cf-api.log")" || { echo "✗ تونل API ساخته نشد: $RUN/cf-api.log"; exit 1; }
  WEB_URL="$(wait_url "$RUN/cf-web.log")" || { echo "✗ تونل پنل ساخته نشد: $RUN/cf-web.log"; exit 1; }
  export PUBLIC_API_URL="$API_URL" NEXT_PUBLIC_API_URL="$API_URL" CORS_ORIGINS="$WEB_URL" MINIAPP_BASE_URL="$WEB_URL/miniapp"
  echo "▶ ساخت پنل وب (حدود ۱–۲ دقیقه؛ آدرس API داخل آن ثبت می‌شود)"
  rm -rf apps/web/.next
  npm --workspace @botshop/web run build > "$RUN/web-build.log" 2>&1 || { echo "✗ ساخت پنل ناموفق: $RUN/web-build.log"; exit 1; }
  nohup node apps/api/dist/main.js > "$RUN/api.log" 2>&1 & echo $! > "$RUN/api.pid"
  (cd apps/web && nohup npx next start -p 3000 > "$RUN/web.log" 2>&1 & echo $! > "$RUN/web.pid")
  for _ in $(seq 1 40); do curl -sf localhost:4000/health >/dev/null && break; sleep 1; done
  curl -sf localhost:4000/health >/dev/null || { echo "✗ API بالا نیامد: $RUN/api.log"; exit 1; }
  echo
  echo "✓ در حال اجرا"
  echo "  پنل فروشنده:  $WEB_URL/login"
  echo "  API:          $API_URL/health"
  echo "  (برای توقف: bash scripts/laptop-run.sh stop — این آدرس‌ها دفعهٔ بعد عوض می‌شوند)"
}

case "${1:-}" in setup) setup;; run) run;; stop) stop;; *) echo "استفاده: bash scripts/laptop-run.sh setup|run|stop"; exit 1;; esac
