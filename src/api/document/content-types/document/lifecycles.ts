/**
 * When a document is created with documentStatus "HelpRequested" (a student
 * saying "I don't have this, please help me get it"), auto-create a task for
 * their assigned advisor so it surfaces in a to-do list rather than only
 * being visible if an advisor happens to browse the documents table. This is
 * a lifecycle hook (not controller-specific logic) so it fires regardless of
 * whether the document was created via the student portal or the admin panel.
 */

function dueInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Strapi 5 normalizes a manyToOne relation in create input into
 * `{ set: [{ id: N }] }` by the time it reaches this lifecycle (confirmed by
 * logging event.params — it is NOT a plain number, despite the controller
 * setting `data.student = myStudent.id` as one). Handles both that shape and
 * a plain number, in case a future caller (e.g. admin panel) sends it differently.
 */
function extractRelationId(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object') {
    const v = value as { set?: { id: number }[]; connect?: { id: number }[] };
    const entry = v.set?.[0] ?? v.connect?.[0];
    if (entry?.id) return entry.id;
  }
  return undefined;
}

export default {
  async afterCreate(event: {
    result: { id: number; documentStatus: string; type: string };
    params: { data: { student?: unknown } };
  }) {
    const { result, params } = event;
    if (result.documentStatus !== 'HelpRequested') return;

    // Relation fields are NOT included in a lifecycle's `result` object (only
    // the entity's own scalar fields are) — the `student` relation id has to
    // come from the original create input instead, via `event.params.data`.
    const studentId = extractRelationId(params?.data?.student);
    if (!studentId) return;

    const student: any = await strapi.db.query('api::student.student').findOne({ where: { id: studentId } });
    if (!student) return;

    await strapi.db.query('api::task.task').create({
      data: {
        title: `Help ${student.firstName} ${student.lastName || ''}`.trim() + ` obtain: ${result.type}`,
        student: student.id,
        assignedAdvisor: student.assignedAdvisor,
        priority: 'Normal',
        dueDate: dueInDays(3),
        done: false,
      },
    });
  },
};
