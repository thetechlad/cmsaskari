import { factories } from '@strapi/strapi';

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
}));
