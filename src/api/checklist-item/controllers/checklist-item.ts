import { factories } from '@strapi/strapi';

/**
 * Same self-scoping pattern as document/controllers/document.ts: a student
 * only ever sees their own checklist items, resolved from their own
 * account rather than trusted from the request.
 */

const CODE_TO_DOCUMENT_TYPE: Record<string, string> = {
  'academic-history': 'Transcript',
  'degree-status': 'DegreeTranscript',
  'language-evidence': 'EnglishCertificate',
  cv: 'CV',
};

async function resolveOwnStudent(ctx: { state: { user?: { id: number } } }) {
  if (!ctx.state.user) return null;
  return strapi.db
    .query('api::student.student')
    .findOne({ where: { portalUser: ctx.state.user.id } }) as Promise<{ id: number } | null>;
}

export default factories.createCoreController('api::checklist-item.checklist-item', ({ strapi }) => ({
  async find(ctx) {
    const own = await resolveOwnStudent(ctx);
    if (ctx.state.user) {
      ctx.query = {
        ...ctx.query,
        filters: { ...(ctx.query.filters as Record<string, unknown>), student: own?.id ?? -1 },
      };
    }
    return super.find(ctx);
  },

  /**
   * Replace: uploads a fresh document for this checklist item (the file
   * itself must already be uploaded via the standard /api/upload endpoint
   * first — same two-step pattern as the existing document upload flow in
   * the frontend's uploadDocument()). The old document, if any, is kept
   * (supersededAt set) as an audit trail rather than deleted. Immediately
   * sets the item to Uploaded, which invalidates readiness.
   */
  async replace(ctx) {
    const own = await resolveOwnStudent(ctx);
    if (!own) return ctx.forbidden('No student record linked to this account.');

    const item = (await strapi.db.query('api::checklist-item.checklist-item').findOne({
      where: { id: ctx.params.id, student: own.id },
      populate: ['document'],
    })) as { id: number; code: string; document?: { id: number } | null } | null;
    if (!item) return ctx.notFound('Checklist item not found.');

    const body = ctx.request.body as { fileId?: number };
    if (!body.fileId) return ctx.badRequest('fileId is required — upload the file via /api/upload first.');

    if (item.document) {
      await strapi.db.query('api::document.document').update({
        where: { id: item.document.id },
        data: { supersededAt: new Date().toISOString() },
      });
    }

    const newDocument = await strapi.db.query('api::document.document').create({
      data: {
        student: own.id,
        type: CODE_TO_DOCUMENT_TYPE[item.code] ?? 'Other',
        file: body.fileId,
        documentStatus: 'Received',
      },
    });

    const updated = await strapi.db.query('api::checklist-item.checklist-item').update({
      where: { id: item.id },
      data: {
        document: (newDocument as { id: number }).id,
        status: 'Uploaded',
        conditionalRouteSelected: null,
      },
    });

    ctx.send({ data: updated });
  },

  /** Mirrors the existing document help-request pattern (src/api/document/controllers/document.ts). */
  async requestHelp(ctx) {
    const own = await resolveOwnStudent(ctx);
    if (!own) return ctx.forbidden('No student record linked to this account.');

    const item = await strapi.db
      .query('api::checklist-item.checklist-item')
      .findOne({ where: { id: ctx.params.id, student: own.id } });
    if (!item) return ctx.notFound('Checklist item not found.');

    const body = ctx.request.body as { note?: string };
    const updated = await strapi.db.query('api::checklist-item.checklist-item').update({
      where: { id: (item as { id: number }).id },
      data: { status: 'HumanReview', reviewNote: body.note ?? null },
    });

    ctx.send({ data: updated });
  },
}));
