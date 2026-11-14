#!/usr/bin/env bash
# اعتبارسنجی تضمین‌های سطح دیتابیس روی PostgreSQL واقعی (فقط به psql نیاز دارد).
# استفاده (کاربر ادمین باید بتواند دیتابیس و نقش بسازد):
#   PGHOST=localhost PGPORT=5432 PGUSER=botshop PGPASSWORD=... ./scripts/db-verify.sh
# دیتابیس موقت ساخته و در پایان حذف می‌شود. نقش‌های botshop_app و botshop_system در صورت نبودن ساخته می‌شوند.
set -u
DB="botshop_verify_$$"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_PW="${APP_PW:-app_verify_only}"
ADMIN_PW="${PGPASSWORD:-}"
pass=0; fail=0
ok(){ echo "  ✓ $1"; pass=$((pass+1)); }
bad(){ echo "  ✗ $1"; fail=$((fail+1)); }
# q <APP|SYS|ADM> <sql>
q(){ case "$1" in
  APP) PGUSER=botshop_app PGPASSWORD="$APP_PW" psql -d "$DB" -v ON_ERROR_STOP=1 -qAt -c "$2" 2>&1;;
  SYS) PGUSER=botshop_system PGPASSWORD="$APP_PW" psql -d "$DB" -v ON_ERROR_STOP=1 -qAt -c "$2" 2>&1;;
  ADM) PGPASSWORD="$ADMIN_PW" psql -d postgres -v ON_ERROR_STOP=1 -qAt -c "$2" 2>&1;;
esac; }
APP=APP; SYS=SYS; ADMIN=ADM

q ADM "CREATE DATABASE $DB" >/dev/null || exit 2
trap 'q ADM "DROP DATABASE IF EXISTS $DB" >/dev/null' EXIT
PGPASSWORD="$ADMIN_PW" psql -d postgres -qAt >/dev/null <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='botshop_app') THEN CREATE ROLE botshop_app LOGIN PASSWORD '$APP_PW' NOSUPERUSER NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='botshop_system') THEN CREATE ROLE botshop_system LOGIN PASSWORD '$APP_PW' NOSUPERUSER BYPASSRLS; END IF;
END \$\$;
SQL
for m in "$ROOT"/apps/api/prisma/migrations/*/migration.sql; do
  PGPASSWORD="$ADMIN_PW" psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$m" >/dev/null 2>/tmp/mig.err || { echo "Migration failed: $m"; cat /tmp/mig.err; exit 3; }
done

# ---- seed با نقش سیستم (BYPASSRLS)
PGUSER=botshop_system PGPASSWORD="$APP_PW" psql -d "$DB" -v ON_ERROR_STOP=1 -q >/dev/null <<'SQL'
INSERT INTO tenants(id,name,slug) VALUES ('tA','الف','a'),('tB','ب','b');
INSERT INTO stores(id,tenant_id,name,slug) VALUES ('sA','tA','فروشگاه الف','a'),('sB','tB','فروشگاه ب','b');
INSERT INTO products(id,tenant_id,store_id,name,status) VALUES ('pA','tA','sA','کالا الف','ACTIVE'),('pB','tB','sB','کالا ب','ACTIVE');
INSERT INTO product_variants(id,tenant_id,product_id,sku,price_amount) VALUES ('vA','tA','pA','SKU-1',1000000),('vB','tB','pB','SKU-1',2000000);
INSERT INTO inventory_locations(id,tenant_id,store_id,name,is_default) VALUES ('lA','tA','sA','انبار',true),('lB','tB','sB','انبار',true);
INSERT INTO inventory_balances(tenant_id,variant_id,location_id,on_hand) VALUES ('tA','vA','lA',5),('tB','vB','lB',5);
INSERT INTO customers(id,tenant_id,full_name) VALUES ('cA','tA','مشتری الف'),('cB','tB','مشتری ب');
SQL
echo "[1] ایزولاسیون مستاجر (RLS)"
n=$(q "$APP" "BEGIN; SELECT set_config('app.tenant_id','tA',true); SELECT count(*) FROM products; COMMIT;" | tail -1)
[ "$n" = "1" ] && ok "مستاجر الف فقط ۱ محصول خود را می‌بیند" || bad "انتظار 1، دریافت: $n"
n=$(q "$APP" "SELECT count(*) FROM products")
[ "$n" = "0" ] && ok "بدون Context مستاجر هیچ ردیفی دیده نمی‌شود" || bad "بدون tenant انتظار 0، دریافت: $n"
out=$(q "$APP" "BEGIN; SELECT set_config('app.tenant_id','tA',true); INSERT INTO products(tenant_id,store_id,name) VALUES ('tB','sB','نفوذ'); COMMIT;")
echo "$out" | grep -q "row-level security" && ok "درج ردیف برای مستاجر دیگر رد شد" || bad "درج بین‌مستاجری مجاز شد: $out"
q "$APP" "BEGIN; SELECT set_config('app.tenant_id','tA',true); UPDATE products SET name='هک' WHERE id='pB'; COMMIT;" >/dev/null
c=$(q "$SYS" "SELECT name FROM products WHERE id='pB'")
[ "$c" = "کالا ب" ] && ok "ویرایش محصول مستاجر دیگر اثری نداشت" || bad "ویرایش بین‌مستاجری اثر داشت: $c"
n=$(q "$SYS" "SELECT count(*) FROM products"); [ "$n" = "2" ] && ok "نقش سیستم (BYPASSRLS) همه ردیف‌ها را می‌بیند" || bad "نقش سیستم: $n"

echo "[2] کلید خارجی مرکب (جلوگیری از ارجاع بین‌مستاجری)"
out=$(q "$SYS" "INSERT INTO carts(id,tenant_id,store_id,customer_id) VALUES ('x','tA','sB','cA')")
echo "$out" | grep -q "foreign key" && ok "سبد مستاجر الف با فروشگاه مستاجر ب رد شد" || bad "FK بین‌مستاجری: $out"
out=$(q "$SYS" "INSERT INTO carts(id,tenant_id,store_id,customer_id) VALUES ('cart1','tA','sA','cA'); INSERT INTO cart_items(tenant_id,cart_id,variant_id,quantity) VALUES ('tA','cart1','vB',1)")
echo "$out" | grep -q "foreign key" && ok "افزودن کالای مستاجر ب به سبد مستاجر الف رد شد" || bad "FK آیتم: $out"

echo "[3] قیود یکپارچگی مالی و موجودی"
out=$(q "$SYS" "INSERT INTO orders(tenant_id,store_id,customer_id,order_number,subtotal_amount,total_amount,customer_snapshot) VALUES ('tA','sA','cA','1',1000,999,'{}')")
echo "$out" | grep -q "violates check" && ok "مبلغ کل ناهمخوان با اقلام/تخفیف/ارسال رد شد" || bad "total check: $out"
out=$(q "$SYS" "INSERT INTO orders(tenant_id,store_id,customer_id,order_number,subtotal_amount,total_amount,customer_snapshot) VALUES ('tA','sA','cA','1',1000,1000,'{}') RETURNING 1")
echo "$out" | grep -q "^1" && ok "سفارش با مبلغ سازگار پذیرفته شد" || bad "سفارش معتبر رد شد: $out"
out=$(q "$SYS" "UPDATE inventory_balances SET reserved=9 WHERE tenant_id='tA'")
echo "$out" | grep -q "violates check" && ok "رزرو بیش از موجودی رد شد" || bad "reserved check: $out"
out=$(q "$SYS" "INSERT INTO product_variants(tenant_id,product_id,sku,price_amount) VALUES ('tA','pA','NEG',-5)")
echo "$out" | grep -q "violates check" && ok "قیمت منفی رد شد" || bad "price check: $out"
out=$(q "$SYS" "INSERT INTO product_variants(tenant_id,product_id,sku,price_amount) VALUES ('tA','pA','SKU-1',5)")
echo "$out" | grep -q "duplicate key" && ok "SKU تکراری در یک مستاجر رد شد" || bad "sku unique: $out"
out=$(q "$SYS" "INSERT INTO stores(tenant_id,name,slug,currency) VALUES ('tA','x','x2','USD')")
echo "$out" | grep -q "violates check" && ok "واحد پول غیر از ریال رد شد" || bad "currency check: $out"

echo "[4] پرداخت: فقط با تأیید معتبر PAID"
oid=$(q "$SYS" "SELECT id FROM orders WHERE tenant_id='tA' LIMIT 1")
out=$(q "$SYS" "INSERT INTO payments(tenant_id,order_id,provider,status,amount,invoice_payload) VALUES ('tA','$oid','MOCK','PAID',1000,'inv-1')")
echo "$out" | grep -q "violates check" && ok "Payment با وضعیت PAID بدون verified_at رد شد" || bad "paid check: $out"
q "$SYS" "INSERT INTO payments(id,tenant_id,order_id,provider,status,amount,invoice_payload) VALUES ('pay1','tA','$oid','MOCK','PENDING',1000,'inv-1')" >/dev/null
q "$SYS" "INSERT INTO payment_events(tenant_id,payment_id,type,dedupe_key,payload) VALUES ('tA','pay1','successful_payment','ev-1','{}')" >/dev/null
out=$(q "$SYS" "INSERT INTO payment_events(tenant_id,payment_id,type,dedupe_key,payload) VALUES ('tA','pay1','successful_payment','ev-1','{}')")
echo "$out" | grep -q "duplicate key" && ok "رویداد پرداخت تکراری (Idempotency) رد شد" || bad "dedupe: $out"

echo "[5] جداول فقط‌افزودنی (دو لایه: GRANT و Trigger)"
q "$SYS" "INSERT INTO audit_logs(id,tenant_id,action) VALUES ('au1','tA','test')" >/dev/null
out=$(q "$SYS" "UPDATE audit_logs SET action='x' WHERE id='au1'")
echo "$out" | grep -q "permission denied" && ok "لایه ۱: نقش برنامه حق UPDATE روی AuditLog ندارد" || bad "audit grant: $out"
out=$(q "$SYS" "DELETE FROM payment_events WHERE tenant_id='tA'")
echo "$out" | grep -q "permission denied" && ok "لایه ۱: نقش برنامه حق DELETE روی PaymentEvent ندارد" || bad "pe grant: $out"
out=$(PGPASSWORD="$ADMIN_PW" psql -d "$DB" -v ON_ERROR_STOP=1 -qAt -c "UPDATE audit_logs SET action='x' WHERE id='au1'" 2>&1)
echo "$out" | grep -q "فقط‌افزودنی" && ok "لایه ۲: حتی مالک جدول به‌خاطر Trigger نمی‌تواند AuditLog را ویرایش کند" || bad "audit trigger: $out"
out=$(PGPASSWORD="$ADMIN_PW" psql -d "$DB" -v ON_ERROR_STOP=1 -qAt -c "DELETE FROM payment_events WHERE tenant_id='tA'" 2>&1)
echo "$out" | grep -q "فقط‌افزودنی" && ok "لایه ۲: Trigger مانع DELETE روی PaymentEvent شد" || bad "pe trigger: $out"

echo "[6] ضد فروش بیش از موجودی (۲۵ درخواست هم‌زمان برای ۵ عدد)"
# الگوی استفاده‌شده در کد: UPDATE شرطی اتمیک + بررسی تعداد ردیف‌های تغییر کرده
q "$SYS" "UPDATE inventory_balances SET reserved=0, on_hand=5 WHERE tenant_id='tA'" >/dev/null
tmp=$(mktemp -d)
for i in $(seq 1 25); do
  ( r=$(PGUSER=botshop_app PGPASSWORD="$APP_PW" psql -d "$DB" -qAt -c "BEGIN; SELECT set_config('app.tenant_id','tA',true); WITH u AS (UPDATE inventory_balances SET reserved=reserved+1 WHERE variant_id='vA' AND on_hand-reserved>=1 RETURNING 1) SELECT count(*) FROM u; COMMIT;" 2>&1 | sed -n 2p); echo "$r" > "$tmp/$i" ) &
done; wait
won=$(cat "$tmp"/* | grep -c '^1$'); rm -rf "$tmp"
res=$(q "$SYS" "SELECT reserved FROM inventory_balances WHERE tenant_id='tA'")
[ "$won" = "5" ] && [ "$res" = "5" ] && ok "دقیقاً ۵ رزرو موفق و reserved=5 (بدون Oversell)" || bad "won=$won reserved=$res"

echo; echo "نتیجه: $pass موفق، $fail ناموفق"
[ "$fail" = "0" ]
