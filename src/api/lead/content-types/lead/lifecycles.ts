/**
 * Bridges the agency's intake funnel into the advisor pipeline: ticking
 * "Convert to Student" on a lead (in the same Content Manager screen an
 * advisor already reviews leads in) creates the Student record instead of
 * them re-typing name/email/WhatsApp/intake by hand into a second form.
 * The new student's own afterCreate lifecycle still auto-generates its
 * 8-step process template, so one checkbox produces a fully working pipeline
 * entry. Guarded against double-conversion (flip true, false, true again)
 * by checking for an existing student whose sourceLead already points here.
 */

function splitName(full: string | undefined): { firstName: string; lastName: string } {
  const parts = (full ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: 'Unknown', lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

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
      message?: string;
      source?: string;
    };
  }) {
    const { result } = event;
    if (!result.convertToStudent) return;

    const alreadyConverted = await strapi.db
      .query('api::student.student')
      .findOne({ where: { sourceLead: result.id } });
    if (alreadyConverted) return;

    const { firstName, lastName } = splitName(result.name);

    await strapi.db.query('api::student.student').create({
      data: {
        firstName,
        lastName,
        email: result.email,
        whatsapp: result.whatsapp,
        targetIntake: result.intake,
        notes: result.message ? `From website lead (source: ${result.source ?? 'unknown'}):\n${result.message}` : undefined,
        sourceLead: result.id,
        stage: 'New',
      },
    });

    if (!result.handled) {
      await strapi.db.query('api::lead.lead').update({ where: { id: result.id }, data: { handled: true } });
    }
  },
};
