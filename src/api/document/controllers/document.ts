import { factories } from '@strapi/strapi';

/**
 * Public API access is Student-role only (see student/controllers/student.ts
 * for why this is safe to assume for any ctx.state.user here). A student may
 * only ever see and create documents belonging to their own student record —
 * the `student` relation on create is always forced server-side from the
 * caller's own account, never trusted from the request body.
 */
export default factories.createCoreController('api::document.document', ({ strapi }) => ({
  async find(ctx) {
    if (ctx.state.user) {
      // Same reasoning as application/controllers/application.ts: avoid a
      // nested student.portalUser relation filter (would need Student role
      // access to plugin::users-permissions.user) by resolving the caller's
      // own student id internally first.
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

  async create(ctx) {
    if (ctx.state.user) {
      const myStudent = await strapi.db.query('api::student.student').findOne({
        where: { portalUser: ctx.state.user.id },
      });
      if (!myStudent) {
        return ctx.forbidden('No student record linked to this account.');
      }
      const body = ctx.request.body as any;
      // Students can only ever create a document in one of two states: a
      // real upload (always lands as "Received", pending advisor review) or
      // a help request (explicitly asking for help, no file attached) —
      // never "Verified" or "Requested", which stay advisor-only.
      const isHelpRequest = body.data?.documentStatus === 'HelpRequested' && !body.data?.file;
      body.data = {
        ...(body.data || {}),
        student: myStudent.id,
        documentStatus: isHelpRequest ? 'HelpRequested' : 'Received',
      };
    }
    return super.create(ctx);
  },
}));
