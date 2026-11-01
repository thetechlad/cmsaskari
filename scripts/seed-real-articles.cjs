// Seeds the 4 real SEO articles (scripts/seed-real-articles-data.cjs) as
// blog posts, skipping any slug that already exists. Run with the dev server
// stopped (direct DB access via app context).
// Usage: node scripts/seed-real-articles.cjs
const { createStrapi } = require('@strapi/strapi');
const articles = require('./seed-real-articles-data.cjs');

async function main() {
  const app = await createStrapi({ distDir: './dist' }).load();
  try {
    const existingCount = await app.db.query('api::blog-post.blog-post').count({});
    let order = existingCount + 1;
    let created = 0;

    for (const article of articles) {
      const existing = await app.db.query('api::blog-post.blog-post').findOne({ where: { slug: article.slug } });
      if (existing) {
        console.log(`SKIP (exists): ${article.slug}`);
        continue;
      }
      await app.db.query('api::blog-post.blog-post').create({
        data: { ...article, order },
      });
      console.log(`CREATED: ${article.slug}`);
      order++;
      created++;
    }
    console.log(`\nDone. Created ${created} of ${articles.length} articles.`);
  } catch (err) {
    console.error('FAILED:', err);
  } finally {
    await app.destroy();
    process.exit(0);
  }
}

main();
