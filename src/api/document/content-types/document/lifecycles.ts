/**
 * When an advisor marks a document Verified (from the admin Content
 * Manager — this is a DB-layer lifecycle specifically so it fires
 * regardless of write path, same reasoning as lead/content-types/lead/
 * lifecycles.ts), flip its linked checklist-item (if any) to Checked.
 * Documents not tied to a checklist item (the pre-existing generic
 * advisor-managed document trail) are unaffected.
 */
export default {
  async afterUpdate(event: { result: { id: number; documentStatus?: string } }) {
    const { result } = event;
    if (result.documentStatus !== 'Verified') return;

    const doc = (await strapi.db
      .query('api::document.document')
      .findOne({ where: { id: result.id }, populate: ['checklistItem'] })) as {
      checklistItem?: { id: number } | null;
    } | null;

    if (!doc?.checklistItem) return;

    await strapi.db.query('api::checklist-item.checklist-item').update({
      where: { id: doc.checklistItem.id },
      data: { status: 'Checked', checkedAt: new Date().toISOString() },
    });
  },
};
