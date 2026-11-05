/**
 * Bridges the agency's intake funnel into the advisor pipeline: ticking
 * "Convert to Student" on a lead (in the same Content Manager screen an
 * advisor already reviews leads in) creates the Student record instead of
 * them re-typing name/email/WhatsApp/intake by hand into a second form.
 * The new student's own afterCreate lifecycle still auto-generates its
 * 8-step process template, so one checkbox produces a fully working pipeline
 * entry. Guarded against double-conversion (flip true, false, true again)
 * via provision.createStudentFromLead's own sourceLead existence check.
 *
 * This is the legacy, advisor-gated path — it does NOT create a portal
 * login or grant wallet credits (those only happen via the self-service
 * verified-lead flow, see lead/controllers/lead.ts verifyLead). The student
 * record it produces is identical either way; an advisor can still wire up
 * portal access manually later if needed.
 */
export default {
  async afterUpdate(event: {
    result: {
      id: number;
      convertToStudent: boolean;
      handled: boolean;
      name?: string;
      email?: string;
      whatsapp?: string;
      intake?: string;
      intendedDegree?: 'Bachelors' | 'Masters';
      message?: string;
      source?: string;
    };
  }) {
    const { result } = event;
    if (!result.convertToStudent) return;

    const provision = strapi.service('api::student.provision') as {
      createStudentFromLead: (lead: typeof result) => Promise<number>;
    };
    await provision.createStudentFromLead(result);

    if (!result.handled) {
      await strapi.db.query('api::lead.lead').update({ where: { id: result.id }, data: { handled: true } });
    }
  },
};
