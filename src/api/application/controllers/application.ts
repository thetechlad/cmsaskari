import { factories } from '@strapi/strapi';

const STUDENT_MOVABLE_STATUSES = ['Draft', 'InProgress', 'Submitted'] as const;
type StudentMovableStatus = (typeof STUDENT_MOVABLE_STATUSES)[number];

async function resolveOwnStudent(ctx: { state: { user?: { id: number } } }) {
  if (!ctx.state.user) return null;
  return strapi.db.query('api::student.student').findOne({
    where: { portalUser: ctx.state.user.id },
  }) as Promise<{ id: number } | null>;
}

/**
 * Public API access is Student-role only (see student/controllers/student.ts
 * for the full explanation of why this is safe to assume for any ctx.state.user
 * here). A student may only ever see applications belonging to their own
 * student record.
 */
export default factories.createCoreController('api::application.application', ({ strapi }) => ({
  async find(ctx) {
    if (ctx.state.user) {
      // Filtering by student.portalUser (a relation nested inside a relation)
      // would require the Student role to also have `find` access to
      // plugin::users-permissions.user, which is deliberately not granted.
      // Resolve the caller's own student id internally first instead.
      const own: any = await strapi.db
        .query('api::student.student')
        .findOne({ where: { portalUser: ctx.state.user.id } });
      ctx.query = {
        ...ctx.query,
        filters: { ...(ctx.query.filters as Record<string, unknown>), student: own?.id ?? -1 },
      };
    }
    return super.find(ctx);
  },

  /**
   * Student self-service: add a program to their own application tracker
   * (kanban "To Apply" column) straight from a match result. Always lands in
   * Draft — the advisor takes over filing the real application from there.
   * Never lets the caller set an outcome status directly.
   */
  async createMine(ctx) {
    const student = await resolveOwnStudent(ctx);
    if (!student) return ctx.forbidden('No student record linked to this account.');

    const body = ctx.request.body as { universityId?: number; mastersProgramId?: number; bachelorsProgramId?: number };
    if (!body.universityId || (!body.mastersProgramId && !body.bachelorsProgramId)) {
      return ctx.badRequest('universityId and one of mastersProgramId/bachelorsProgramId are required.');
    }

    const created = await strapi.db.query('api::application.application').create({
      data: {
        student: student.id,
        university: body.universityId,
        mastersProgram: body.mastersProgramId ?? null,
        bachelorsProgram: body.bachelorsProgramId ?? null,
        applicationStatus: 'Draft',
      },
    });

    return ctx.send({ data: created });
  },

  /**
   * Student self-service: move a kanban card among the three statuses the
   * student actually controls (Draft/InProgress/Submitted — "To Apply" /
   * "Currently Applying" / "Applied"). OfferReceived/Rejected/Enrolled are
   * advisor-exclusive outcomes, set only via the Strapi Admin Panel (a
   * separate route tree, unaffected by this restriction).
   */
  async moveMine(ctx) {
    const student = await resolveOwnStudent(ctx);
    if (!student) return ctx.forbidden('No student record linked to this account.');

    const { id } = ctx.params;
    const { applicationStatus } = ctx.request.body as { applicationStatus?: string };
    if (!STUDENT_MOVABLE_STATUSES.includes(applicationStatus as StudentMovableStatus)) {
      return ctx.badRequest('applicationStatus must be one of Draft, InProgress, Submitted.');
    }

    const existing = (await strapi.db.query('api::application.application').findOne({
      where: { id, student: student.id },
    })) as { id: number; applicationStatus: string } | null;
    if (!existing) {
      return ctx.forbidden('Not your application.');
    }
    if (!STUDENT_MOVABLE_STATUSES.includes(existing.applicationStatus as StudentMovableStatus)) {
      return ctx.badRequest('This application has already moved to an advisor-managed outcome and can no longer be moved here.');
    }

    const data: Record<string, unknown> = { applicationStatus };
    if (applicationStatus === 'Submitted' && !((existing as any).submittedAt)) {
      data.submittedAt = new Date().toISOString().slice(0, 10);
    }

    const updated = await strapi.db.query('api::application.application').update({
      where: { id: existing.id },
      data,
    });

    return ctx.send({ data: updated });
  },
}));
