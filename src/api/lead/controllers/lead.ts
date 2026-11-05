import { factories } from '@strapi/strapi';
import crypto from 'crypto';

/**
 * Verified-lead capture for the matching feature. Delivery of the
 * verification code is STUBBED — it's logged server-side, not actually
 * emailed, because no real email provider is configured yet (see
 * config/plugins.ts). This is explicitly not production-ready; wiring a
 * real provider is a follow-up task before real students use this flow.
 *
 * `create` always issues/rotates a code for the given email, whether it's a
 * brand-new lead or a returning one — verifying always re-proves current
 * access to the contact channel (never skip straight to a JWT just because
 * a lead row already exists, that would be an account-takeover hole).
 * Returning students land back on their SAME student/wallet records: both
 * provision.createStudentFromLead and wallet.grantInitialCredits are
 * idempotent on the lead/dedupeKey, so re-verifying never creates a
 * duplicate Student or re-grants credits.
 */

const CODE_TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function generateCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export default factories.createCoreController('api::lead.lead', ({ strapi }) => ({
  async create(ctx) {
    const body = ctx.request.body as { data?: Record<string, unknown> };
    const data = body.data ?? {};
    const email = typeof data.email === 'string' ? data.email : '';
    if (!email.trim()) {
      return ctx.badRequest('An email address is required.');
    }

    const dedupeKey = normalizeEmail(email);
    const code = generateCode();
    const codeHash = hashCode(code);
    const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();

    const existing = (await strapi.db
      .query('api::lead.lead')
      .findOne({ where: { dedupeKey } })) as { id: number } | null;

    const leadData = {
      name: data.name,
      email,
      whatsapp: data.whatsapp,
      intake: data.intake,
      intendedDegree: data.intendedDegree,
      message: data.message,
      source: data.source,
      dedupeKey,
      verificationCodeHash: codeHash,
      verificationExpiresAt: expiresAt,
      verificationAttempts: 0,
    };

    const lead = existing
      ? await strapi.db.query('api::lead.lead').update({ where: { id: existing.id }, data: leadData })
      : await strapi.db.query('api::lead.lead').create({ data: leadData });

    // STUB: real delivery (email/SMS) not wired up yet — see note above.
    strapi.log.info(`[lead-verify] Verification code for ${email}: ${code} (expires ${expiresAt})`);

    ctx.send({ data: { id: (lead as { id: number }).id, email } });
  },

  async verifyLead(ctx) {
    const body = ctx.request.body as { email?: string; code?: string };
    const email = typeof body.email === 'string' ? body.email : '';
    const code = typeof body.code === 'string' ? body.code : '';
    if (!email.trim() || !code.trim()) {
      return ctx.badRequest('Email and code are required.');
    }

    const dedupeKey = normalizeEmail(email);
    const lead = (await strapi.db.query('api::lead.lead').findOne({ where: { dedupeKey } })) as {
      id: number;
      name?: string;
      whatsapp?: string;
      intake?: string;
      intendedDegree?: 'Bachelors' | 'Masters';
      message?: string;
      source?: string;
      verificationCodeHash?: string;
      verificationExpiresAt?: string;
      verificationAttempts: number;
    } | null;

    if (!lead || !lead.verificationCodeHash || !lead.verificationExpiresAt) {
      return ctx.badRequest('No pending verification for this email.');
    }

    if (new Date(lead.verificationExpiresAt).getTime() < Date.now()) {
      return ctx.badRequest('This code has expired — request a new one.');
    }

    if (lead.verificationAttempts >= MAX_ATTEMPTS) {
      return ctx.badRequest('Too many attempts — request a new code.');
    }

    const matches = timingSafeEqualHex(hashCode(code.trim()), lead.verificationCodeHash);
    if (!matches) {
      await strapi.db
        .query('api::lead.lead')
        .update({ where: { id: lead.id }, data: { verificationAttempts: lead.verificationAttempts + 1 } });
      return ctx.badRequest('Incorrect code.');
    }

    const now = new Date().toISOString();
    await strapi.db.query('api::lead.lead').update({
      where: { id: lead.id },
      data: {
        verifiedAt: now,
        verificationCodeHash: null,
        verificationExpiresAt: null,
        handled: true,
      },
    });

    const provision = strapi.service('api::student.provision') as {
      createStudentFromLead: (lead: unknown) => Promise<number>;
      ensurePortalUser: (studentId: number, email: string) => Promise<{ id: number }>;
      issuePortalJwt: (userId: number) => Promise<string>;
    };
    const wallet = strapi.service('api::student.wallet') as {
      grantInitialCredits: (studentId: number, dedupeKey: string) => Promise<number>;
    };

    const studentId = await provision.createStudentFromLead({ ...lead, email });
    await strapi.db.query('api::student.student').update({ where: { id: studentId }, data: { verifiedAt: now } });
    const portalUser = await provision.ensurePortalUser(studentId, email);
    const creditBalance = await wallet.grantInitialCredits(studentId, dedupeKey);
    const jwt = await provision.issuePortalJwt(portalUser.id);

    ctx.send({ jwt, creditBalance });
  },
}));
