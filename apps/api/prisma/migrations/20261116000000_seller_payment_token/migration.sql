-- توکن کیف پول/درگاه خود فروشنده (رمزنگاری‌شده)؛ وجه مستقیم به حساب خود فروشنده می‌رود.
ALTER TABLE "channel_connections" ADD COLUMN "provider_token_enc" TEXT;
