import { InboundEvent, InvoiceRequest, MessengerAdapter, NotVerifiedError, OutboundText } from './messenger.types';

/**
 * ⚠️ وضعیت: «تأییدنشده با مستندات رسمی».
 * مستندات رسمی https://docs.bale.ai/ هنگام ساخت این کد از محیط توسعه قابل دسترسی نبود.
 * بنابراین فرض‌های زیر باید پیش از فعال‌سازی با مستندات و یک ربات آزمایشی راستی‌آزمایی شوند:
 *   - قالب URL:  {baseUrl}/bot{token}/{method}  (فرض مبتنی بر سازگاری با Bot API؛ تأییدنشده)
 *   - نام متدهای getMe / setWebhook / deleteWebhook / sendMessage / answerCallbackQuery
 *   - قالب JSON در Update ها (message, callback_query, ...) در parseUpdate
 * پرداخت (sendInvoice / PreCheckout / SuccessfulPayment / استعلام) عمداً غیرفعال است تا زمان تأیید رسمی.
 */
export interface BaleHttpOptions { token: string; baseUrl: string; fetchImpl?: typeof fetch; timeoutMs?: number; enablePayments?: boolean; providerToken?: string; }

export class BaleHttpAdapter implements MessengerAdapter {
  readonly channel = 'BALE' as const;
  /**
   * ✅ راستی‌آزمایی‌شده با ربات واقعی (۲۱ آبان ۱۴۰۵): sendInvoice بدون provider_token خطای PAYMENT_PROVIDER_INVALID می‌دهد؛
   * با توکن آزمایشی `WALLET-TEST-...` فاکتور ساخته می‌شود، PreCheckout و SuccessfulPayment می‌رسند، واحد ریال است.
   * ⚠️ فقط حالت آزمایشی فعال می‌شود. توکن واقعی (مقصد وجوه) تا روشن‌شدن ADR 0001 عمداً رد می‌شود
   * تا پول مشتری هرگز ناخواسته به حساب پلتفرم نرود.
   */
  get paymentsVerified() { return typeof this.o.providerToken === 'string' && /^WALLET-TEST-/.test(this.o.providerToken); }
  private readonly f: typeof fetch;
  constructor(private readonly o: BaleHttpOptions) { this.f = o.fetchImpl ?? fetch; }

  private async call<T>(method: string, body?: object): Promise<T> {
    const res = await this.f(`${this.o.baseUrl.replace(/\/$/, '')}/bot${this.o.token}/${method}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(this.o.timeoutMs ?? 10_000),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string; error_code?: number };
    if (!res.ok || json.ok === false) {
      // توکن هرگز در پیام خطا یا لاگ نمی‌آید.
      throw new Error(`Bale API ${method} failed: HTTP ${res.status} ${json.description ?? ''}`.trim());
    }
    return json.result as T;
  }
  async getMe() { const r = await this.call<{ id: number | string; username?: string }>('getMe'); return { id: String(r.id), username: r.username }; }
  async setWebhook(url: string) { await this.call('setWebhook', { url }); }
  async deleteWebhook() { await this.call('deleteWebhook'); }
  async sendText(m: OutboundText) {
    const reply_markup = m.buttons ? { inline_keyboard: m.buttons.map((row) => row.map((b) => ({ text: b.text, callback_data: b.callbackData, url: b.url, web_app: b.webAppUrl ? { url: b.webAppUrl } : undefined }))) } : undefined;
    const r = await this.call<{ message_id: number | string }>('sendMessage', { chat_id: m.chatId, text: m.text, reply_markup });
    return { providerMessageId: String(r.message_id) };
  }
  async answerCallbackQuery(callbackId: string, text?: string) { await this.call('answerCallbackQuery', { callback_query_id: callbackId, text }); }
  async sendInvoice(r: InvoiceRequest): Promise<{ providerMessageId: string }> {
    if (!this.paymentsVerified) throw new NotVerifiedError('sendInvoice');
    const num = (v: bigint) => { if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('مبلغ بیش از حد مجاز'); return Number(v); };
    const prices = r.items.map((i) => ({ label: i.label, amount: num(i.amountRial) }));
    if (prices.reduce((a, b) => a + b.amount, 0) !== num(r.amountRial)) throw new Error('جمع اقلام فاکتور با مبلغ کل برابر نیست');
    const m = await this.call<{ message_id: number | string }>('sendInvoice', { chat_id: r.chatId, title: r.title, description: r.description, payload: r.invoicePayload, provider_token: this.o.providerToken, currency: 'IRR', prices });
    return { providerMessageId: String(m.message_id) };
  }
  async answerPreCheckout(queryId: string, ok: boolean, errorMessage?: string): Promise<void> {
    if (!this.paymentsVerified) throw new NotVerifiedError('answerPreCheckoutQuery');
    await this.call('answerPreCheckoutQuery', { pre_checkout_query_id: queryId, ok, ...(ok ? {} : { error_message: errorMessage ?? 'پرداخت ممکن نیست' }) });
  }
  parseUpdate(raw: any): InboundEvent {
    const id = raw?.update_id !== undefined ? String(raw.update_id) : '';
    if (!id) return { kind: 'unknown', eventId: '' };
    if (raw.message?.successful_payment === undefined && raw.message?.chat && raw.message?.from)
      return { kind: 'message', eventId: id, chatId: String(raw.message.chat.id), userId: String(raw.message.from.id), username: raw.message.from.username, text: raw.message.text, contactPhone: raw.message.contact?.phone_number };
    if (raw.callback_query?.from)
      return { kind: 'callback_query', eventId: id, callbackId: String(raw.callback_query.id), chatId: String(raw.callback_query.message?.chat?.id ?? raw.callback_query.from.id), userId: String(raw.callback_query.from.id), data: String(raw.callback_query.data ?? '') };
    // قالب‌ها با Updateهای واقعی بله راستی‌آزمایی شد (۲۱ آبان ۱۴۰۵).
    const pc = raw.pre_checkout_query;
    if (pc?.from && pc.invoice_payload !== undefined && /^\d+$/.test(String(pc.total_amount)))
      return { kind: 'pre_checkout_query', eventId: id, queryId: String(pc.id), userId: String(pc.from.id), invoicePayload: String(pc.invoice_payload), amountRial: BigInt(pc.total_amount), currency: String(pc.currency) };
    const sp = raw.message?.successful_payment;
    if (sp && raw.message?.from && /^\d+$/.test(String(sp.total_amount)))
      return { kind: 'successful_payment', eventId: id, chatId: String(raw.message.chat.id), userId: String(raw.message.from.id), invoicePayload: String(sp.invoice_payload), amountRial: BigInt(sp.total_amount), currency: String(sp.currency), providerChargeId: String(sp.provider_payment_charge_id || sp.telegram_payment_charge_id || '') };
    return { kind: 'unknown', eventId: id };
  }
}
