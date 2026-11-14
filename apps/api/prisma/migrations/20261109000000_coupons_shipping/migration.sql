-- کوپن تخفیف و هزینه ارسال فروشگاه.
CREATE TYPE "coupon_kind" AS ENUM ('PERCENT', 'FIXED');

CREATE TABLE "coupons" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "kind" "coupon_kind" NOT NULL,
  "value" BIGINT NOT NULL,
  "min_order_amount" BIGINT NOT NULL DEFAULT 0,
  "max_uses" INTEGER,
  "used_count" INTEGER NOT NULL DEFAULT 0,
  "starts_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "coupons_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "coupons_value_chk" CHECK ("value" > 0 AND ("kind" <> 'PERCENT' OR "value" <= 100)),
  CONSTRAINT "coupons_min_chk" CHECK ("min_order_amount" >= 0),
  CONSTRAINT "coupons_uses_chk" CHECK ("used_count" >= 0 AND ("max_uses" IS NULL OR ("max_uses" > 0 AND "used_count" <= "max_uses")))
);
CREATE UNIQUE INDEX "coupons_tenant_id_id_key" ON "coupons"("tenant_id", "id");
CREATE UNIQUE INDEX "coupons_tenant_id_code_key" ON "coupons"("tenant_id", "code");
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coupons" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "coupons" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "coupons" USING ("tenant_id" = app_current_tenant()) WITH CHECK ("tenant_id" = app_current_tenant());

ALTER TABLE "stores" ADD COLUMN "shipping_flat_amount" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "stores" ADD COLUMN "free_shipping_over" BIGINT;
ALTER TABLE "stores" ADD CONSTRAINT "stores_shipping_chk" CHECK ("shipping_flat_amount" >= 0 AND ("free_shipping_over" IS NULL OR "free_shipping_over" >= 0));

-- پلن هدف صورتحساب اشتراک (برای ارتقا/تمدید)
ALTER TABLE "subscription_invoices" ADD COLUMN "plan_id" TEXT;
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'botshop_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "coupons" TO botshop_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'botshop_system') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "coupons" TO botshop_system;
  END IF;
END $$;
