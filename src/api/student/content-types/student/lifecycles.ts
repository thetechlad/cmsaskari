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
  async afterCreate(event: { result: { id: number } }) {
    const studentId = event.result.id;
    for (const step of PROCESS_STEP_TEMPLATE) {
      await strapi.db.query('api::process-step.process-step').create({
        data: { student: studentId, title: step.title, order: step.order, stepStatus: 'NotStarted' },
      });
    }
  },
};
