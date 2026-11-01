// Strapi normally auto-generates content-manager list/edit layout config for
// every content type on boot. After many schema changes in one dev session,
// several custom content types (student, process-step, document, application,
// task, note, lead, social-post, visa-approval) ended up with no config row in
// strapi_core_store_settings, which hangs the Content Manager's list view
// forever (it never even issues the entries-fetch request). This calls the
// content-manager plugin's own sync method directly to regenerate them.
// Usage: node scripts/sync-content-manager-config.cjs
const { createStrapi } = require('@strapi/strapi');

async function main() {
  const app = await createStrapi({ distDir: './dist' }).load();
  try {
    const configService = app.plugin('content-manager').service('content-types');
    console.log('Running syncConfigurations...');
    await configService.syncConfigurations();
    console.log('Done.');

    const rows = await app.db.query('strapi::core-store').findMany({
      where: { key: { $contains: 'plugin_content_manager_configuration_content_types::api::' } },
    });
    console.log(
      'Configured content types now:',
      rows.map((r) => r.key.replace('plugin_content_manager_configuration_content_types::', ''))
    );
  } catch (err) {
    console.error('FAILED:', err);
  } finally {
    await app.destroy();
    process.exit(0);
  }
}

main();
