import { factories } from '@strapi/strapi';

/**
 * Public API access is Student-role only (see student/controllers/student.ts
 * for why this is safe to assume for any ctx.state.user here). A student may
 * only ever see process steps belonging to their own student record. There
 * is no create/update/delete override here because those actions are never
 * granted to the Student role at all — steps are advisor-managed only.
 */
export default factories.createCoreController('api::process-step.process-step', ({ strapi }) => ({
  async find(ctx) {
    if (ctx.state.user) {
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
}));
