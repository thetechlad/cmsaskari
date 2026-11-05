import { factories } from '@strapi/strapi';

/**
 * Applications are only ever created/moved by a student via the sanctioned
 * custom actions (createMine, moveMine) or by an advisor through the Strapi
 * Admin Panel (a separate route tree). No default create/update/delete
 * exposed to the Student role here.
 */
export default factories.createCoreRouter('api::application.application', {
  only: ['find', 'findOne'],
});
