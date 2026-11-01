// One-off: uploads the real "Visa Approved" poster photos and attaches each
// to its matching visa-approval record, matched by studentName. Images are
// pre-resized to /Users/tayyabirfan/askari-content/visa-approval-photos by
// /tmp/resize_posters.py (2160x2700 source PNGs -> 1200px-wide JPEGs).
// Usage: node scripts/attach-visa-approval-photos.cjs
const path = require('path');
const fs = require('fs');
const { createStrapi } = require('@strapi/strapi');

const PHOTO_DIR = '/Users/tayyabirfan/askari-content/visa-approval-photos';

// Maps each visa-approval studentName to its photo filename in PHOTO_DIR.
const NAME_TO_FILE = {
  'Muhammad Waqas Qazi': 'Muhammad Waqas Qazi — visa.jpg',
  'Muhammad Umar Iqbal Khan': 'Muhammad Umar Iqbal Khan — visa.jpg',
  'Javed Javed': 'Javed Javed — photo with visa.jpg',
  'Kulsoom Latif': 'Kulsoom Latif — visa.jpg',
  'Hamza Yaqoob': 'Hamza Yaqoob — passport photo.jpg',
  'Faizan Ahmed Khan': 'Faizan Ahmed Khan — photo with visa.jpg',
  'Salman': 'Salman — passport photo.jpg',
  'Muhammad Sarim Kirmani': 'Muhammad Sarim Kirmani — photo with visa.jpg',
  'Namrah Hussain': 'Namrah Hussain — no photo.jpg',
  'Sami Sultan': 'Sami Sultan — passport photo.jpg',
  'Saad Raza': 'Saad Raza — passport photo.jpg',
  'Ali Hamza': 'Ali Hamza — photo with visa.jpg',
  'Abdul Rafeh': 'Abdul Rafeh — passport photo.jpg',
  'Muhammad Waleed Ali': 'Muhammad Waleed Ali — passport photo.jpg',
  'Ansharah Fatima': 'Ansharah Fatima — no photo.jpg',
  'Muhammad Awaab Ali': 'Muhammad Awaab Ali — photo with visa.jpg',
  'Tayyab Irfan': 'Tayyab Irfan — photo with visa.jpg',
};

async function main() {
  const app = await createStrapi({ distDir: './dist' }).load();
  try {
    const approvals = await app.db.query('api::visa-approval.visa-approval').findMany({ populate: ['photo'] });
    let attached = 0;
    let skipped = 0;

    for (const approval of approvals) {
      if (approval.photo) {
        console.log(`SKIP (already has photo): ${approval.studentName}`);
        skipped++;
        continue;
      }
      const filename = NAME_TO_FILE[approval.studentName];
      if (!filename) {
        console.log(`NO MAPPING: ${approval.studentName}`);
        continue;
      }
      const filePath = path.join(PHOTO_DIR, filename);
      if (!fs.existsSync(filePath)) {
        console.log(`FILE MISSING: ${filePath}`);
        continue;
      }

      const stats = fs.statSync(filePath);
      const uploadService = app.plugin('upload').service('upload');
      const [uploadedFile] = await uploadService.upload({
        data: {
          fileInfo: {
            alternativeText: `${approval.studentName} — Italy student visa approved`,
            caption: `${approval.studentName}${approval.university ? ' — ' + approval.university : ''}`,
          },
        },
        files: {
          filepath: filePath,
          originalFilename: filename,
          mimetype: 'image/jpeg',
          size: stats.size,
        },
      });

      await app.db.query('api::visa-approval.visa-approval').update({
        where: { id: approval.id },
        data: { photo: uploadedFile.id },
      });

      console.log(`ATTACHED: ${approval.studentName} -> ${filename} (media id ${uploadedFile.id})`);
      attached++;
    }

    console.log(`\nDone. Attached: ${attached}, already had photo: ${skipped}, total: ${approvals.length}`);
  } catch (err) {
    console.error('FAILED:', err);
  } finally {
    await app.destroy();
    process.exit(0);
  }
}

main();
