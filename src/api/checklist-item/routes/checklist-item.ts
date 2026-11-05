import { factories } from '@strapi/strapi';

/**
 * Checklist items are only ever created server-side (student's afterCreate
 * lifecycle instantiates them from the active template) and only ever
 * transition status via the sanctioned custom actions (replace,
 * requestHelp) or an advisor verifying the linked document. No default
 * create/update/delete exposed to the Student role.
 */
export default factories.createCoreRouter('api::checklist-item.checklist-item', {
  only: ['find', 'findOne'],
});
