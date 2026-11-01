import crypto from 'crypto';
import type { Context } from 'koa';
import type { Core } from '@strapi/strapi';

const UNPARSED_BODY = Symbol.for('unparsedBody');

/**
 * Receives inbound WhatsApp messages from Meta's Cloud API webhook and logs
 * them as a Note (channel: WhatsApp) against the matching student, matched
 * by phone number. This is the Phase 5 MVP from the CRM roadmap:
 * inbound-only logging — advisors still reply from their own phone, this
 * just means every message shows up in the student's communication log
 * automatically instead of living only on someone's personal WhatsApp.
 *
 * Requires two env vars once a real Meta WhatsApp Business account exists:
 *   WHATSAPP_VERIFY_TOKEN — a string you invent, entered in Meta's webhook
 *     setup screen; proves to Meta this endpoint is yours during setup.
 *   WHATSAPP_APP_SECRET — from the Meta App dashboard; used to verify each
 *     incoming request is genuinely from Meta (HMAC signature check) and
 *     not a forged POST from anyone who finds this public URL.
 * Until both are set, /receive logs a warning and skips signature
 * verification (fine for local testing with simulated payloads, NOT safe
 * to leave that way once this is deployed somewhere public).
 */
export default ({ strapi }: { strapi: Core.Strapi }) => ({
  /**
   * Meta calls this once, when you register the webhook URL in their
   * dashboard, to prove you control this endpoint.
   */
  async verify(ctx: Context) {
    const mode = ctx.query['hub.mode'];
    const token = ctx.query['hub.verify_token'];
    const challenge = ctx.query['hub.challenge'];
    const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN;

    if (mode === 'subscribe' && expectedToken && token === expectedToken) {
      ctx.status = 200;
      ctx.body = challenge;
      return;
    }
    strapi.log.warn('[whatsapp-webhook] Verification request rejected (mode/token mismatch).');
    ctx.status = 403;
    ctx.body = 'Verification failed';
  },

  /**
   * Meta calls this for every event (messages, delivery receipts, etc.).
   * Must always respond 200 quickly — Meta disables webhooks that fail or
   * time out repeatedly — so processing failures are logged, never thrown.
   */
  async receive(ctx: Context) {
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    const signatureHeader = ctx.request.headers['x-hub-signature-256'] as string | undefined;

    if (appSecret) {
      const raw = (ctx.request.body as Record<symbol, unknown> | undefined)?.[UNPARSED_BODY];
      const rawString = typeof raw === 'string' ? raw : raw instanceof Buffer ? raw.toString('utf8') : null;

      if (!rawString || !signatureHeader) {
        strapi.log.warn('[whatsapp-webhook] Missing raw body or X-Hub-Signature-256 header — rejecting.');
        ctx.status = 401;
        ctx.body = 'Missing signature';
        return;
      }

      const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawString).digest('hex');
      const sigBuf = Buffer.from(signatureHeader);
      const expBuf = Buffer.from(expected);
      const isValid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);

      if (!isValid) {
        strapi.log.warn('[whatsapp-webhook] Signature verification failed — rejecting.');
        ctx.status = 401;
        ctx.body = 'Invalid signature';
        return;
      }
    } else {
      strapi.log.warn(
        '[whatsapp-webhook] WHATSAPP_APP_SECRET not set — skipping signature verification. ' +
          'Fine for local testing only; set this before pointing a real Meta webhook here.'
      );
    }

    try {
      const payload = ctx.request.body as any;
      const entries = payload?.entry ?? [];
      for (const entry of entries) {
        const changes = entry?.changes ?? [];
        for (const change of changes) {
          const messages = change?.value?.messages ?? [];
          for (const message of messages) {
            await logIncomingMessage(strapi, message);
          }
        }
      }
    } catch (err) {
      strapi.log.error('[whatsapp-webhook] Failed to process payload:', err);
    }

    ctx.status = 200;
    ctx.body = 'EVENT_RECEIVED';
  },
});

async function logIncomingMessage(strapi: Core.Strapi, message: any) {
  const fromNumber: string | undefined = message?.from;
  const text: string | undefined = message?.text?.body;
  if (!fromNumber || !text) return;

  // WhatsApp sends numbers without a leading "+" (e.g. "923001234567").
  // student.whatsapp may have been entered with or without one, or with
  // spaces/dashes — match loosely against all plausible stored forms.
  const digitsOnly = fromNumber.replace(/\D/g, '');
  const student: any = await strapi.db.query('api::student.student').findOne({
    where: { $or: [{ whatsapp: fromNumber }, { whatsapp: `+${digitsOnly}` }, { whatsapp: digitsOnly }] },
  });

  if (!student) {
    strapi.log.info(`[whatsapp-webhook] No student matches WhatsApp number ${fromNumber} — message not logged.`);
    return;
  }

  await strapi.db.query('api::note.note').create({
    data: { student: student.id, author: fromNumber, body: text, channel: 'WhatsApp' },
  });
  strapi.log.info(`[whatsapp-webhook] Logged inbound WhatsApp message for student ${student.id}.`);
}
