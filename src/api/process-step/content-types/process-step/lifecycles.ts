/**
 * Two automations that keep the student's high-level `stage` (what shows in
 * list views, filters, and the student's own dashboard pill) in sync with
 * the detailed process-step timeline underneath it, instead of advisors
 * having to update both separately:
 *
 * 1. Completing a step that maps to a stage milestone auto-advances
 *    `student.stage` — but only forward, and never out of a terminal state
 *    (Lost/VisaRefused) an advisor set deliberately.
 * 2. Marking a step Blocked auto-creates a task for the assigned advisor,
 *    mirroring the document help-request -> task pattern already used
 *    elsewhere in this API, so a blocker surfaces on a to-do list rather
 *    than only being visible if someone happens to open that student.
 */

const STAGE_ORDER = [
  'New',
  'Contacted',
  'ConsultationBooked',
  'DocumentsCollecting',
  'ApplicationSubmitted',
  'VisaFiled',
  'VisaApproved',
  'Enrolled',
] as const;

// Terminal states an advisor sets by hand — automation never overrides these.
const TERMINAL_STAGES = new Set(['Lost', 'VisaRefused']);

// Completing the step at this `order` implies the student has reached at
// least this stage. Steps without an entry (1, 4, 5) don't map cleanly to a
// single stage milestone, so they don't drive auto-advancement.
const STEP_ORDER_TO_STAGE: Record<number, (typeof STAGE_ORDER)[number]> = {
  2: 'DocumentsCollecting',
  3: 'ApplicationSubmitted',
  6: 'VisaFiled',
  7: 'VisaApproved',
  8: 'Enrolled',
};

function dueInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function extractRelationId(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object') {
    const v = value as { set?: { id: number }[]; connect?: { id: number }[] };
    const entry = v.set?.[0] ?? v.connect?.[0];
    if (entry?.id) return entry.id;
  }
  return undefined;
}

async function resolveStudentId(result: { id: number }, params: { data?: { student?: unknown } }) {
  const fromInput = extractRelationId(params?.data?.student);
  if (fromInput) return fromInput;
  // Plain field updates (e.g. just stepStatus) don't touch the student
  // relation, so it won't be in params.data — look it up from the row itself.
  const row: any = await strapi.db
    .query('api::process-step.process-step')
    .findOne({ where: { id: result.id }, populate: ['student'] });
  return row?.student?.id as number | undefined;
}

export default {
  async afterUpdate(event: {
    result: { id: number; order: number; stepStatus: string; title: string };
    params: { data?: { student?: unknown; stepStatus?: string } };
  }) {
    const { result, params } = event;
    if (!params?.data || params.data.stepStatus === undefined) return;

    const studentId = await resolveStudentId(result, params);
    if (!studentId) return;

    if (result.stepStatus === 'Completed') {
      const impliedStage = STEP_ORDER_TO_STAGE[result.order];
      if (!impliedStage) return;

      const student: any = await strapi.db
        .query('api::student.student')
        .findOne({ where: { id: studentId } });
      if (!student || TERMINAL_STAGES.has(student.stage)) return;

      const currentIdx = STAGE_ORDER.indexOf(student.stage);
      const impliedIdx = STAGE_ORDER.indexOf(impliedStage);
      if (impliedIdx > currentIdx) {
        await strapi.db
          .query('api::student.student')
          .update({ where: { id: studentId }, data: { stage: impliedStage } });
      }
      return;
    }

    if (result.stepStatus === 'Blocked') {
      const student: any = await strapi.db
        .query('api::student.student')
        .findOne({ where: { id: studentId } });
      if (!student) return;

      const existing = await strapi.db.query('api::task.task').findOne({
        where: { student: studentId, done: false, title: { $contains: result.title } },
      });
      if (existing) return; // don't spam a second task for the same blocked step

      await strapi.db.query('api::task.task').create({
        data: {
          title: `Unblock: ${student.firstName} ${student.lastName || ''}`.trim() + ` — ${result.title}`,
          student: studentId,
          assignedAdvisor: student.assignedAdvisor,
          priority: 'High',
          dueDate: dueInDays(2),
          done: false,
        },
      });
    }
  },
};
