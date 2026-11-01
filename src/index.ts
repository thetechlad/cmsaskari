import type { Core } from '@strapi/strapi';
import { runSeed } from './seed';

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register({ strapi }: { strapi: Core.Strapi }) {
    // Row-level access for the Advisor role: without these, an "Advisor" scoped
    // to e.g. the Student content-type would see every student, not just their
    // own. These plug into Strapi's built-in permission-condition system (the
    // same mechanism behind the stock "Is creator" condition) so they show up
    // as ordinary checkboxes in Settings > Roles rather than needing custom
    // route/policy code.
    strapi.service('admin::permission').conditionProvider.registerMany([
      {
        displayName: 'Is assigned advisor',
        name: 'is-assigned-advisor',
        category: 'Askari CRM',
        handler: (user: { email: string }) => ({ assignedAdvisor: user.email }),
      },
      {
        displayName: 'Is assigned advisor (via student)',
        name: 'is-assigned-advisor-via-student',
        category: 'Askari CRM',
        handler: (user: { email: string }) => ({ student: { assignedAdvisor: user.email } }),
      },
    ]);
  },

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    await runSeed(strapi);
  },
};
