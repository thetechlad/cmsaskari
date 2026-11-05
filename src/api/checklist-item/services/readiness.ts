/**
 * Readiness = verified lead + every required checklist item Checked + no
 * item stuck in NeedsReplacement/HumanReview. Always computed live from
 * current rows — never cached — so a credit reservation can never be made
 * against a stale snapshot (replacing/deleting evidence invalidates
 * readiness immediately just by changing the underlying row).
 */
export default {
  async isReadinessGateOpen(studentId: number): Promise<boolean> {
    const student = (await strapi.db
      .query('api::student.student')
      .findOne({ where: { id: studentId }, select: ['verifiedAt'] })) as { verifiedAt?: string | null } | null;
    if (!student?.verifiedAt) return false;

    const items = (await strapi.db.query('api::checklist-item.checklist-item').findMany({
      where: { student: studentId },
      select: ['required', 'status'],
    })) as { required: boolean; status: string }[];

    if (items.length === 0) return false;

    const blocking = items.some(
      (item) => item.status === 'NeedsReplacement' || item.status === 'HumanReview'
    );
    if (blocking) return false;

    const requiredUnchecked = items.some((item) => item.required && item.status !== 'Checked');
    return !requiredUnchecked;
  },
};
