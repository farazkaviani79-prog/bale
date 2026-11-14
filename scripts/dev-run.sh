#!/usr/bin/env bash
# اجرای API (:4000) و پنل (:3000). BALE_MODE=mock — هیچ ارتباطی با بله واقعی ندارد.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
# در Codespaces آدرس عمومی پورت‌ها را بگذارید تا مرورگر به API برسد
if [ -n "${CODESPACE_NAME:-}" ]; then
  D="${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
  export NEXT_PUBLIC_API_URL="https://${CODESPACE_NAME}-4000.${D}"
  export CORS_ORIGINS="https://${CODESPACE_NAME}-3000.${D}"
  export API_INTERNAL_URL="http://localhost:4000"
fi
exec npm run dev
