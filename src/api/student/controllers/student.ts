import { factories } from '@strapi/strapi';

/**
 * The public REST API (/api/students) is only reachable by the "Student"
 * users-permissions role (see setupStudentPortalRole in src/seed.ts) — the
 * Public role has zero permissions here. So any authenticated ctx.state.user
 * hitting these routes is a student, and must only ever see their own record.
 * This is separate from, and does not affect, the Strapi admin panel's
 * Content Manager access used by Advisors (a different route tree entirely).
 */
export default factories.createCoreController('api::student.student', ({ strapi }) => ({
  async find(ctx) {
    if (ctx.state.user) {
      // Filtering by the `portalUser` relation itself would require the
      // Student role to also have `find` access to plugin::users-permissions.user
      // (Strapi's query validator checks permission on a relation's target
      // type, not just the current one) — deliberately not granting that
      // broader access. Resolving the caller's own record via a direct DB
      // query first, then filtering by the scalar `id`, avoids the issue
      // entirely and keeps the Student role's permissions minimal.
      const own: any = await strapi.db
        .query('api::student.student')
        .findOne({ where: { portalUser: ctx.state.user.id } });
      ctx.query = {
        ...ctx.query,
        filters: { ...(ctx.query.filters as Record<string, unknown>), id: own?.id ?? -1 },
      };
    }
    return super.find(ctx);
  },

  async findOne(ctx) {
    const { id } = ctx.params;
    if (ctx.state.user) {
      const record: any = await strapi.documents('api::student.student').findOne({
        documentId: id,
        populate: ['portalUser'],
      });
      if (!record || record.portalUser?.id !== ctx.state.user.id) {
        return ctx.forbidden();
      }
    }
    return super.findOne(ctx);
  },
}));
