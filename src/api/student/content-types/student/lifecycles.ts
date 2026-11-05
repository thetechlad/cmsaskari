/**
 * Auto-creates the fixed process-step template for every new student, so
 * advisors fill in status/details on existing steps rather than building a
 * step list from scratch per student. Verified this file-location convention
 * (a file dropped alongside schema.json in a content-type's own folder gets
 * loaded and merged under that filename) by reading
 * node_modules/@strapi/core/dist/loaders/apis.js — no separate registration
 * needed anywhere else.
 */

const PROCESS_STEP_TEMPLATE = [
  { title: 'Eligibility & Profile Review', order: 1 },
  { title: 'Document Collection', order: 2 },
  { title: 'University Application Submitted', order: 3 },
  { title: 'Offer / Admission Decision', order: 4 },
  { title: 'Visa Document Preparation', order: 5 },
  { title: 'Visa Appointment & Filing', order: 6 },
  { title: 'Visa Decision', order: 7 },
  { title: 'Arrival & Enrolment', order: 8 },
];

export default {
  async afterCreate(event: { result: { id: number; level?: string } }) {
    const studentId = event.result.id;
    for (const step of PROCESS_STEP_TEMPLATE) {
      await strapi.db.query('api::process-step.process-step').create({
        data: { student: studentId, title: step.title, order: step.order, stepStatus: 'NotStarted' },
      });
    }

    // Instantiate the active pilot checklist template into per-student
    // checklist-item rows. code/label/required are denormalized here so a
    // later template edit never retroactively changes an in-flight
    // student's checklist (see checklist-item schema description).
    const templateQuery: Record<string, unknown> = { active: true };
    if (event.result.level) templateQuery.level = event.result.level;
    const template = (await strapi.db
      .query('api::checklist-template.checklist-template')
      .findOne({ where: templateQuery, populate: ['items'] })) as {
      id: number;
      items: { code: string; label: string; required: boolean; conditionalRoute?: string }[];
    } | null;

    if (template) {
      for (const item of template.items) {
        await strapi.db.query('api::checklist-item.checklist-item').create({
          data: {
            student: studentId,
            template: template.id,
            code: item.code,
            label: item.label,
            required: item.required,
            status: 'Required',
          },
        });
      }
    } else {
      strapi.log.warn(`[provision] No active checklist-template found for new student ${studentId} — checklist left empty.`);
    }
  },
};
