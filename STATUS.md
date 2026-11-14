# وضعیت واقعی پروژه (۲۰ آبان ۱۴۰۵)

## اجرا و تأییدشده ✅ (روی Postgres 18 + Redis در Vercel Sandbox، و Postgres 16 محلی)
| مورد | نتیجه |
|---|---|
| `npm install` (۴۲۵ پکیج) | موفق |
| `prisma validate` + `prisma generate` | موفق (پس از رفع ۲ تداخل نام در Schema) |
| `tsc --noEmit` برای API | بدون خطا (پس از رفع ۳ خطا) |
| `nest build` | موفق |
| `next build` برای پنل وب (تایپ‌چک + ۹ صفحه) | موفق |
| Migrationها (۳۱ جدول، ۲۸ Policy RLS) | اجرا شد (PG 16 و PG 18) |
| `npm run test` — ۱۶ تست واحد | ۱۶ از ۱۶ |
| `npm run test:db` — RLS، FK مرکب، CHECKها، فقط‌افزودنی، ۲۵ رزرو هم‌زمان برای ۵ عدد | ۲۰ از ۲۰ (PG 16 محلی) |
| `npm run test:e2e` — جریان کامل روی API زنده | **۳۶ از ۳۶** |
| وب‌هوک بله (Mock) با BullMQ: Update تکراری فقط یک‌بار پردازش، پیام خوش‌آمد SENT، کلید نادرست 404 | موفق |

تست E2E شامل: ثبت‌نام/ورود/چرخش Refresh، ساخت فروشگاه و کالا، اتصال ربات (توکن هرگز برنمی‌گردد)، initData جعلی رد می‌شود، سبد، Checkout (مبلغ از سرور)، رزرو، رد فروش بیش از موجودی، SuccessfulPayment، Idempotency، قطعی‌سازی موجودی، ممنوعیت تغییر دستی به PAID، جداسازی دو مستاجر، بازپرداخت، گزارش داشبورد.

## باگ‌های واقعی که با اجرا پیدا و رفع شد
1. دو نام تکراری برای رابطه‌های معکوس در Schema Prisma.
2. `Nested create` برای اقلام سفارش با کلید خارجی مرکب خطای ۵۰۰ می‌داد (اکنون createMany).
3. سه خطای تایپ (`main.ts`، `catalog.service.ts`).

## هنوز تست نشده ⚠️
- Docker Compose (Docker در محیط ساخت نبود).
- رفتار پنل وب در مرورگر (فقط Build شده، اجرا و کلیک انجام نشده).
- کار انقضای رزرو (نیازمند دستکاری زمان).
- `prisma migrate diff` بین Schema و Migration دستی.
- اتصال واقعی بله و پرداخت واقعی (نیازمند تأیید مستندات رسمی؛ `docs/decisions/0001-bale-payments.md`).

## مرحله ۴/۵ — اجراشده و تأییدشده ✅ (۲۳ آبان ۱۴۰۵، Postgres 18 + Redis، روی کلون ریپوی کاربر)
| مورد | نتیجه |
|---|---|
| Migration (۳ مورد از جمله کوپن/ارسال) + Seed + `nest build` | موفق |
| ۱۶ تست واحد | ۱۶ از ۱۶ |
| `scripts/db-verify.sh` (RLS، FK مرکب، CHECK، فقط‌افزودنی، ۲۵ رزرو هم‌زمان) | ۲۰ از ۲۰ |
| `test:e2e` | ۳۶ از ۳۶ |
| `test:e2e:extra` | **۵۴ از ۵۴** |

پوشش e2e:extra: تیم و نقش‌ها (STAFF/MANAGER/OWNER، سقف پلن، ابطال فوری دسترسی عضو حذف‌شده)، تغییر رمز و قفل حساب پس از ۵ تلاش، کوپن و ارسال (مصرف هم‌زمان کوپن تک‌مصرف: دقیقاً یکی موفق)، آپلود تصویر (بایت‌های اول، Path Traversal، ایزولاسیون مستاجر)، صورتحساب اشتراک (Idempotent، فقط مدیر کل) و پنل عملیات.

⚠️ هنوز اجرا نشده: GitHub Actions (CI) روی ریپوی کاربر تا کامل‌شدن فایل‌های `apps/web`؛ `next build` پس از مرحله ۴ در ریپوی کاربر؛ Docker Compose؛ مرورگر واقعی.

## اتصال واقعی بله — راستی‌آزمایی با ربات آزمایشی (۲۱ آبان ۱۴۰۵) ✅
- `getMe`، `setWebhook`/`getWebhookInfo` روی `https://tapi.bale.ai/bot<token>/<method>`: جواب واقعی (قالب URL تأیید شد).
- `/start` واقعی → وب‌هوک → پیام خوش‌آمد ارسال شد.
- مینی‌اپ داخل بله باز شد. بله initData را در hash آدرس (`#tgWebAppData=...`) می‌دهد؛ شیء سراسری `BaleWebApp` است.
- امضای initData واقعی (کلید HMAC = «WebAppData» + توکن ربات، الگوی Telegram) با `validateInitData` تأیید شد (یک نمونه).
- از داخل مینی‌اپ واقعی: کاتالوگ، افزودن به سبد (۲۰۰)، ثبت نشانی (۲۰۱)، فهرست سفارش (۲۰۰). Checkout عمداً ۵۰۳ (پرداخت هنوز تأییدنشده).
- ⚠️ هنوز تأییدنشده: مدت اعتبار auth_date، sendInvoice/PreCheckout/SuccessfulPayment، مالکیت وجوه (ADR 0001).
- برای فعال‌سازی در محیط واقعی: `BALE_MODE=http`، `BALE_API_BASE_URL=https://tapi.bale.ai`، `INITDATA_VERIFIED=true`.

## پرداخت بله — راستی‌آزمایی با ربات آزمایشی (۲۲ آبان ۱۴۰۵)
✅ تأییدشده با ربات واقعی:
- `sendInvoice` بدون `provider_token` → `PAYMENT_PROVIDER_INVALID`؛ با توکن آزمایشی `WALLET-TEST-1111111111111111` فاکتور به چت کاربر می‌رسد (واحد: ریال، `currency: IRR`).
- پس از پرداخت آزمایشی، بله این Updateها را می‌فرستد و در کد نرمال‌سازی شد (با تست واحد از روی Update واقعی):
  - `pre_checkout_query { id, from, currency, total_amount, invoice_payload }`
  - `message.successful_payment { currency, total_amount, invoice_payload, telegram_payment_charge_id, provider_payment_charge_id:"" }`
- `answerPreCheckoutQuery` با `ok:true` پذیرفته شد.
- سفارش واقعی از مینی‌اپ (احراز با initData واقعی) → مبلغ سرور ۱۵٬۰۰۰ + ارسال ۵۰٬۰۰۰ = ۶۵٬۰۰۰ → فاکتور در بله ارسال شد.
- باگ رفع‌شده: فاکتور فقط اقلام کالا را می‌فرستاد و با ارسال/تخفیف با مبلغ کل نمی‌خواند؛ اکنون یک قلم برابر مبلغ کل.
⚠️ تأییدنشده:
- پایان‌به‌پایان «پرداخت → وب‌هوک → سفارش PAID» روی پلتفرم کامل (سرور آزمایشی قبل از پرداخت خاموش شد؛ فقط خود Updateها و تست واحد تأیید شده‌اند).
- پرداخت با پول واقعی: توکن واقعی کیف پول و مقصد وجوه. کد عمداً فقط توکن `WALLET-TEST-` را می‌پذیرد (ADR 0001).
- فعال‌سازی: `BALE_PROVIDER_TOKEN=WALLET-TEST-1111111111111111` (فقط آزمایشی).

## هنوز انجام‌نشده یا ناقص
- درگاه پرداخت آنلاین برای حق‌اشتراک پلتفرم (فعلاً تأیید دستی مدیر کل).
- ذخیره‌سازی S3 برای تصاویر (فعلاً دیسک محلی)، هشدار خودکار (Alert) روی خطاها، Sentry.
- تست انقضای رزرو (نیاز به دستکاری زمان) و تست مرورگر (Playwright).
- رابط مدیر کل برای صورتحساب‌ها (فقط API؛ UI ندارد).
- یادداشت: `POST /auth/refresh` نشست را به «اولین» کسب‌وکار کاربر برمی‌گرداند؛ برای کاربران چند‌کسب‌وکاره باید tenant در نشست ذخیره شود.

## صفحات جدید پنل و مینی‌اپ (مرحله ۳)
- `tsc --noEmit` و `next build` روی این صفحات در Sandbox **موفق** بود (مینی‌اپ، موجودی، مشتریان، تنظیمات، جزئیات سفارش؛ با `lib/client.ts` و `components/ui.tsx` واقعی).
- هنوز در مرورگر روی API زنده اجرا نشده‌اند. نام SDK بله و فرمت initData تأییدنشده است.
- راه‌انداز Codespaces (`.devcontainer`, `scripts/dev-setup.sh`, `dev-run.sh`, `demo-seed.mjs`) هنوز اجرا نشده است.

## اجرا
```
cp .env.example .env   # CHANGE_ME ها را بسازید
docker compose -f infra/docker-compose.yml up -d
npm install && npm run db:migrate && npm run db:seed
npm --workspace @botshop/api run build && node apps/api/dist/main.js   # BALE_MODE=mock
npm run test && npm run test:db && npm --workspace @botshop/api run test:e2e
```
